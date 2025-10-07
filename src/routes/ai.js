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
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const { message } = req.body;

      // gemini-2.0-flash
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: message
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000
            }
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Gemini API error:", errorData);
        
        // Handle rate limiting
        if (response.status === 429) {
          return res.status(429).json({ 
            message: "Rate limit exceeded. Please try again in a moment." 
          });
        }
        
        throw new Error(`Gemini API error: ${errorData.error?.message || response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                        "Sorry, I couldn't generate a response.";

      res.json({ response: aiResponse });
    } catch (error) {
      console.error("Server error:", error.message);
      res.status(500).json({ message: "Server error: " + error.message });
    } finally {
      clearTimeout(timeout);
    }
  }
);

module.exports = router;