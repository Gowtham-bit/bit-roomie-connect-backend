import mongoose from "mongoose";

const roomChangeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    regNo: { type: String, required: true },
    studentName: { type: String, required: true },
    currentHostel: { type: String, required: true },
    currentRoom: { type: String, required: true },
    targetHostel: { type: String, required: true },
    roomType: { type: String, default: "Non-AC" },
    sharing: { type: Number, default: 2 },
    reason: { type: String, required: true },
    parentName: { type: String, default: "R. Subramanian" },
    parentMobile: { type: String, default: "9843112233" },
    medicalInfo: { type: String, default: "" },
    status: { type: String, default: "Pending Warden Review" },
    allottedRoom: { type: String, default: "" },
    appliedDate: { type: String, required: true },
  },
  { timestamps: true, strict: false }
);

export const RoomChange = mongoose.model("RoomChange", roomChangeSchema);

