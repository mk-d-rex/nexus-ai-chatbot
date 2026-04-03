import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";

// SENTIMENT
export async function analyzeSentiment(text) {
  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3",
        prompt: `
You are a sentiment analysis API.

Return ONLY JSON. No explanation.

Format:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": number between 0 and 1
}

Text: "${text}"
        `,
        stream: false
      })
    });

    const data = await res.json();

    // 🔥 Extract text safely
    const raw = data.response.trim();

    // 🔥 Try parsing JSON inside text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      sentiment: parsed.sentiment || "neutral",
      score: typeof parsed.score === "number" ? parsed.score : 0.5
    };

  } catch (err) {
    console.error("Sentiment error:", err.message);

    return {
      sentiment: "neutral",
      score: 0.5
    };
  }
}

// CHAT
export async function generateReply(message) {
  try {
    const res = await axios.post(OLLAMA_URL, {
      model: "llama3",
      prompt: message,
      stream: false
    });

    console.log("OLLAMA RAW:", res.data);

    return res.data.response;

  } catch (err) {
    console.error("Reply error:", err.message);
    return "Local AI error.";
  }
}