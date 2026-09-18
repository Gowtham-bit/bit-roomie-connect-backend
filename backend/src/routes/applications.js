import express from "express";
import { Application } from "../models/Application.js";
import { RoomChange } from "../models/RoomChange.js";

const router = express.Router();

// POST new hostel allocation application
router.post("/apply", async (req, res) => {
  try {
    const { regNo, studentName, hostelId, hostelName, roomType, sharing, notes } = req.body;

    if (!regNo || !hostelId) {
      return res.status(400).json({ error: "Registration number and hostel selection are required." });
    }

    const count = await Application.countDocuments();
    const newApp = new Application({
      id: `APP${String(count + 1).padStart(3, "0")}`,
      regNo,
      studentName: studentName || "Student",
      hostelId,
      hostelName: hostelName || "Selected Block",
      roomType: roomType || "Non-AC",
      sharing: Number(sharing) || 2,
      notes: notes || "",
      status: "Pending",
      appliedDate: new Date().toISOString().slice(0, 10),
    });

    await newApp.save();
    res.status(201).json({ message: "Hostel application submitted successfully", application: newApp });
  } catch (error) {
    console.error("Application Error:", error);
    res.status(500).json({ error: "Failed to submit hostel application." });
  }
});

// POST room change request
router.post("/room-change", async (req, res) => {
  try {
    const { regNo, studentName, currentHostel, currentRoom, targetHostel, reason } = req.body;

    if (!regNo || !reason) {
      return res.status(400).json({ error: "Registration number and reason are required." });
    }

    const count = await RoomChange.countDocuments();
    const newRequest = new RoomChange({
      id: `RC${String(count + 1).padStart(3, "0")}`,
      regNo,
      studentName: studentName || "Student",
      currentHostel: currentHostel || "Sapphire Block",
      currentRoom: currentRoom || "312",
      targetHostel: targetHostel || "Emerald Block",
      reason,
      status: "Pending",
      appliedDate: new Date().toISOString().slice(0, 10),
    });

    await newRequest.save();
    res.status(201).json({ message: "Room change request submitted successfully", request: newRequest });
  } catch (error) {
    console.error("Room Change Error:", error);
    res.status(500).json({ error: "Failed to submit room change request." });
  }
});

export default router;
