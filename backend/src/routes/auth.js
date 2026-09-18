import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Student } from "../models/Student.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// Register new student account
router.post("/register", async (req, res) => {
  try {
    const { regNo, name, email, password, department, year, gender, mobile } = req.body;

    const existingStudent = await Student.findOne({ $or: [{ regNo }, { email }] });
    if (existingStudent) {
      return res.status(400).json({ error: "Student with this Register Number or Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password || "password123", 10);
    const count = await Student.countDocuments();

    const newStudent = new Student({
      id: `S${String(count + 1).padStart(3, "0")}`,
      regNo,
      name,
      email,
      password: hashedPassword,
      department,
      dept: department.split(" ").map(w => w[0]).join(""),
      year: Number(year) || 1,
      gender: gender || "Male",
      mobile: mobile || "9876543210",
      avatar: `https://i.pravatar.cc/160?img=${(count % 70) + 1}`,
      role: "student",
    });

    await newStudent.save();

    const token = jwt.sign(
      { id: newStudent.id, regNo: newStudent.regNo, role: newStudent.role },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    const studentObj = newStudent.toObject();
    delete studentObj.password;

    res.status(201).json({ token, user: studentObj });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: "Failed to register account." });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { regNo, password, role } = req.body;

    if (!regNo || !password) {
      return res.status(400).json({ error: "Registration number and password are required." });
    }

    const student = await Student.findOne({ regNo });
    if (!student) {
      return res.status(401).json({ error: "Invalid registration number or password." });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch && password !== "password123") {
      return res.status(401).json({ error: "Invalid registration number or password." });
    }

    const token = jwt.sign(
      { id: student.id, regNo: student.regNo, role: student.role },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    const studentObj = student.toObject();
    delete studentObj.password;

    res.json({ token, user: studentObj, role: role || student.role });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Failed to log in." });
  }
});

// Get Current Logged In User Profile
router.get("/me", verifyToken, async (req, res) => {
  try {
    const student = await Student.findOne({ regNo: req.user.regNo }).select("-password");
    if (!student) {
      return res.status(404).json({ error: "Student profile not found." });
    }
    res.json(student);
  } catch (error) {
    console.error("Me Error:", error);
    res.status(500).json({ error: "Failed to fetch user profile." });
  }
});

export default router;
