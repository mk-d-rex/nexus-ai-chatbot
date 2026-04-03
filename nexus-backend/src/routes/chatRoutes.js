import express from "express";
import { analyzeSentiment, generateReply } from "../services/aiService.js";
import Session from "../models/Session.js";

const router = express.Router();

// ================= CHAT =================
router.post("/chat", async (req, res) => {
  try {
    const { message, sessionId, userId } = req.body;

    console.log("MESSAGE:", message);

    let session = null;

    // 🔍 Find existing session (AND ensure it belongs to user)
    if (sessionId) {
      session = await Session.findOne({ _id: sessionId, userId });
    }

    // 🆕 Create new session if not found
    if (!session) {
      session = new Session({
        userId: userId, // 🔥 user-specific
        title: message.slice(0, 40),
        messages: [],
        sentimentLog: []
      });
    }

    // 🧠 Analyze sentiment
    const sentiment = await analyzeSentiment(message);

    // 💬 Save user message
    session.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
      sentiment
    });

    // 🤖 Generate reply
    const reply = await generateReply(message);

    // 💬 Save bot message
    session.messages.push({
      role: "assistant",
      content: reply,
      timestamp: new Date(),
      sentiment: null
    });

    // 📊 Log sentiment
    session.sentimentLog.push({
      ...sentiment,
      timestamp: new Date()
    });

    // 💾 Save to DB
    await session.save();

    // 📤 Send response
    res.json({
      sentiment,
      reply,
      sessionId: session._id
    });

  } catch (err) {
    console.error("ROUTE ERROR:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


// ================= GET SESSIONS =================
router.get("/sessions", async (req, res) => {
  try {
    const { userId } = req.query;

    const sessions = await Session.find({ userId }).sort({ createdAt: -1 });

    res.json(sessions);
  } catch (err) {
    console.error("FETCH ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

export default router;