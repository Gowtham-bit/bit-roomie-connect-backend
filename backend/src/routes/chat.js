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

// Helper to look up profile info (Student or Warden or Admin) by ID / regNo
async function getUserProfile(userId) {
  if (userId === "W001") {
    return { id: "W001", regNo: "warden123", name: "Boys Hostel Warden", role: "warden", avatar: "https://i.pravatar.cc/160?img=60", dept: "Hostel Admin" };
  }
  if (userId === "W002") {
    return { id: "W002", regNo: "gwarden123", name: "Girls Hostel Warden", role: "warden", avatar: "https://i.pravatar.cc/160?img=47", dept: "Hostel Admin" };
  }
  if (userId === "A001") {
    return { id: "A001", regNo: "admin123", name: "System Administrator", role: "admin", avatar: "https://i.pravatar.cc/160?img=68", dept: "IT Admin" };
  }

  const student = await Student.findOne({ $or: [{ id: userId }, { regNo: userId }] }).select("id regNo name email dept department avatar role hostel room");
  if (student) {
    return student.toObject();
  }

  const sampleMatch = SAMPLE_STUDENTS.find(s => s.id === userId || s.regNo === userId);
  if (sampleMatch) return sampleMatch;

  return { id: userId, regNo: userId, name: userId, avatar: "https://i.pravatar.cc/160?img=12", dept: "Student" };
}

// Get all conversations for the logged in user
router.get("/conversations", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.regNo;

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

    res.json(formattedConversations);
  } catch (error) {
    console.error("Get Conversations Error:", error);
    res.status(500).json({ error: "Failed to fetch conversations." });
  }
});

// Start or get existing conversation with a user
router.post("/conversations", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user.regNo;
    const { targetId } = req.body;

    if (!targetId) {
      return res.status(400).json({ error: "targetId is required." });
    }

    if (currentUserId === targetId) {
      return res.status(400).json({ error: "Cannot start a chat with yourself." });
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

    const recipient = await getUserProfile(targetId);

    res.status(200).json({
      _id: conversation._id,
      participants: conversation.participants,
      recipient,
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

    const conversation = await Conversation.findById(id);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({ error: "Access denied to this conversation." });
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
    const { query } = req.query;

    let filter = { id: { $ne: currentUserId }, regNo: { $ne: currentUserId } };
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { regNo: { $regex: query, $options: "i" } },
        { department: { $regex: query, $options: "i" } },
        { dept: { $regex: query, $options: "i" } },
      ];
    }

    let students = await Student.find(filter).select("id regNo name email dept department avatar hostel room role").limit(20);

    // If MongoDB has no student records yet, fallback to SAMPLE_STUDENTS
    if (students.length === 0) {
      const q = query ? query.toLowerCase() : "";
      students = SAMPLE_STUDENTS.filter(
        (s) =>
          s.id !== currentUserId &&
          s.regNo !== currentUserId &&
          (!q || s.name.toLowerCase().includes(q) || s.regNo.toLowerCase().includes(q) || s.dept.toLowerCase().includes(q) || s.department.toLowerCase().includes(q))
      );
    }

    // Include Wardens in chat search
    const wardens = [
      { id: "W001", regNo: "warden123", name: "Boys Hostel Warden", role: "warden", avatar: "https://i.pravatar.cc/160?img=60", dept: "Hostel Admin" },
      { id: "W002", regNo: "gwarden123", name: "Girls Hostel Warden", role: "warden", avatar: "https://i.pravatar.cc/160?img=47", dept: "Hostel Admin" },
    ].filter((w) => w.id !== currentUserId && (!query || w.name.toLowerCase().includes(query.toLowerCase()) || w.dept.toLowerCase().includes(query.toLowerCase())));

    res.json([...wardens, ...students]);
  } catch (error) {
    console.error("Search Users Error:", error);
    res.status(500).json({ error: "Failed to search users." });
  }
});

export default router;
