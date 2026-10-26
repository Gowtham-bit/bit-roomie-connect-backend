import express from "express";
import { Room } from "../models/Room.js";

const router = express.Router();

// GET rooms with query filters
router.get("/", async (req, res) => {
  try {
    const { hostelId, hostelName, type, available, floor } = req.query;
    const query = {};

    if (hostelId) query.hostelId = hostelId;
    if (hostelName) {
      query.hostelName = { $regex: new RegExp(hostelName.replace(" Block", ""), "i") };
    }
    if (type) query.type = type;
    if (floor !== undefined && floor !== "") query.floor = Number(floor);
    if (available === "true") {
      query.$expr = { $lt: ["$occupied", "$capacity"] };
    }

    let rooms = await Room.find(query).sort({ floor: 1, number: 1 }).limit(200);

    // If rooms found, return them
    if (rooms.length > 0) {
      return res.json(rooms);
    }

    // Fallback: If no rooms found for hostelName in MongoDB, generate default floor layout (5 floors x 6 rooms)
    const blockName = hostelName || "Hostel Block";
    const generatedRooms = [];
    const isAC = blockName.includes("Coral");
    const defaultCapacity = isAC ? 2 : 4;

    for (let f = 0; f < 5; f++) {
      for (let r = 1; r <= 6; r++) {
        const roomNum = f === 0 ? `G${String(r).padStart(2, "0")}` : `${f}${String(r).padStart(2, "0")}`;
        generatedRooms.push({
          id: `GEN_${blockName.replace(/\s+/g, "_")}_${roomNum}`,
          hostelId: hostelId || "H01",
          hostelName: blockName,
          number: roomNum,
          floor: f,
          capacity: defaultCapacity,
          occupied: 0,
          type: isAC ? "AC" : "Non-AC",
          rent: isAC ? 95000 : 56000,
          facilities: ["Wi-Fi", "Study Table", "Hot Water", ...(isAC ? ["AC"] : [])],
        });
      }
    }

    res.json(generatedRooms);
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

// POST create new room
router.post("/", async (req, res) => {
  try {
    const { hostelId, hostelName, number, floor, capacity, type, rent, facilities } = req.body;
    if (!hostelName || !number) {
      return res.status(400).json({ error: "Hostel name and room number are required." });
    }

    const cleanNum = String(number).trim();
    const existing = await Room.findOne({ hostelName, number: cleanNum });
    if (existing) {
      return res.status(400).json({ error: `Room ${cleanNum} already exists in ${hostelName}.` });
    }

    const newRoom = new Room({
      id: `${hostelId || "H01"}_${cleanNum}`,
      hostelId: hostelId || "H01",
      hostelName,
      number: cleanNum,
      floor: Number(floor) || 0,
      capacity: Number(capacity) || 2,
      occupied: 0,
      type: type || "Non-AC",
      rent: Number(rent) || 56000,
      facilities: facilities || ["Wi-Fi", "Study Table", "Hot Water"],
    });

    await newRoom.save();
    res.status(201).json(newRoom);
  } catch (error) {
    console.error("Create Room Error:", error);
    res.status(500).json({ error: "Failed to create room." });
  }
});

// PATCH update room details
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findOne({
      $or: [{ id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found." });
    }

    const fields = ["capacity", "occupied", "type", "rent", "facilities", "floor"];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) room[f] = req.body[f];
    });

    await room.save();
    res.json(room);
  } catch (error) {
    console.error("Update Room Error:", error);
    res.status(500).json({ error: "Failed to update room." });
  }
});

// DELETE room
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findOne({
      $or: [{ id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found." });
    }

    await Room.deleteOne({ _id: room._id });
    res.json({ message: `Room ${room.number} removed from ${room.hostelName}.` });
  } catch (error) {
    console.error("Delete Room Error:", error);
    res.status(500).json({ error: "Failed to delete room." });
  }
});

export default router;
