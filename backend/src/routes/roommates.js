import express from "express";
import { Student } from "../models/Student.js";
import { RoommateRequest } from "../models/RoommateRequest.js";

const router = express.Router();

function calculateCompatibility(s1, s2) {
  let score = 45;
  if (s1.department === s2.department) score += 10;
  if (s1.hometown && s2.hometown && s1.hometown.toLowerCase() === s2.hometown.toLowerCase()) score += 8;
  if (s1.language && s2.language && s1.language.toLowerCase() === s2.language.toLowerCase()) score += 8;
  if (s1.traits?.food === s2.traits?.food) score += 6;
  if (s1.traits?.sleep === s2.traits?.sleep) score += 6;
  if (s1.traits?.wake === s2.traits?.wake) score += 4;
  if (s1.traits?.cleanliness === s2.traits?.cleanliness) score += 5;
  if (s1.traits?.noise === s2.traits?.noise) score += 5;
  if (s1.traits?.personality === s2.traits?.personality) score += 4;
  if (s1.traits?.study === s2.traits?.study) score += 4;
  if (s1.traits?.visitors === s2.traits?.visitors) score += 4;

  const sharedInterests = s1.interests?.filter((i) => s2.interests?.includes(i)) || [];
  score += Math.min(15, sharedInterests.length * 3);

  return Math.min(99, Math.max(55, Math.round(score)));
}


// GET recommended roommate matches
router.get("/matches", async (req, res) => {
  try {
    const { regNo, gender, department, search } = req.query;

    const currentStudent = regNo
      ? await Student.findOne({ regNo })
      : await Student.findOne({ regNo: "7376242AD142" });

    const filter = { regNo: { $ne: currentStudent ? currentStudent.regNo : "" } };
    if (gender) filter.gender = gender;
    else if (currentStudent) filter.gender = currentStudent.gender;

    if (department && department !== "All") filter.department = department;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { regNo: { $regex: search, $options: "i" } },
        { hometown: { $regex: search, $options: "i" } },
      ];
    }

    const students = await Student.find(filter).limit(100).select("-password");

    const existingRequests = await RoommateRequest.find({
      $or: [
        { requesterRegNo: currentStudent?.regNo || "" },
        { targetRegNo: currentStudent?.regNo || "" },
      ],
    });

    const requestMap = new Map();
    existingRequests.forEach((req) => {
      const otherReg = req.requesterRegNo === currentStudent?.regNo ? req.targetRegNo : req.requesterRegNo;
      requestMap.set(otherReg, req.status);
    });

    const matches = students.map((s, idx) => {
      const compatibility = currentStudent
        ? calculateCompatibility(currentStudent, s)
        : 60 + ((idx * 7) % 39);

      return {
        ...s.toObject(),
        matchId: `M${String(idx + 1).padStart(3, "0")}`,
        compatibility,
        status: requestMap.get(s.regNo) || "Suggested",
      };
    }).sort((a, b) => b.compatibility - a.compatibility);

    res.json(matches);
  } catch (error) {
    console.error("Roommate Matches Error:", error);
    res.status(500).json({ error: "Failed to fetch roommate recommendations." });
  }
});

// POST send or update roommate request
router.post("/request", async (req, res) => {
  try {
    const { requesterRegNo, targetRegNo, status } = req.body;

    if (!requesterRegNo || !targetRegNo) {
      return res.status(400).json({ error: "Requester and target registration numbers are required." });
    }

    let request = await RoommateRequest.findOne({
      $or: [
        { requesterRegNo, targetRegNo },
        { requesterRegNo: targetRegNo, targetRegNo: requesterRegNo },
      ],
    });

    if (request) {
      request.status = status || "Requested";
      await request.save();
    } else {
      const count = await RoommateRequest.countDocuments();
      request = new RoommateRequest({
        matchId: `M${String(count + 1).padStart(3, "0")}`,
        requesterRegNo,
        targetRegNo,
        compatibility: 85,
        status: status || "Requested",
      });
      await request.save();
    }

    res.json({ message: "Roommate request updated successfully", request });
  } catch (error) {
    console.error("Roommate Request Error:", error);
    res.status(500).json({ error: "Failed to process roommate request." });
  }
});

// POST execute compatibility auto-match algorithm
router.post("/auto-match", async (req, res) => {
  try {
    const { gender = "Male", minScore = 70 } = req.body;
    const students = await Student.find({ gender })
      .select("id regNo name department dept year hometown language traits interests avatar")
      .limit(60);

    const matches = [];
    const used = new Set();

    for (let i = 0; i < students.length; i++) {
      if (used.has(students[i].regNo)) continue;
      let bestMatch = null;
      let highestScore = 0;

      for (let j = i + 1; j < students.length; j++) {
        if (used.has(students[j].regNo)) continue;
        const score = calculateCompatibility(students[i], students[j]);
        if (score > highestScore && score >= minScore) {
          highestScore = score;
          bestMatch = students[j];
        }
      }

      if (bestMatch) {
        used.add(students[i].regNo);
        used.add(bestMatch.regNo);
        matches.push({
          id: `PAIR_${students[i].regNo}_${bestMatch.regNo}`,
          student1: students[i],
          student2: bestMatch,
          compatibility: highestScore,
          status: "High Compatibility Pair",
        });
      }
    }

    res.json({
      success: true,
      count: matches.length,
      matches,
      message: `Successfully executed compatibility algorithm: ${matches.length} high-compatibility roommate pairings identified.`,
    });
  } catch (error) {
    console.error("Auto Match Error:", error);
    res.status(500).json({ error: "Failed to run auto-match algorithm." });
  }
});

export default router;
