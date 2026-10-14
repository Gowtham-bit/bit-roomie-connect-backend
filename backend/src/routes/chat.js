import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Student } from "../models/Student.js";

const router = express.Router();

const SAMPLE_STUDENTS = [
  { id: "S001", regNo: "7376242CS101", name: "Karthik Raja", email: "karthik.cs@bitsathy.ac.in", dept: "CSE", department: "Computer Science and Engineering", year: 3, avatar: "https://i.pravatar.cc/160?img=11", role: "student" },
  { id: "S002", regNo: "7376242CS102", name: "Surya Prakash", email: "surya.cs@bitsathy.ac.in", dept: "CSE", department: "Computer Science and Engineering", year: 3, avatar: "https://i.pravatar.cc/160?img=12", role: "student" },
  { id: "S003", regNo: "7376242IT105", name: "Divya Bharathi", email: "divya.it@bitsathy.ac.in", dept: "IT", department: "Information Technology", year: 2, avatar: "https://i.pravatar.cc/160?img=44", role: "student" },
  { id: "S004", regNo: "7376242EC201", name: "Vignesh Kumar", email: "vignesh.ece@bitsathy.ac.in", dept: "ECE", department: "Electronics and Communication Engineering", year: 4, avatar: "https://i.pravatar.cc/160?img=33", role: "student" },
  { id: "S005", regNo: "7376242AD142", name: "Gowtham S", email: "gowtham.ad@bitsathy.ac.in", dept: "AIDS", department: "Artificial Intelligence and Data Science", year: 3, avatar: "https://i.pravatar.cc/160?img=15", role: "student" },
  { id: "S006", regNo: "7376242ME302", name: "Hariharan R", email: "hari.mech@bitsathy.ac.in", dept: "MECH", department: "Mechanical Engineering", year: 2, avatar: "https://i.pravatar.cc/160?img=52", role: "student" },
  { id: "S007", regNo: "7376242CS188", name: "Anitha M", email: "anitha.cs@bitsathy.ac.in", dept: "CSE", department: "Computer Science and Engineering", year: 3, avatar: "https://i.pravatar.cc/160?img=49", role: "student" },
];

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

  const student = await Student.findOne({ $or: [{ id: userId }, { regNo: userId }] }).select(
    "id regNo name email dept department avatar role hostel room"
  );
  if (student) {
    const obj = student.toObject();
    obj.role = "student";
    return obj;
  }

  const sampleMatch = SAMPLE_STUDENTS.find((s) => s.id === userId || s.regNo === userId);
  if (sampleMatch) return { ...sampleMatch, role: "student" };

  return {
    id: userId,
    regNo: userId,
    name: userId,
    avatar: "https://i.pravatar.cc/160?img=12",
    dept: "Student",
    role: "student",
  };
}

// Get all conversations for the logged in user
router.get("/conversations", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.regNo;
    const userRole = req.user.role;
    const senderIsAuth = isAuthority(userId, userRole);

    const conversations = await Conversation.find({
      participants: userId,
    }).sort({ updatedAt: -1 });

    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const otherParticipantId = conv.participants.find((p) => p !== userId) || userId;
        const recipient = await getUserProfile(otherParticipantId);
        const unreadCount = conv.unreadCounts?.get?.(userId) || conv.unreadCounts?.[userId] || 0;

        return {
          _id: conv._id,
          participants: conv.participants,
          recipient,
          lastMessage: conv.lastMessage,
          lastMessageSender: conv.lastMessageSender,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      })
    );

    // Rule: Students can ONLY chat to Warden and Admin.
    // Filter out any student-to-student conversations for student accounts.
    const filtered = formattedConversations.filter((conv) => {
      if (!senderIsAuth) {
        return isAuthority(conv.recipient.id || conv.recipient.regNo, conv.recipient.role);
      }
      return true;
    });

    res.json(filtered);
  } catch (error) {
    console.error("Get Conversations Error:", error);
    res.status(500).json({ error: "Failed to fetch conversations." });
  }
});

