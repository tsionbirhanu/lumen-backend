const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

const router = express.Router();
require('dotenv').config();

router.post(
  "/chat",
  authenticateToken,
  [
    body("message")
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ max: 1000 })
      .withMessage("Message too long"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const { message } = req.body;

      const callGeminiAPI = async () => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              contents: [{ 
                parts: [{ text: message }] 
              }] 
            }),
            signal: controller.signal,
          }
        );

        const data = await response.json();
        
        // Handle rate limiting
        if (response.status === 429) {
          console.log("Rate limited, retrying...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return callGeminiAPI();
        }

        if (!response.ok) {
          console.error("Gemini API error status:", response.status, "data:", data);
          throw new Error(`Gemini API failed: ${data.error?.message || response.status}`);
        }

        return data;
      };

      const data = await callGeminiAPI();

      let aiResponse =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Sorry, I couldn't generate a response.";

      res.json({ response: aiResponse });
    } catch (error) {
      console.error("Server error:", error.message);
      
      // More specific error messages
      if (error.message.includes('quota')) {
        res.status(429).json({ message: "API quota exceeded. Please try again later." });
      } else if (error.message.includes('API key')) {
        res.status(401).json({ message: "Invalid API key" });
      } else {
        res.status(500).json({ message: "Server error: " + error.message });
      }
    } finally {
      clearTimeout(timeout);
    }
  }
);

module.exports = router;