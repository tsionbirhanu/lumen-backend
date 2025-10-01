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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: message }] }] }),
            signal: controller.signal,
          }
        );

        const data = await response.json();
        if (response.status === 429) {
          const retryDelay =
            data?.error?.details?.find((d) =>
              d["@type"].includes("RetryInfo")
            )?.retryDelay || "5s";

          const delayMs = parseInt(retryDelay) * 1000 || 5000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          return callGeminiAPI();
        }

        if (!response.ok) {
          console.error("Gemini API error status:", response.status, "data:", data); // ADDED STATUS LOG
          throw new Error("Gemini API failed with status " + response.status); // Throw status
        }

        return data;
      };

      const data = await callGeminiAPI();

      let aiResponse =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Sorry, I couldn't generate a response.";

      // Clean up newlines and extra spaces
      // aiResponse = aiResponse.replace(/\n+/g, " ").trim();

      res.json({ response: aiResponse });
    } catch (error) {
      console.error("Server error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      clearTimeout(timeout);
    }
  }
);

module.exports = router;
