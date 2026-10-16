import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Message } from "./models/Message.js";
import { Conversation } from "./models/Conversation.js";
import { getUserAliases, isAuthority } from "./routes/chat.js";

import mongoose from "mongoose";

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
    const myAliases = getUserAliases(user);
    if (userId && !myAliases.includes(userId)) myAliases.push(userId);
    if (user.regNo && !myAliases.includes(user.regNo)) myAliases.push(user.regNo);

    // Track online user sockets and join personal user rooms for all aliases
    myAliases.forEach((alias) => {
      trackUserSocket(alias, socket.id);
      socket.join(`user_${alias}`);
    });

    console.log(`🔌 Socket Connected: User [${userId}] (Aliases: ${myAliases.join(", ")}) (Socket ID: ${socket.id})`);

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
        const senderAliases = myAliases;
        const receiverAliases = getUserAliases(receiverId);
        if (!receiverAliases.includes(receiverId)) receiverAliases.push(receiverId);

        const trimmedText = text.trim();
        const messageId = new mongoose.Types.ObjectId();
        const now = new Date();

        const messagePayload = {
          _id: String(messageId),
          conversationId: String(conversationId),
          senderId,
          receiverId,
          text: trimmedText,
          isRead: false,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          tempId: tempId || null,
        };

        // ⚡ INSTANT DELIVERY (0ms delay): Emit to conversation room & ALL receiver's personal user rooms
        io.to(`conv_${conversationId}`).emit("receive_message", messagePayload);
        receiverAliases.forEach((a) => {
          io.to(`user_${a}`).emit("receive_message", messagePayload);
        });

        // Immediate typing stop
        socket.to(`conv_${conversationId}`).emit("user_stop_typing", { conversationId, userId: senderId });
        receiverAliases.forEach((a) => {
          socket.to(`user_${a}`).emit("user_stop_typing", { conversationId, userId: senderId });
        });

        if (callback) callback({ status: "ok", message: messagePayload });

        // 💾 Persist to MongoDB concurrently in background
        const newMessage = new Message({
          _id: messageId,
          conversationId,
          senderId,
          receiverId,
          text: trimmedText,
          isRead: false,
        });
        await newMessage.save();

        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.lastMessage = trimmedText;
          conversation.lastMessageSender = senderId;

          // Increment unread count for receiver aliases
          if (!conversation.unreadCounts) conversation.unreadCounts = {};
          receiverAliases.forEach((rAlias) => {
            const currentUnread =
              conversation.unreadCounts?.get?.(rAlias) ||
              conversation.unreadCounts?.[rAlias] ||
              0;
            if (typeof conversation.unreadCounts.set === "function") {
              conversation.unreadCounts.set(rAlias, currentUnread + 1);
            } else {
              conversation.unreadCounts[rAlias] = currentUnread + 1;
            }
          });
          await conversation.save();

          // Emit updated conversation preview to participants
          const participantsToNotify = conversation?.participants?.length
            ? conversation.participants
            : [...senderAliases, ...receiverAliases];

          participantsToNotify.forEach((pId) => {
            const pAliases = getUserAliases(pId);
            if (!pAliases.includes(pId)) pAliases.push(pId);
            pAliases.forEach((a) => {
              io.to(`user_${a}`).emit("conversation_updated", {
                conversationId,
                lastMessage: trimmedText,
                lastMessageSender: senderId,
                updatedAt: now,
              });
            });
          });
        }
      } catch (err) {
        console.error("Socket send_message Error:", err);
        if (callback) callback({ error: "Failed to process message" });
      }
    });

    // Real-time Typing Indicator
    socket.on("typing", ({ conversationId, receiverId }) => {
      socket.to(`conv_${conversationId}`).emit("user_typing", { conversationId, userId });
      if (receiverId) {
        const receiverAliases = getUserAliases(receiverId);
        if (!receiverAliases.includes(receiverId)) receiverAliases.push(receiverId);
        receiverAliases.forEach((a) => {
          socket.to(`user_${a}`).emit("user_typing", { conversationId, userId });
        });
      }
    });

    socket.on("stop_typing", ({ conversationId, receiverId }) => {
      socket.to(`conv_${conversationId}`).emit("user_stop_typing", { conversationId, userId });
      if (receiverId) {
        const receiverAliases = getUserAliases(receiverId);
        if (!receiverAliases.includes(receiverId)) receiverAliases.push(receiverId);
        receiverAliases.forEach((a) => {
          socket.to(`user_${a}`).emit("user_stop_typing", { conversationId, userId });
        });
      }
    });

    // Mark Messages as Read
    socket.on("mark_as_read", async ({ conversationId }) => {
      try {
        await Message.updateMany(
          { conversationId, receiverId: { $in: myAliases }, isRead: false },
          { $set: { isRead: true } }
        );

        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          myAliases.forEach((a) => {
            if (typeof conversation.unreadCounts?.set === "function") {
              conversation.unreadCounts.set(a, 0);
            } else if (conversation.unreadCounts) {
              conversation.unreadCounts[a] = 0;
            }
          });
          await conversation.save();
        }

        io.to(`conv_${conversationId}`).emit("messages_read", { conversationId, readBy: userId });
        if (conversation) {
          conversation.participants.forEach((pId) => {
            const pAliases = getUserAliases(pId);
            if (!pAliases.includes(pId)) pAliases.push(pId);
            pAliases.forEach((a) => {
              io.to(`user_${a}`).emit("messages_read", { conversationId, readBy: userId });
            });
          });
        }
      } catch (err) {
        console.error("Socket mark_as_read Error:", err);
      }
    });

    // Socket Disconnect
    socket.on("disconnect", () => {
      myAliases.forEach((alias) => {
        untrackUserSocket(alias, socket.id);
      });

      console.log(`🔌 Socket Disconnected: User [${userId}]`);
      io.emit("get_online_users", Array.from(userSocketsMap.keys()));
    });
  });

  return io;
}

