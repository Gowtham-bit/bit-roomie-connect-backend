import express from "express";
import { Attendance } from "../models/Attendance.js";

const router = express.Router();

// GET attendance history
router.get("/", async (req, res) => {
  try {
    const { regNo, status } = req.query;
    const query = {};

    if (regNo) query.regNo = regNo;
    if (status && status !== "All") query.status = status;

    const records = await Attendance.find(query).sort({ date: -1 }).limit(200);
    res.json(records);
  } catch (error) {
    console.error("Fetch Attendance Error:", error);
    res.status(500).json({ error: "Failed to fetch attendance history." });
  }
});

// POST mark/log attendance
router.post("/", async (req, res) => {
  try {
    const { regNo, studentName, date, status, hostel, room } = req.body;

    if (!regNo) {
      return res.status(400).json({ error: "Registration number is required." });
    }

    const count = await Attendance.countDocuments();
    const newRecord = new Attendance({
      id: `ATT${String(count + 1).padStart(4, "0")}`,
      regNo,
      studentName: studentName || "Student",
      date: date || new Date().toISOString().slice(0, 10),
      status: status || "Present",
      hostel: hostel || "Sapphire Block",
      room: room || "312",
    });

    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (error) {
    console.error("Mark Attendance Error:", error);
    res.status(500).json({ error: "Failed to mark attendance." });
  }
});

// POST bulk log attendance for room/floor
router.post("/bulk", async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "An array of attendance records is required." });
    }

    const count = await Attendance.countDocuments();
    const today = new Date().toISOString().slice(0, 10);

    const docs = records.map((r, i) => ({
      id: `ATT${String(count + i + 1).padStart(4, "0")}`,
      regNo: r.regNo,
      studentName: r.studentName || "Student",
      date: r.date || today,
      status: r.status || "Present",
      hostel: r.hostel || "Sapphire Block",
      room: r.room || "312",
    }));

    const inserted = await Attendance.insertMany(docs);
    res.status(201).json({ message: `Successfully logged attendance for ${inserted.length} students.`, records: inserted });
  } catch (error) {
    console.error("Bulk Attendance Error:", error);
    res.status(500).json({ error: "Failed to bulk log attendance." });
  }
});

export default router;
