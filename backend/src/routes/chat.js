import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Student } from "../models/Student.js";

const router = express.Router();

export const AUTHORITIES = [
  {
    id: "W001",
    regNo: "warden123",
    name: "Boys Hostel Warden",
    role: "warden",
    avatar: "https://i.pravatar.cc/160?img=60",
    dept: "Boys Hostel Administration",
    wardenType: "Boys",
    title: "Mr. K. Kumar (Boys Warden)",
  },
  {
    id: "W002",
    regNo: "gwarden123",
    name: "Girls Hostel Warden",
    role: "warden",
    avatar: "https://i.pravatar.cc/160?img=47",
    dept: "Girls Hostel Administration",
    wardenType: "Girls",
    title: "Mrs. S. Meenakshi (Girls Warden)",
  },
  {
    id: "A001",
    regNo: "admin123",
    name: "System Administrator",
    role: "admin",
    avatar: "https://i.pravatar.cc/160?img=68",
    dept: "Hostel IT & Operations",
    title: "Mr. R. Arun (Chief Administrator)",
  },
];

// Helper to get all aliases for a user (e.g. W001 <-> warden123)
export function getUserAliases(user) {
  if (!user) return [];
  const id = typeof user === "string" ? user : user.id;
  const regNo = typeof user === "string" ? user : user.regNo;
  const role = typeof user === "object" ? user.role : undefined;

  const aliases = [id, regNo];
  const uid = String(id || regNo || "").trim().toLowerCase();

  if (uid === "w001" || uid === "warden123" || (role === "warden" && user.wardenType === "Boys")) {
    aliases.push("W001", "warden123");
  } else if (uid === "w002" || uid === "gwarden123" || (role === "warden" && user.wardenType === "Girls")) {
    aliases.push("W002", "gwarden123");
  } else if (uid === "a001" || uid === "admin123" || role === "admin") {
    aliases.push("A001", "admin123");
  }

  return [...new Set(aliases.filter(Boolean))];
}

// Helper to determine whether an ID or role belongs to an authority (Warden / Admin)
export function isAuthority(userId, role) {
  if (role === "admin" || role === "warden") return true;
  if (!userId) return false;
  const uid = String(userId).trim().toLowerCase();
  return (
    uid === "w001" ||
    uid === "warden123" ||
    uid === "w002" ||
    uid === "gwarden123" ||
    uid === "a001" ||
    uid === "admin123"
  );
}

// Helper to look up profile info (Student or Warden or Admin) by ID / regNo
export async function getUserProfile(userId) {
  const uid = String(userId || "").trim().toLowerCase();
  const matchedAuth = AUTHORITIES.find(
    (a) => a.id.toLowerCase() === uid || a.regNo.toLowerCase() === uid
  );
  if (matchedAuth) {
    return { ...matchedAuth };
  }

  // Look up student from MongoDB
  const student = await Student.findOne({
    $or: [{ id: userId }, { regNo: userId }],
  }).select("id regNo name email dept department avatar role hostel room");

  if (student) {
    const obj = student.toObject();
    obj.role = "student";
    if (!obj.avatar || obj.avatar.trim() === "") {
      obj.avatar = "/default-avatar.svg";
    }
    return obj;
  }

  return {
    id: userId,
    regNo: userId,
    name: userId,
    avatar: "/default-avatar.svg",
    dept: "Student",
    role: "student",
  };
}

// 1. Get all conversations for the logged in user
router.get("/conversations", verifyToken, async (req, res) => {
  try {
    const myAliases = getUserAliases(req.user);

    // Find any conversation that has any of this user's identifiers
    const conversations = await Conversation.find({
      participants: { $in: myAliases },
    }).sort({ updatedAt: -1 });

    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // Find other participant
        const otherParticipantId =
          conv.participants.find((p) => !myAliases.includes(p)) || conv.participants[0];
        const recipient = await getUserProfile(otherParticipantId);

        // Sum unread count across all aliases
        let unreadCount = 0;
        for (const alias of myAliases) {
          const count = conv.unreadCounts?.get?.(alias) || conv.unreadCounts?.[alias];
          if (count) unreadCount += count;
        }

        return {
          _id: conv._id,
          participants: conv.participants,
          recipient,
          lastMessage: conv.lastMessage || "",
          lastMessageSender: conv.lastMessageSender || "",
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      })
    );

    res.json(formattedConversations);
  } catch (error) {
    console.error("Get Conversations Error:", error);
    res.status(500).json({ error: "Failed to fetch conversations." });
  }
});

