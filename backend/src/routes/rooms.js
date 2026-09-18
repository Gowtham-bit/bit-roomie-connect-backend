import express from "express";
import { Room } from "../models/Room.js";

const router = express.Router();

// GET rooms with query filters
router.get("/", async (req, res) => {
  try {
    const { hostelId, type, available, floor } = req.query;
    const query = {};

    if (hostelId) query.hostelId = hostelId;
    if (type) query.type = type;
    if (floor !== undefined && floor !== "") query.floor = Number(floor);
    if (available === "true") {
      query.$expr = { $lt: ["$occupied", "$capacity"] };
    }

    const rooms = await Room.find(query).limit(100);
    res.json(rooms);
  } catch (error) {
    console.error("Fetch Rooms Error:", error);
    res.status(500).json({ error: "Failed to fetch rooms." });
  }
});

// GET single room details
router.get("/:id", async (req, res) => {
  try {
    const room = await Room.findOne({ id: req.params.id });
    if (!room) {
      return res.status(404).json({ error: "Room not found." });
    }
    res.json(room);
  } catch (error) {
    console.error("Fetch Room Error:", error);
    res.status(500).json({ error: "Failed to fetch room details." });
  }
});

export default router;
