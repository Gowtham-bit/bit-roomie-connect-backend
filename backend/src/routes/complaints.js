import express from "express";
import { Complaint } from "../models/Complaint.js";

const router = express.Router();

const SAMPLE_COMPLAINTS = [
  {
    id: "C001",
    student: "Gowtham S",
    regNo: "7376242AD142",
    category: "Electricity",
    title: "Tube light flickering",
    description: "The tube light near study desk is flickering continuously.",
    hostel: "Sapphire Block",
    room: "312",
    priority: "High",
    status: "In Progress",
    createdAt: new Date().toISOString().slice(0, 10),
    assignedTo: "Electrician Team",
  },
  {
    id: "C002",
    student: "Karthik Raja",
    regNo: "7376242CS101",
    category: "Water",
    title: "Bathroom tap leaking",
    description: "Continuous water leaking from basin tap.",
    hostel: "Sapphire Block",
    room: "204",
    priority: "Medium",
    status: "Pending",
    createdAt: new Date().toISOString().slice(0, 10),
    assignedTo: "Plumbing Team",
  },
  {
    id: "C003",
    student: "Divya Bharathi",
    regNo: "7376242IT105",
    category: "Internet",
    title: "Wi-Fi disconnection on 2nd floor",
    description: "Signal drops frequently during study hours.",
    hostel: "Ganga Block",
    room: "218",
    priority: "High",
    status: "Resolved",
    createdAt: new Date().toISOString().slice(0, 10),
    assignedTo: "IT Network Support",
  },
];

// GET complaints with optional filters
router.get("/", async (req, res) => {
  try {
    const { category, status, regNo } = req.query;
    const query = {};

    if (category && category !== "All") query.category = category;
    if (status && status !== "All") query.status = status;
    if (regNo) query.regNo = regNo;

    let complaints = await Complaint.find(query).sort({ createdAt: -1 });

    // Fallback sample complaints if DB is empty
    if (complaints.length === 0 && !regNo) {
      complaints = SAMPLE_COMPLAINTS.filter((c) => {
        const matchCat = !category || category === "All" || c.category === category;
        const matchStat = !status || status === "All" || c.status === status;
        return matchCat && matchStat;
      });
    }

    res.json(complaints);
  } catch (error) {
    console.error("Fetch Complaints Error:", error);
    res.status(500).json({ error: "Failed to fetch complaints." });
  }
});

// POST file a new complaint
router.post("/", async (req, res) => {
  try {
    const { student, regNo, category, title, description, hostel, room, priority } = req.body;

    if (!student || !regNo || !title || !category) {
      return res.status(400).json({ error: "Required fields missing." });
    }

    const count = await Complaint.countDocuments();
    const newComplaint = new Complaint({
      id: `C${String(count + 1).padStart(3, "0")}`,
      student,
      regNo,
      category,
      title,
      description: description || "",
      hostel: hostel || "Sapphire Block",
      room: room || "312",
      priority: priority || "Medium",
      status: "Pending",
      createdAt: new Date().toISOString().slice(0, 10),
      assignedTo: category === "Electricity" ? "Electrician Team" : category === "Water" ? "Plumbing Maintenance" : category === "Internet" ? "IT Support" : "General Maintenance",
    });

    await newComplaint.save();
    res.status(201).json(newComplaint);
  } catch (error) {
    console.error("Create Complaint Error:", error);
    res.status(500).json({ error: "Failed to file complaint." });
  }
});

// PATCH update complaint status by ID or _id
router.patch("/:id", async (req, res) => {
  try {
    const { status, assignedTo } = req.body;
    const { id } = req.params;

    let complaint = await Complaint.findOne({ $or: [{ id }, { _id: id }] });

    if (!complaint) {
      // If not in DB, create one for sample ID
      const sample = SAMPLE_COMPLAINTS.find((c) => c.id === id);
      if (sample) {
        complaint = new Complaint({ ...sample, status: status || sample.status, assignedTo: assignedTo || sample.assignedTo });
      } else {
        return res.status(404).json({ error: "Complaint not found." });
      }
    }

    if (status) complaint.status = status;
    if (assignedTo) complaint.assignedTo = assignedTo;

    await complaint.save();
    res.json(complaint);
  } catch (error) {
    console.error("Update Complaint Error:", error);
    res.status(500).json({ error: "Failed to update complaint." });
  }
});

export default router;
