import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";

import authRoutes from "./routes/auth.js";
import hostelRoutes from "./routes/hostels.js";
import roomRoutes from "./routes/rooms.js";
import roommateRoutes from "./routes/roommates.js";
import complaintRoutes from "./routes/complaints.js";
import paymentRoutes from "./routes/payments.js";
import attendanceRoutes from "./routes/attendance.js";
import notificationRoutes from "./routes/notifications.js";
import applicationRoutes from "./routes/applications.js";
import statsRoutes from "./routes/stats.js";
import chatRoutes from "./routes/chat.js";
import { setupSocketIO } from "./socket.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bit_roomie_connect";

// Create HTTP Server & Socket.io
const server = http.createServer(app);
setupSocketIO(server);

// CORS & Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "BIT Roomie Connect Backend API",
    dbState: mongoose.connection.readyState === 1 ? "Connected to MongoDB" : "Connecting...",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/hostels", hostelRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/roommates", roommateRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/chat", chatRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Backend Error:", err);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});

// Connect Database & Start Server
async function startServer() {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` BIT Roomie Connect Backend Server Running`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Health Check: http://localhost:${PORT}/api/health`);
    console.log(` WebSockets: Enabled (Socket.io)`);
    console.log(`====================================================`);
  });

  mongoose.connection.on("error", (err) => {
    console.warn(`⚠️ MongoDB Connection Notice: ${err.message || "Transient network glitch"}`);
  });
  mongoose.connection.on("disconnected", () => {
    console.log("ℹ️ MongoDB disconnected. Retrying connection...");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("✅ MongoDB reconnected successfully.");
  });

  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 20000,
    });
    console.log("MongoDB Atlas connected successfully.");
  } catch (error) {
    console.error(`\n❌ Could not connect to MongoDB Atlas: ${error.message}`);
    console.error(`👉 Fix: Whitelist IP '0.0.0.0/0' (Allow access from anywhere) in MongoDB Atlas Network Access.`);
    console.error(`   Check MONGODB_URI in "backend/.env": ${MONGODB_URI}\n`);

    try {
      console.log("Attempting fallback to local MongoDB (mongodb://127.0.0.1:27017/bit_roomie_connect)...");
      await mongoose.connect("mongodb://127.0.0.1:27017/bit_roomie_connect", { serverSelectionTimeoutMS: 2000 });
      console.log("Connected to local MongoDB fallback successfully.");
    } catch (localErr) {
      console.warn("Local MongoDB fallback also not running. Backend server remains active.");
    }
  }
}

startServer();



