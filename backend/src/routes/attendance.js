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

export default router;
