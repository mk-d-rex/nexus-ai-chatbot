import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  role: String,
  content: String,
  timestamp: Date,
  sentiment: Object
});

const sessionSchema = new mongoose.Schema({
  userId: String,
  title: String,
  messages: [messageSchema],
  sentimentLog: Array,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Session", sessionSchema);