// Start or get existing conversation with a user
router.post("/conversations", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user.regNo;
    const currentUserRole = req.user.role;
    const { targetId } = req.body;

    if (!targetId) {
      return res.status(400).json({ error: "targetId is required." });
    }

    if (currentUserId === targetId) {
      return res.status(400).json({ error: "Cannot start a chat with yourself." });
    }

    const senderIsAuth = isAuthority(currentUserId, currentUserRole);
    const targetRecipient = await getUserProfile(targetId);
    const targetIsAuth = isAuthority(targetRecipient.id || targetRecipient.regNo, targetRecipient.role);

    // 🔒 Enforce Rule: Students can ONLY chat to Warden and Admin.
    // Student to student chat is strictly prohibited.
    if (!senderIsAuth && !targetIsAuth) {
      return res.status(403).json({
        error: "Students are only permitted to message Wardens and Administrators.",
      });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, targetId] },
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: [currentUserId, targetId],
        lastMessage: "",
        unreadCounts: { [currentUserId]: 0, [targetId]: 0 },
      });
      await conversation.save();
    }

    res.status(200).json({
      _id: conversation._id,
      participants: conversation.participants,
      recipient: targetRecipient,
      lastMessage: conversation.lastMessage,
      updatedAt: conversation.updatedAt,
    });
  } catch (error) {
    console.error("Create Conversation Error:", error);
    res.status(500).json({ error: "Failed to initialize conversation." });
  }
});

// Get messages for a specific conversation
router.get("/conversations/:id/messages", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.regNo;
    const userRole = req.user.role;
    const senderIsAuth = isAuthority(userId, userRole);

    const conversation = await Conversation.findById(id);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({ error: "Access denied to this conversation." });
    }

    // Check student-to-student restriction
    const otherParticipantId = conversation.participants.find((p) => p !== userId) || userId;
    const otherRecipient = await getUserProfile(otherParticipantId);
    const otherIsAuth = isAuthority(otherRecipient.id || otherRecipient.regNo, otherRecipient.role);

    if (!senderIsAuth && !otherIsAuth) {
      return res.status(403).json({ error: "Student-to-student messaging is disabled." });
    }

    const messages = await Message.find({ conversationId: id }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("Get Messages Error:", error);
    res.status(500).json({ error: "Failed to fetch messages." });
  }
});

// Search users to start a chat with
router.get("/users", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user.regNo;
    const currentUserRole = req.user.role;
    const { query } = req.query;
    const q = query ? query.toLowerCase().trim() : "";

    const senderIsAuth = isAuthority(currentUserId, currentUserRole);

    // List of available authorities (excluding the current user if they are that authority)
    const availableAuthorities = AUTHORITIES.filter((auth) => {
      if (auth.id === currentUserId || auth.regNo === currentUserId) return false;
      if (!q) return true;
      return (
        auth.name.toLowerCase().includes(q) ||
        auth.dept.toLowerCase().includes(q) ||
        auth.regNo.toLowerCase().includes(q) ||
        auth.role.toLowerCase().includes(q) ||
        (auth.title && auth.title.toLowerCase().includes(q))
      );
    });

    // 🔴 IF THE REQUESTING USER IS A STUDENT:
    // Students can ONLY chat to Warden and Admin.
    // They must NEVER see other students in search results.
    if (!senderIsAuth) {
      return res.json(availableAuthorities);
    }

    // 🟢 IF THE REQUESTING USER IS AN ADMIN OR WARDEN:
    // Admin and Warden can chat to all students, and to each other!
    let studentFilter = {
      $and: [
        { id: { $ne: currentUserId } },
        { regNo: { $ne: currentUserId } },
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

    let students = await Student.find(studentFilter)
      .select("id regNo name email dept department avatar hostel room role")
      .limit(30);

    // Fallback if no students in DB or for development testing
    if (students.length === 0) {
      students = SAMPLE_STUDENTS.filter((s) => {
        if (s.id === currentUserId || s.regNo === currentUserId) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.regNo.toLowerCase().includes(q) ||
          s.dept.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q)
        );
      });
    }

    // Return authorities (Wardens + Admin) followed by Students
    res.json([...availableAuthorities, ...students]);
  } catch (error) {
    console.error("Search Users Error:", error);
    res.status(500).json({ error: "Failed to search users." });
  }
});

export default router;
