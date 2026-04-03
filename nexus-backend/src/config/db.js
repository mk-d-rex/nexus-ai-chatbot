import mongoose from "mongoose";

export async function connectDB() {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/nexusDB");
    console.log("MongoDB connected 🚀");
  } catch (err) {
    console.error("DB connection error:", err.message);
  }
}