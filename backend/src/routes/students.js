import express from "express";
import bcrypt from "bcryptjs";
import { Student } from "../models/Student.js";
import { Room } from "../models/Room.js";
import { Hostel } from "../models/Hostel.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

const DEPT_SHORT_MAP = {
  "Computer Science and Engineering": "CSE",
  "Information Technology": "IT",
  "Artificial Intelligence and Data Science": "AIDS",
  "Electronics and Communication Engineering": "ECE",
  "Electrical and Electronics Engineering": "EEE",
  "Mechanical Engineering": "MECH",
  "Civil Engineering": "CIVIL",
  "Biomedical Engineering": "BME",
  "Mechatronics Engineering": "MCT",
  "Food Technology": "FT",
};

// GET all students with search and filtering
router.get("/", async (req, res) => {
  try {
    const { q, gender, year, department, hostel, limit } = req.query;
    const filter = {};

    if (gender && gender !== "All") {
      filter.gender = gender;
    }

    if (year && year !== "All") {
      filter.year = Number(year);
    }

    if (department && department !== "All") {
      filter.$or = [
        { department: { $regex: new RegExp(department, "i") } },
        { dept: { $regex: new RegExp(department, "i") } },
      ];
    }

    if (hostel && hostel !== "All") {
      filter.hostel = { $regex: new RegExp(hostel, "i") };
    }

    if (q && q.trim()) {
      const searchRegex = new RegExp(q.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { regNo: searchRegex },
        { department: searchRegex },
        { dept: searchRegex },
        { hometown: searchRegex },
        { email: searchRegex },
      ];
    }

    const maxLimit = limit ? Math.min(Number(limit), 200) : 100;
    const students = await Student.find(filter)
      .select("-password")
      .sort({ regNo: 1 })
      .limit(maxLimit);

    res.json(students);
  } catch (error) {
    console.error("Fetch Students Error:", error);
    res.status(500).json({ error: "Failed to fetch student directory." });
  }
});

// GET single student details by id or regNo
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findOne({
      $or: [{ id }, { regNo: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    }).select("-password");

    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    res.json(student);
  } catch (error) {
    console.error("Fetch Student Detail Error:", error);
    res.status(500).json({ error: "Failed to fetch student details." });
  }
});

// POST create new student by Administrator
router.post("/", verifyToken, async (req, res) => {
  try {
    const {
      name,
      regNo,
      email,
      department,
      year,
      gender,
      mobile,
      hometown,
      hostel,
      room,
      cgpa,
      password,
    } = req.body;

    if (!name || !regNo || !email) {
      return res.status(400).json({ error: "Name, Register Number, and Email are required." });
    }

    const cleanReg = regNo.trim().toUpperCase();
    const existing = await Student.findOne({ $or: [{ regNo: cleanReg }, { email: email.toLowerCase() }] });
    if (existing) {
      return res.status(400).json({ error: "Student with this Register Number or Email already exists." });
    }

    const count = await Student.countDocuments();
    const cleanDept = department || "Computer Science and Engineering";
    const computedDept = DEPT_SHORT_MAP[cleanDept] || "CSE";
    const hashedPassword = await bcrypt.hash(password || "password123", 10);

    const newStudent = new Student({
      id: `S${String(count + 1).padStart(3, "0")}`,
      regNo: cleanReg,
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      department: cleanDept,
      dept: computedDept,
      year: Number(year) || 1,
      gender: gender || "Male",
      mobile: mobile || "9876543210",
      hometown: hometown || "Coimbatore",
      hostel: hostel || "Not Allocated",
      room: room || "—",
      cgpa: cgpa || "8.50",
      feeStatus: "Term I Paid",
      role: "student",
      isProfileComplete: true,
      isRegistered: true,
      avatar: req.body.avatar || "",
      traits: {
        sleep: "10 PM – 12 AM",
        wake: "6–8 AM",
        cleanliness: "Very Clean",
        food: "Non-Veg",
        personality: "Ambivert",
        noise: "Moderate",
        study: "Night",
        visitors: "Occasionally",
        qualities: ["Clean", "Friendly"],
      },
    });

    await newStudent.save();

    // If a room is immediately allotted, update room occupancy
    if (hostel && hostel !== "Not Allocated" && room && room !== "—") {
      await Room.updateOne({ hostelName: hostel, number: room }, { $inc: { occupied: 1 } });
      await Hostel.updateOne({ name: hostel }, { $inc: { occupied: 1 } });
    }

    const obj = newStudent.toObject();
    delete obj.password;
    res.status(201).json(obj);
  } catch (error) {
    console.error("Create Student Error:", error);
    res.status(500).json({ error: "Failed to create student record." });
  }
});

// PATCH update student profile by Administrator
router.patch("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findOne({
      $or: [{ id }, { regNo: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    const oldHostel = student.hostel;
    const oldRoom = student.room;

    const allowedFields = [
      "name",
      "email",
      "mobile",
      "gender",
      "department",
      "dept",
      "year",
      "hometown",
      "language",
      "cgpa",
      "hostel",
      "room",
      "messPlan",
      "feeStatus",
      "avatar",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        student[field] = req.body[field];
      }
    });

    if (req.body.department && !req.body.dept) {
      student.dept = DEPT_SHORT_MAP[req.body.department] || student.dept;
    }

    await student.save();

    // Adjust room occupancy if room changed
    if (req.body.room && req.body.hostel && (oldRoom !== req.body.room || oldHostel !== req.body.hostel)) {
      if (oldHostel && oldHostel !== "Not Allocated" && oldRoom && oldRoom !== "—") {
        await Room.updateOne({ hostelName: oldHostel, number: oldRoom }, { $inc: { occupied: -1 } });
        await Hostel.updateOne({ name: oldHostel }, { $inc: { occupied: -1 } });
      }
      if (req.body.hostel !== "Not Allocated" && req.body.room !== "—") {
        await Room.updateOne({ hostelName: req.body.hostel, number: req.body.room }, { $inc: { occupied: 1 } });
        await Hostel.updateOne({ name: req.body.hostel }, { $inc: { occupied: 1 } });
      }
    }

    const obj = student.toObject();
    delete obj.password;
    res.json(obj);
  } catch (error) {
    console.error("Update Student Error:", error);
    res.status(500).json({ error: "Failed to update student." });
  }
});

// DELETE student by Administrator
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findOne({
      $or: [{ id }, { regNo: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    // Decrement room occupancy if student held a room
    if (student.hostel && student.hostel !== "Not Allocated" && student.room && student.room !== "—") {
      await Room.updateOne({ hostelName: student.hostel, number: student.room }, { $inc: { occupied: -1 } });
      await Hostel.updateOne({ name: student.hostel }, { $inc: { occupied: -1 } });
    }

    await Student.deleteOne({ _id: student._id });
    res.json({ message: `Student ${student.name} (${student.regNo}) successfully removed.` });
  } catch (error) {
    console.error("Delete Student Error:", error);
    res.status(500).json({ error: "Failed to delete student." });
  }
});

export default router;
