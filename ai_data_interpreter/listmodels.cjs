require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

    // v0.24.1 requires using the REST endpoint through the client
    const result = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + process.env.GOOGLE_API_KEY);
    const json = await result.json();

    console.log("✅ Available Gemini models:");
    if (json.models) {
      json.models.forEach(m => console.log("-", m.name));
    } else {
      console.log("⚠️ No models found or invalid API key");
      console.log(json);
    }

  } catch (err) {
    console.error("Error listing models:", err);
  }
}

listModels();
