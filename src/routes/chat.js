const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const { authenticateToken } = require("../middleware/auth");
const { body, param, validationResult } = require("express-validator");

// CREATE SESSION
router.post(
  "/sessions",
  authenticateToken,
  [
    body("title")
      .optional()
      .isString()
      .withMessage("Title must be a string")
      .isLength({ max: 100 })
      .withMessage("Title cannot exceed 100 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const sessionId = uuidv4();
      const newSession = await pool.query(
        "INSERT INTO chat_sessions (session_id, user_id, title) VALUES ($1, $2, $3) RETURNING *",
        [sessionId, req.user.id, req.body.title || "New Chat"]
      );
      res.json(newSession.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// GET ALL SESSIONS
router.get("/sessions", authenticateToken, async (req, res) => {
  try {
    const sessions = await pool.query(
      "SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC",
      [req.user.id]
    );
    res.json(sessions.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET MESSAGES OF A SESSION
router.get(
  "/sessions/:sessionId/messages",
  authenticateToken,
  [
    param("sessionId").notEmpty().withMessage("Session ID is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sessionId } = req.params;
    try {
      const session = await pool.query(
        "SELECT * FROM chat_sessions WHERE session_id = $1 AND user_id = $2",
        [sessionId, req.user.id]
      );

      if (session.rows.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }

      const messages = await pool.query(
        "SELECT * FROM messages WHERE session_id = (SELECT id FROM chat_sessions WHERE session_id = $1) ORDER BY created_at ASC",
        [sessionId]
      );

      res.json(messages.rows);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// SEND MESSAGE
router.post(
  "/sessions/:sessionId/messages",
  authenticateToken,
  [
    param("sessionId").notEmpty().withMessage("Session ID is required"),
    body("content")
      .notEmpty()
      .withMessage("Message content is required")
      .isLength({ max: 2000 })
      .withMessage("Message cannot exceed 2000 characters"),
    body("isUser")
      .isBoolean()
      .withMessage("isUser must be a boolean value"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sessionId } = req.params;
    const { content, isUser } = req.body;

    try {
      const newMessage = await pool.query(
        "INSERT INTO messages (session_id, content, is_user) VALUES ((SELECT id FROM chat_sessions WHERE session_id = $1), $2, $3) RETURNING *",
        [sessionId, content, isUser]
      );

      await pool.query(
        "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_id = $1",
        [sessionId]
      );

      res.json(newMessage.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// UPDATE SESSION TITLE
router.put(
  "/sessions/:sessionId",
  authenticateToken,
  [
    param("sessionId").notEmpty().withMessage("Session ID is required"),
    body("title")
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ max: 100 })
      .withMessage("Title cannot exceed 100 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sessionId } = req.params;
    const { title } = req.body;

    try {
      const updatedSession = await pool.query(
        "UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE session_id = $2 AND user_id = $3 RETURNING *",
        [title, sessionId, req.user.id]
      );

      if (updatedSession.rows.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json(updatedSession.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// DELETE SESSION
router.delete(
  "/sessions/:sessionId",
  authenticateToken,
  [param("sessionId").notEmpty().withMessage("Session ID is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sessionId } = req.params;

    try {
      const session = await pool.query(
        "SELECT * FROM chat_sessions WHERE session_id = $1 AND user_id = $2",
        [sessionId, req.user.id]
      );

      if (session.rows.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }

      await pool.query("DELETE FROM chat_sessions WHERE session_id = $1", [sessionId]);

      res.json({ message: "Session deleted successfully" });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