// 2. Start or get existing conversation with a user
router.post("/conversations", verifyToken, async (req, res) => {
  try {
    const myAliases = getUserAliases(req.user);
    const { targetId } = req.body;

    if (!targetId) {
      return res.status(400).json({ error: "targetId is required." });
    }

    if (myAliases.includes(targetId)) {
      return res.status(400).json({ error: "Cannot start a chat with yourself." });
    }

    const targetRecipient = await getUserProfile(targetId);
    const targetAliases = getUserAliases(targetRecipient);
    if (!targetAliases.includes(targetId)) targetAliases.push(targetId);

    // Find if a conversation already exists between any alias of me and target
    let conversation = await Conversation.findOne({
      $and: [
        { participants: { $in: myAliases } },
        { participants: { $in: targetAliases } },
      ],
    });

    if (!conversation) {
      const primaryMyId = req.user.id || req.user.regNo;
      const primaryTargetId = targetRecipient.id || targetId;

      conversation = new Conversation({
        participants: [primaryMyId, primaryTargetId],
        lastMessage: "",
        unreadCounts: { [primaryMyId]: 0, [primaryTargetId]: 0 },
      });
      await conversation.save();
    }

    res.status(200).json({
      _id: conversation._id,
      participants: conversation.participants,
      recipient: targetRecipient,
      lastMessage: conversation.lastMessage || "",
      updatedAt: conversation.updatedAt,
    });
  } catch (error) {
    console.error("Create Conversation Error:", error);
    res.status(500).json({ error: "Failed to initialize conversation." });
  }
});

// 3. Get messages for a specific conversation
router.get("/conversations/:id/messages", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const myAliases = getUserAliases(req.user);

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const hasAccess = conversation.participants.some((p) => myAliases.includes(p));
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this conversation." });
    }

    const messages = await Message.find({ conversationId: id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error("Get Messages Error:", error);
    res.status(500).json({ error: "Failed to fetch messages." });
  }
});

// 4. Search users to start a chat with (ONLY registered users + authorities, NO dummy users)
router.get("/users", verifyToken, async (req, res) => {
  try {
    const myAliases = getUserAliases(req.user);
    const { query } = req.query;
    const q = query ? query.toLowerCase().trim() : "";

    // Authorities list (Warden / Admin)
    const availableAuthorities = AUTHORITIES.filter((auth) => {
      if (myAliases.includes(auth.id) || myAliases.includes(auth.regNo)) return false;
      if (!q) return true;
      return (
        auth.name.toLowerCase().includes(q) ||
        auth.dept.toLowerCase().includes(q) ||
        auth.regNo.toLowerCase().includes(q) ||
        auth.role.toLowerCase().includes(q) ||
        (auth.title && auth.title.toLowerCase().includes(q))
      );
    });

    // ONLY search real registered students (isRegistered: true, NO fake/dummy seed students)
    let studentFilter = {
      isRegistered: true,
      $and: [
        { id: { $nin: myAliases } },
        { regNo: { $nin: myAliases } },
      ],
    };

    if (q) {
      studentFilter.$and.push({
        $or: [
          { name: { $regex: q, $options: "i" } },
          { regNo: { $regex: q, $options: "i" } },
          { department: { $regex: q, $options: "i" } },
          { dept: { $regex: q, $options: "i" } },
          { hostel: { $regex: q, $options: "i" } },
          { room: { $regex: q, $options: "i" } },
        ],
      });
    }

    const students = await Student.find(studentFilter)
      .select("id regNo name email dept department avatar hostel room role")
      .sort({ updatedAt: -1, createdAt: -1 });

    // Format students with fallback avatar
    const formattedStudents = students.map((s) => {
      const obj = s.toObject();
      obj.role = "student";
      if (!obj.avatar || obj.avatar.trim() === "") {
        obj.avatar = "/default-avatar.svg";
      }
      return obj;
    });

    // Return authorities first, followed by real registered students
    res.json([...availableAuthorities, ...formattedStudents]);
  } catch (error) {
    console.error("Search Users Error:", error);
    res.status(500).json({ error: "Failed to search users." });
  }
});

export default router;
