import express from "express";
import { Notification } from "../models/Notification.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// GET notifications
router.get("/", async (req, res) => {
  try {
    const { category, regNo } = req.query;
    const query = {};

    if (category && category !== "All") query.category = category;
    if (regNo) {
      query.$or = [{ regNo }, { regNo: null }, { regNo: "All" }];
    }

    const list = await Notification.find(query).sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    console.error("Fetch Notifications Error:", error);
    res.status(500).json({ error: "Failed to fetch notifications." });
  }
});

// POST broadcast / send new announcement notification
router.post("/", verifyToken, async (req, res) => {
  try {
    const { title, body, category, regNo } = req.body;

    if (!title || (!body && !req.body.message)) {
      return res.status(400).json({ error: "Notification title and body message are required." });
    }

    const count = await Notification.countDocuments();
    const newId = `N${String(count + 1).padStart(3, "0")}`;

    const newNotification = new Notification({
      id: newId,
      title: title.trim(),
      body: (body || req.body.message).trim(),
      category: category || "General",
      date: new Date().toISOString().slice(0, 10),
      read: false,
      regNo: regNo && regNo !== "All" ? regNo.trim() : null,
    });

    await newNotification.save();
    res.status(201).json(newNotification);
  } catch (error) {
    console.error("Create Notification Error:", error);
    res.status(500).json({ error: "Failed to broadcast notification." });
  }
});

// PATCH mark notification read
router.patch("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOne({
      $or: [{ id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found." });
    }

    notification.read = true;
    await notification.save();
    res.json(notification);
  } catch (error) {
    console.error("Update Notification Error:", error);
    res.status(500).json({ error: "Failed to update notification." });
  }
});

// DELETE notification
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOne({
      $or: [{ id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found." });
    }

    await Notification.deleteOne({ _id: notification._id });
    res.json({ message: "Notification removed successfully." });
  } catch (error) {
    console.error("Delete Notification Error:", error);
    res.status(500).json({ error: "Failed to delete notification." });
  }
});

export default router;
