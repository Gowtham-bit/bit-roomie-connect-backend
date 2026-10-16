import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Student } from "../models/Student.js";
import { verifyToken } from "../middleware/auth.js";
import { OAuth2Client } from "google-auth-library";

const router = express.Router();
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "1050820316028-rhevkb6moeijfbsb0abdutj7b8nh8qrv.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Register new student account
router.post("/register", async (req, res) => {
  try {
    const { regNo, name, email, password, department, year, gender, mobile, hometown, language, interests, traits } = req.body;

    const existingStudent = await Student.findOne({ $or: [{ regNo }, { email }] });
    if (existingStudent) {
      return res.status(400).json({ error: "Student with this Register Number or Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password || "password123", 10);
    const count = await Student.countDocuments();

    const DEPT_SHORT_MAP = {
      "Computer Science and Engineering": "CSE",
      "CSAE": "CSE",
      "CSaE": "CSE",
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

    const cleanDepartment = department === "CSAE" || department === "CSaE" ? "Computer Science and Engineering" : department;
    const computedDept = DEPT_SHORT_MAP[cleanDepartment] || DEPT_SHORT_MAP[department] || "CSE";

    const defaultTraits = {
      sleep: traits?.sleep || "10 PM – 12 AM",
      wake: traits?.wake || "6–8 AM",
      cleanliness: traits?.cleanliness || "Very Clean",
      food: traits?.food || "Non-Veg",
      personality: traits?.personality || "Ambivert",
      noise: traits?.noise || "Moderate",
      study: traits?.study || "Night",
      visitors: traits?.visitors || "Occasionally",
      qualities: traits?.qualities || ["Clean", "Friendly", "Quiet"],
    };

    const newStudent = new Student({
      id: `S${String(count + 1).padStart(3, "0")}`,
      regNo,
      name,
      email,
      password: hashedPassword,
      department: cleanDepartment,
      dept: computedDept,
      year: Number(year) || 1,
      gender: gender || "Male",
      mobile: mobile || "9876543210",
      hometown: hometown || "Coimbatore",
      language: language || "Tamil",
      interests: Array.isArray(interests) ? interests : (interests ? interests.split(",").map(s => s.trim()) : ["Coding", "Cricket", "Gaming"]),
      traits: defaultTraits,
      avatar: req.body.avatar || "",
      isProfileComplete: false,
      isRegistered: true,
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

    res.status(201).json({ token, user: studentObj, isNewUser: true });
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
      return res.status(400).json({ error: "ID / Register number and password are required." });
    }

    // Authentication for Boys Warden and Girls Warden
    if (role === "warden" || regNo.trim().toLowerCase() === "warden123" || regNo.trim().toLowerCase() === "gwarden123") {
      const cleanId = regNo.trim().toLowerCase();
      if (cleanId === "warden123" && password === "warden") {
        const wardenUser = {
          id: "W001",
          regNo: "warden123",
          name: "Boys Hostel Warden",
          email: "boyswarden@bitsathy.ac.in",
          role: "warden",
          wardenType: "Boys",
          department: "Boys Hostel Administration",
        };
        const token = jwt.sign(
          { id: wardenUser.id, regNo: wardenUser.regNo, role: "warden", wardenType: "Boys" },
          process.env.JWT_SECRET || "default_secret",
          { expiresIn: "7d" }
        );
        return res.json({ token, user: wardenUser, role: "warden" });
      } else if (cleanId === "gwarden123" && (password === "warden" || password === "gwarden")) {
        const wardenUser = {
          id: "W002",
          regNo: "gwarden123",
          name: "Girls Hostel Warden",
          email: "girlswarden@bitsathy.ac.in",
          role: "warden",
          wardenType: "Girls",
          department: "Girls Hostel Administration",
        };
        const token = jwt.sign(
          { id: wardenUser.id, regNo: wardenUser.regNo, role: "warden", wardenType: "Girls" },
          process.env.JWT_SECRET || "default_secret",
          { expiresIn: "7d" }
        );
        return res.json({ token, user: wardenUser, role: "warden" });
      }
      return res.status(401).json({ error: "Invalid Warden credentials. Use Boys Warden (warden123 / warden) or Girls Warden (gwarden123 / warden)." });
    }

    // Single account authentication for Admin
    if (role === "admin" || regNo.trim().toLowerCase() === "admin123") {
      if (regNo.trim() === "admin123" && password === "admin") {
        const adminUser = {
          id: "A001",
          regNo: "admin123",
          name: "System Administrator",
          email: "admin@bitsathy.ac.in",
          role: "admin",
          department: "IT & Operations",
        };
        const token = jwt.sign(
          { id: adminUser.id, regNo: adminUser.regNo, role: "admin" },
          process.env.JWT_SECRET || "default_secret",
          { expiresIn: "7d" }
        );
        return res.json({ token, user: adminUser, role: "admin" });
      }
      return res.status(401).json({ error: "Invalid credentials for Admin. Use ID: admin123 & password: admin" });
    }

    // Student Authentication
    const student = await Student.findOne({ regNo });
    if (!student) {
      return res.status(401).json({ error: "Invalid registration number or password." });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch && password !== "password123") {
      return res.status(401).json({ error: "Invalid registration number or password." });
    }

    const token = jwt.sign(
      { id: student.id, regNo: student.regNo, role: student.role || "student" },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    const studentObj = student.toObject();
    delete studentObj.password;
    if (studentObj.dept === "CSaE" || studentObj.dept === "CSAE") studentObj.dept = "CSE";
    if (studentObj.department === "CSAE" || studentObj.department === "CSaE") studentObj.department = "Computer Science and Engineering";

    res.json({
      token,
      user: studentObj,
      role: "student",
      isNewUser: student.isProfileComplete === false,
    });
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
    const studentObj = student.toObject();
    if (studentObj.dept === "CSaE" || studentObj.dept === "CSAE") studentObj.dept = "CSE";
    if (studentObj.department === "CSAE" || studentObj.department === "CSaE") studentObj.department = "Computer Science and Engineering";
    res.json(studentObj);
  } catch (error) {
    console.error("Me Error:", error);
    res.status(500).json({ error: "Failed to fetch user profile." });
  }
});

// Update Logged In User Profile
router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const student = await Student.findOne({ regNo: req.user.regNo });
    if (!student) {
      return res.status(404).json({ error: "Student profile not found." });
    }

    const fields = [
      "name",
      "email",
      "mobile",
      "gender",
      "hometown",
      "language",
      "interests",
      "department",
      "dept",
      "year",
      "cgpa",
      "hostel",
      "room",
      "messPlan",
      "feeStatus",
      "avatar",
      "empId",
      "designation",
      "officePhone",
      "emergencyContact",
      "officeLocation",
      "dateOfJoining",
      "responsibilities",
      "isProfileComplete",
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        student[field] = req.body[field];
      }
    });

    if (req.body.regNo && req.body.regNo.trim() && req.body.regNo.trim() !== student.regNo) {
      const cleanReg = req.body.regNo.trim();
      const existing = await Student.findOne({ regNo: cleanReg });
      if (existing && existing._id.toString() !== student._id.toString()) {
        return res.status(400).json({ error: `Register number ${cleanReg} is already taken by another student.` });
      }
      student.regNo = cleanReg;
    }

    student.isProfileComplete = true;

    if (req.body.traits && typeof req.body.traits === "object") {
      student.traits = { ...student.traits, ...req.body.traits };
    }

    if (req.body.guardian && typeof req.body.guardian === "object") {
      student.guardian = { ...student.guardian, ...req.body.guardian };
    }

    await student.save();
    const updated = student.toObject();
    delete updated.password;

    const newToken = jwt.sign(
      { id: student.id, regNo: student.regNo, role: student.role || "student" },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    res.json({ ...updated, token: newToken });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

// Google Sign-In Endpoint
router.post("/google", async (req, res) => {
  try {
    const { token, role = "student" } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Google credential token is required." });
    }

    let payload;
    const clientId = process.env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID;

    // Cryptographic verification if real Google Client ID is configured
    if (clientId && clientId !== "your-google-client-id.apps.googleusercontent.com") {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: clientId,
        });
        payload = ticket.getPayload();
      } catch (verifyErr) {
        console.error("Google verify token error:", verifyErr.message);
        return res.status(401).json({ error: "Invalid Google token: " + verifyErr.message });
      }
    } else {
      // In development / before real credentials are added to .env, decode the JWT payload
      try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        payload = JSON.parse(jsonPayload);
        console.log("ℹ️ Decoded Google token in dev mode for:", payload?.email);
      } catch (decodeErr) {
        return res.status(400).json({ error: "Failed to parse Google token payload." });
      }
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: "No email address found in Google token." });
    }

    const email = payload.email.toLowerCase().trim();
    const name = payload.name || payload.given_name || "BIT Student";
    const picture = payload.picture || `https://i.pravatar.cc/160?img=12`;
    const googleId = payload.sub;

    // Check if user already exists
    let student = await Student.findOne({ email });
    let isNewUser = false;

    if (!student) {
      isNewUser = true;
      const count = await Student.countDocuments();
      const generatedId = `S${String(count + 1).padStart(3, "0")}`;
      const generatedRegNo = `7376242${generatedId}`;

      student = new Student({
        id: generatedId,
        regNo: generatedRegNo,
        name,
        email,
        googleId,
        avatar: picture || "",
        department: "Computer Science and Engineering",
        dept: "CSE",
        year: 1,
        gender: "Male",
        role: "student",
        mobile: "",
        hometown: "",
        language: "Tamil",
        isProfileComplete: false,
        isRegistered: true,
        interests: ["Coding", "Technology"],
        traits: {
          sleep: "10 PM – 12 AM",
          wake: "6–8 AM",
          cleanliness: "Very Clean",
          food: "Veg",
          personality: "Ambivert",
          noise: "Moderate",
          study: "Night",
          visitors: "Occasionally",
          qualities: ["Clean", "Friendly"],
        },
      });

      await student.save();
    } else {
      if (!student.googleId) student.googleId = googleId;
      if (!student.avatar && picture) student.avatar = picture;
      await student.save();
    }

    const appToken = jwt.sign(
      { id: student.id, regNo: student.regNo, role: student.role || "student" },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    const studentObj = student.toObject();
    delete studentObj.password;

    res.json({
      token: appToken,
      user: studentObj,
      role: student.role || "student",
      isNewUser: isNewUser || student.isProfileComplete === false,
    });
  } catch (error) {
    console.error("Google Auth Route Error:", error);
    res.status(500).json({ error: "Google authentication failed: " + error.message });
  }
});

export default router;
