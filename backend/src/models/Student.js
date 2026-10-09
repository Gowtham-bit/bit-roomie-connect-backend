import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    regNo: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    department: { type: String, required: true },
    dept: { type: String, required: true },
    year: { type: Number, required: true },
    gender: { type: String, enum: ["Male", "Female"], default: "Male" },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, default: "9876543210" },
    hometown: { type: String, default: "Coimbatore" },
    language: { type: String, default: "Tamil" },
    interests: [{ type: String }],
    hostel: { type: String, default: "Not Allocated" },
    room: { type: String, default: "—" },
    messPlan: { type: String, default: "Vegetarian" },
    feeStatus: { type: String, default: "Term I Paid" },
    cgpa: { type: String, default: "8.50" },
    avatar: { type: String },
    compatibility: { type: Number, default: 85 },
    role: { type: String, enum: ["student", "warden", "admin"], default: "student" },
    guardian: {
      name: { type: String, default: "Subramanian R" },
      relation: { type: String, default: "Father" },
      mobile: { type: String, default: "9843112233" },
      occupation: { type: String, default: "Agriculturist" },
    },
    traits: {
      sleep: { type: String, default: "10 PM – 12 AM" },
      wake: { type: String, default: "6–8 AM" },
      cleanliness: { type: mongoose.Schema.Types.Mixed, default: "Very Clean" },
      food: { type: String, default: "Non-Veg" },
      personality: { type: String, default: "Ambivert" },
      noise: { type: String, default: "Moderate" },
      study: { type: String, default: "Night" },
      visitors: { type: String, default: "Occasionally" },
      qualities: [{ type: String }],
    },
  },
  { timestamps: true, strict: false }
);

export const Student = mongoose.model("Student", studentSchema);


