import express from "express";
import { Hostel } from "../models/Hostel.js";
import { Room } from "../models/Room.js";
import { Student } from "../models/Student.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// GET all hostels with filtering & sorting
router.get("/", async (req, res) => {
  try {
    const { type, search } = req.query;
    const query = {};

    if (type && type !== "All") {
      query.type = type;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const hostels = await Hostel.find(query).sort({ name: 1 });
    res.json(hostels);
  } catch (error) {
    console.error("Fetch Hostels Error:", error);
    res.status(500).json({ error: "Failed to fetch hostels." });
  }
});

// GET single hostel block by ID with associated rooms and resident students
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const hostel = await Hostel.findOne({
      $or: [{ id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { name: new RegExp(`^${id}$`, "i") }],
    });

    if (!hostel) {
      return res.status(404).json({ error: "Hostel block not found." });
    }

    const [rooms, residents] = await Promise.all([
      Room.find({ $or: [{ hostelId: hostel.id }, { hostelName: hostel.name }] }).sort({ floor: 1, number: 1 }),
      Student.find({ hostel: hostel.name }).select("id regNo name dept department room gender avatar cgpa").limit(50),
    ]);

    res.json({ hostel, rooms, residents });
  } catch (error) {
    console.error("Fetch Hostel Details Error:", error);
    res.status(500).json({ error: "Failed to fetch hostel details." });
  }
});

// POST create new hostel block
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, type, floors, totalRooms, capacity, warden, facilities, image } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Hostel block name and type (Boys/Girls) are required." });
    }

    const existing = await Hostel.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } });
    if (existing) {
      return res.status(400).json({ error: `Hostel block "${name}" already exists.` });
    }

    const count = await Hostel.countDocuments();
    const newId = `H${String(count + 1).padStart(2, "0")}`;

    const numFloors = Number(floors) || 4;
    const numRooms = Number(totalRooms) || 40;
    const totalCapacity = Number(capacity) || (numRooms * 2);

    const newHostel = new Hostel({
      id: newId,
      name: name.trim().endsWith("Block") ? name.trim() : `${name.trim()} Block`,
      type: type === "Girls" ? "Girls" : "Boys",
      floors: numFloors,
      totalRooms: numRooms,
      capacity: totalCapacity,
      occupied: 0,
      warden: warden || (type === "Girls" ? "Mrs. S. Meenakshi" : "Mr. K. Kumar"),
      facilities: Array.isArray(facilities) && facilities.length > 0
        ? facilities
        : ["Wi-Fi", "Solar Water Heater", "Gymnasium", "Study Hall", "RO Water"],
      image: image || (type === "Girls"
        ? "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80"
        : "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=80"),
    });

    await newHostel.save();

    // Auto-populate default rooms for this block
    const roomsToInsert = [];
    const roomsPerFloor = Math.ceil(numRooms / numFloors);
    for (let f = 0; f < numFloors; f++) {
      for (let r = 1; r <= roomsPerFloor; r++) {
        if (roomsToInsert.length >= numRooms) break;
        const roomNum = f === 0 ? `G${String(r).padStart(2, "0")}` : `${f}${String(r).padStart(2, "0")}`;
        roomsToInsert.push({
          id: `${newHostel.id}_${roomNum}`,
          hostelId: newHostel.id,
          hostelName: newHostel.name,
          number: roomNum,
          floor: f,
          capacity: Math.round(totalCapacity / numRooms) || 2,
          occupied: 0,
          type: "Non-AC",
          rent: 56000,
          facilities: ["Wi-Fi", "Study Table", "Bed", "Cupboard", "Hot Water"],
        });
      }
    }

    if (roomsToInsert.length > 0) {
      await Room.insertMany(roomsToInsert);
    }

    res.status(201).json(newHostel);
  } catch (error) {
    console.error("Create Hostel Block Error:", error);
    res.status(500).json({ error: "Failed to create hostel block." });
  }
});

// PATCH update hostel block details
router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const hostel = await Hostel.findOne({
      $or: [{ id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!hostel) {
      return res.status(404).json({ error: "Hostel block not found." });
    }

    const oldName = hostel.name;
    const allowed = ["name", "type", "floors", "totalRooms", "capacity", "warden", "facilities", "image", "occupied"];
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) hostel[f] = req.body[f];
    });

    await hostel.save();

    // Cascade name change if name changed
    if (req.body.name && req.body.name !== oldName) {
      await Room.updateMany({ hostelId: hostel.id }, { $set: { hostelName: req.body.name } });
      await Student.updateMany({ hostel: oldName }, { $set: { hostel: req.body.name } });
    }

    res.json(hostel);
  } catch (error) {
    console.error("Update Hostel Error:", error);
    res.status(500).json({ error: "Failed to update hostel block." });
  }
});

// DELETE hostel block
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const hostel = await Hostel.findOne({
      $or: [{ id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!hostel) {
      return res.status(404).json({ error: "Hostel block not found." });
    }

    await Promise.all([
      Hostel.deleteOne({ _id: hostel._id }),
      Room.deleteMany({ $or: [{ hostelId: hostel.id }, { hostelName: hostel.name }] }),
    ]);

    res.json({ message: `Hostel block "${hostel.name}" and all associated rooms removed.` });
  } catch (error) {
    console.error("Delete Hostel Error:", error);
    res.status(500).json({ error: "Failed to delete hostel block." });
  }
});

export default router;
