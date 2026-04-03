# Nexus-chatbot
🚀 Nexus — Full-Stack AI Chatbot with Sentiment Analysis

Nexus is a full-stack AI chatbot platform that delivers intelligent, context-aware conversations with real-time sentiment tracking. Built using modern web technologies and powered by local LLM inference, Nexus focuses on performance, privacy, and scalability.

🧩 Tech Stack
Frontend: React (Vite)
Backend: Node.js + Express
Database: MongoDB
AI Engine: Ollama (LLaMA 3)
Analytics: Recharts
State Management: React Hooks
✨ Features
💬 Real-time AI Chat
Context-aware responses using LLMs
Smooth async message handling
🧠 Sentiment Analysis
Detects user emotion (positive / neutral / negative)
Stores sentiment logs in database
📊 Analytics Dashboard
Visual sentiment trends using charts
Session-level insights
👥 Multi-User Support
Session-based architecture
User-specific chat history
🔒 Privacy-First AI
Runs locally using Ollama
No dependency on external APIs
🏗️ Architecture Overview
Frontend (React)
      ↓
Backend API (Node.js + Express)
      ↓
AI Layer (Ollama - LLaMA 3)
      ↓
Database (MongoDB)
📂 Project Structure
nexus/
│
├── frontend/        # React (Vite) client
├── backend/         # Express server
├── models/          # MongoDB schemas
├── routes/          # API endpoints
├── controllers/     # Business logic
├── utils/           # Sentiment analysis & helpers
└── README.md
