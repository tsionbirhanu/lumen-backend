const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");

const router = express.Router();
require('dotenv').config();

const RATE_LIMIT_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_MESSAGE_LENGTH = 1000;

// Rate limiting configuration
const aiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: "Rate limit exceeded",
      message: "Too many AI requests. Please try again in a minute.",
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
    });
  }
});

// API Configuration
const GEMINI_CONFIG = {
  model: "gemini-2.0-flash-001",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 1000,
    topP: 0.8,
    topK: 40
  }
};

async function callGeminiAPI(message, signal) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: message }] }],
      generationConfig: GEMINI_CONFIG.generationConfig
    }),
    signal
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  return await response.json();
}

function extractAIResponse(data) {
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  
  if (data.promptFeedback?.blockReason) {
    return `Message blocked: ${data.promptFeedback.blockReason}`;
  }
  
  return "Sorry, I couldn't generate a response at this time.";
}

router.post(
  "/chat",
  authenticateToken,
  aiLimiter,
  [
    body("message")
      .trim()
      .notEmpty()
      .withMessage("Message is required")
      .isLength({ max: MAX_MESSAGE_LENGTH })
      .withMessage(`Message must be less than ${MAX_MESSAGE_LENGTH} characters`),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: "Validation failed",
        details: errors.array() 
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY environment variable is not configured");
      return res.status(500).json({ 
        error: "Service unavailable",
        message: "AI service is temporarily unavailable"
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const { message } = req.body;
      
      console.log(`AI Chat request from user ${req.user.id}: ${message.substring(0, 50)}...`);
      
      const apiResponse = await callGeminiAPI(message, controller.signal);
      const aiResponse = extractAIResponse(apiResponse);
      
      console.log(`AI Chat response generated for user ${req.user.id}`);
      
      res.json({ 
        response: aiResponse,
        usage: apiResponse.usageMetadata 
      });
      
    } catch (error) {
      console.error(`AI Chat error for user ${req.user?.id}:`, error.message);
      
      let statusCode = 500;
      let userMessage = "An unexpected error occurred";
      
      if (error.name === 'AbortError') {
        statusCode = 408;
        userMessage = "Request timeout - AI service took too long to respond";
      } else if (error.message.includes('API key') || error.message.includes('auth')) {
        statusCode = 401;
        userMessage = "Invalid API configuration";
      } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
        statusCode = 429;
        userMessage = "AI service quota exceeded. Please try again later.";
      }
      
      res.status(statusCode).json({ 
        error: "AI service error",
        message: userMessage,
        ...(process.env.NODE_ENV === 'development' && { debug: error.message })
      });
    } finally {
      clearTimeout(timeout);
    }
  }
);

module.exports = router;