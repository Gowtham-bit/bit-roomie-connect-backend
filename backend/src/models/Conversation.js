import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    // Array of participant IDs (e.g. Student ID "S001" or regNo "211CS101", or Warden "W001")
    participants: [{ type: String, required: true, index: true }],
    lastMessage: { type: String, default: "" },
    lastMessageSender: { type: String, default: "" },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
