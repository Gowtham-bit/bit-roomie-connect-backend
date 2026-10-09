import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Message } from "./models/Message.js";
import { Conversation } from "./models/Conversation.js";

const onlineUsers = new Map(); // userId -> socketId

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
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id || socket.user.regNo;
    onlineUsers.set(userId, socket.id);
    console.log(`🔌 Socket Connected: User [${userId}] (Socket ID: ${socket.id})`);

    // Broadcast updated online users list
    io.emit("get_online_users", Array.from(onlineUsers.keys()));

    // User joins a specific conversation room
    socket.on("join_conversation", (conversationId) => {
      socket.join(`conv_${conversationId}`);
      console.log(`User ${userId} joined room: conv_${conversationId}`);
    });

    // User leaves a conversation room
    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conv_${conversationId}`);
    });

    // Real-time Send Message
    socket.on("send_message", async (data, callback) => {
      try {
        const { conversationId, receiverId, text } = data;

        if (!conversationId || !receiverId || !text || !text.trim()) {
          if (callback) callback({ error: "Missing required message fields" });
          return;
        }

        // 1. Create and save Message document
        const newMessage = new Message({
          conversationId,
          senderId: userId,
          receiverId,
          text: text.trim(),
          isRead: false,
        });
        await newMessage.save();

        // 2. Update Conversation document
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.lastMessage = text.trim();
          conversation.lastMessageSender = userId;

          // Increment unread count for receiver if receiver is not active in room
          const currentUnread = conversation.unreadCounts?.get?.(receiverId) || conversation.unreadCounts?.[receiverId] || 0;
          if (!conversation.unreadCounts) conversation.unreadCounts = {};
          if (typeof conversation.unreadCounts.set === "function") {
            conversation.unreadCounts.set(receiverId, currentUnread + 1);
          } else {
            conversation.unreadCounts[receiverId] = currentUnread + 1;
          }
          await conversation.save();
        }

        const messagePayload = newMessage.toObject();

        // 3. Emit message to conversation room
        io.to(`conv_${conversationId}`).emit("receive_message", messagePayload);

        // 4. Notify receiver directly if connected (for unread badge/notifications)
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("new_message_notification", {
            conversationId,
            senderId: userId,
            text: text.trim(),
          });
        }

        // 5. Emit updated conversation state to both participants
        conversation.participants.forEach((pId) => {
          const pSocketId = onlineUsers.get(pId);
          if (pSocketId) {
            io.to(pSocketId).emit("conversation_updated", {
              conversationId,
              lastMessage: text.trim(),
              lastMessageSender: userId,
              updatedAt: new Date(),
            });
          }
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
    });

    socket.on("stop_typing", ({ conversationId, receiverId }) => {
      socket.to(`conv_${conversationId}`).emit("user_stop_typing", { conversationId, userId });
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
      } catch (err) {
        console.error("Socket mark_as_read Error:", err);
      }
    });

    // Socket Disconnect
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      console.log(`🔌 Socket Disconnected: User [${userId}]`);
      io.emit("get_online_users", Array.from(onlineUsers.keys()));
    });
  });

  return io;
}
