import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Message } from "./models/Message.js";
import { Conversation } from "./models/Conversation.js";

// Keep track of active sockets per user identifier
// Map<string, Set<string>> userId/regNo -> Set of socket.ids
const userSocketsMap = new Map();

function trackUserSocket(identifier, socketId) {
  if (!identifier) return;
  if (!userSocketsMap.has(identifier)) {
    userSocketsMap.set(identifier, new Set());
  }
  userSocketsMap.get(identifier).add(socketId);
}

function untrackUserSocket(identifier, socketId) {
  if (!identifier || !userSocketsMap.has(identifier)) return;
  const set = userSocketsMap.get(identifier);
  set.delete(socketId);
  if (set.size === 0) {
    userSocketsMap.delete(identifier);
  }
}

export function setupSocketIO(server) {
  const io = new Server(server, {
    cors: {
      origin: "*", // allow frontend connection
      methods: ["GET", "POST"],
    },
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret");
      socket.user = decoded;
      next();
    } catch (err) {
      // Development fallback for mock tokens if used
      if (typeof token === "string" && token.startsWith("mock_")) {
        socket.user = {
          id: token.includes("gwarden") ? "W002" : token.includes("warden") ? "W001" : "A001",
          regNo: token.includes("gwarden") ? "gwarden123" : token.includes("warden") ? "warden123" : "admin123",
          role: token.includes("admin") ? "admin" : "warden",
        };
        return next();
      }
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user || {};
    const userId = user.id || user.regNo;
    const userRegNo = user.regNo;
    const userCustomId = user.id;

    // Track online user sockets
    trackUserSocket(userId, socket.id);
    if (userRegNo) trackUserSocket(userRegNo, socket.id);
    if (userCustomId) trackUserSocket(userCustomId, socket.id);

    // Join personal user rooms for guaranteed real-time message routing
    if (userId) socket.join(`user_${userId}`);
    if (userCustomId) socket.join(`user_${userCustomId}`);
    if (userRegNo) socket.join(`user_${userRegNo}`);

    console.log(`🔌 Socket Connected: User [${userId}] (Socket ID: ${socket.id})`);

    // Broadcast updated online users list
    io.emit("get_online_users", Array.from(userSocketsMap.keys()));

    // User joins a specific conversation room
    socket.on("join_conversation", (conversationId) => {
      if (!conversationId) return;
      socket.join(`conv_${conversationId}`);
      console.log(`User ${userId} joined room: conv_${conversationId}`);
    });

    // User leaves a conversation room
    socket.on("leave_conversation", (conversationId) => {
      if (!conversationId) return;
      socket.leave(`conv_${conversationId}`);
    });

    // Real-time Send Message
    socket.on("send_message", async (data, callback) => {
      try {
        const { conversationId, receiverId, text, tempId } = data;

        if (!conversationId || !receiverId || !text || !text.trim()) {
          if (callback) callback({ error: "Missing required message fields" });
          return;
        }

        const senderId = userId;
        const trimmedText = text.trim();

        // 1. Create and save Message document
        const newMessage = new Message({
          conversationId,
          senderId,
          receiverId,
          text: trimmedText,
          isRead: false,
        });
        await newMessage.save();

        // 2. Update Conversation document
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.lastMessage = trimmedText;
          conversation.lastMessageSender = senderId;

          // Increment unread count for receiver
          if (!conversation.unreadCounts) conversation.unreadCounts = {};
          const currentUnread =
            conversation.unreadCounts?.get?.(receiverId) ||
            conversation.unreadCounts?.[receiverId] ||
            0;
          if (typeof conversation.unreadCounts.set === "function") {
            conversation.unreadCounts.set(receiverId, currentUnread + 1);
          } else {
            conversation.unreadCounts[receiverId] = currentUnread + 1;
          }
          await conversation.save();
        }

        const messagePayload = {
          ...newMessage.toObject(),
          tempId: tempId || null,
        };

        // 3. Emit message to conversation room (anyone currently viewing the conversation)
        io.to(`conv_${conversationId}`).emit("receive_message", messagePayload);

        // 4. Emit directly to receiver's user room (ensures instant delivery even if receiver hasn't opened room)
        io.to(`user_${receiverId}`).emit("receive_message", messagePayload);

        // 5. Emit updated conversation state to both participants for instant sidebar updates
        const participantsToNotify = conversation?.participants?.length
          ? conversation.participants
          : [senderId, receiverId];

        participantsToNotify.forEach((pId) => {
          io.to(`user_${pId}`).emit("conversation_updated", {
            conversationId,
            lastMessage: trimmedText,
            lastMessageSender: senderId,
            updatedAt: newMessage.createdAt || new Date(),
          });
        });

        if (callback) callback({ status: "ok", message: messagePayload });
      } catch (err) {
        console.error("Socket send_message Error:", err);
        if (callback) callback({ error: "Failed to process message" });
      }
    });

    // Real-time Typing Indicator
    socket.on("typing", ({ conversationId, receiverId }) => {
      socket.to(`conv_${conversationId}`).emit("user_typing", { conversationId, userId });
      if (receiverId) {
        socket.to(`user_${receiverId}`).emit("user_typing", { conversationId, userId });
      }
    });

    socket.on("stop_typing", ({ conversationId, receiverId }) => {
      socket.to(`conv_${conversationId}`).emit("user_stop_typing", { conversationId, userId });
      if (receiverId) {
        socket.to(`user_${receiverId}`).emit("user_stop_typing", { conversationId, userId });
      }
    });

    // Mark Messages as Read
    socket.on("mark_as_read", async ({ conversationId }) => {
      try {
        await Message.updateMany(
          { conversationId, receiverId: userId, isRead: false },
          { $set: { isRead: true } }
        );

        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          if (typeof conversation.unreadCounts?.set === "function") {
            conversation.unreadCounts.set(userId, 0);
          } else if (conversation.unreadCounts) {
            conversation.unreadCounts[userId] = 0;
          }
          await conversation.save();
        }

        io.to(`conv_${conversationId}`).emit("messages_read", { conversationId, readBy: userId });
        if (conversation) {
          conversation.participants.forEach((pId) => {
            io.to(`user_${pId}`).emit("messages_read", { conversationId, readBy: userId });
          });
        }
      } catch (err) {
        console.error("Socket mark_as_read Error:", err);
      }
    });

    // Socket Disconnect
    socket.on("disconnect", () => {
      untrackUserSocket(userId, socket.id);
      if (userRegNo) untrackUserSocket(userRegNo, socket.id);
      if (userCustomId) untrackUserSocket(userCustomId, socket.id);

      console.log(`🔌 Socket Disconnected: User [${userId}]`);
      io.emit("get_online_users", Array.from(userSocketsMap.keys()));
    });
  });

  return io;
}
