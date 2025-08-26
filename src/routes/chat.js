const express = require("express");
const router = express.Router();
const { pool } = require('../config/database');
const { v4: uuidv4 } = require("uuid");
const { authenticateToken } = require('../middleware/auth');


// ✅ Create new chat session
router.post("/sessions", authenticateToken, async (req, res) => {
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
});


// ✅ Get all sessions for logged-in user
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

// ✅ Get messages from a session
router.get("/sessions/:sessionId/messages", authenticateToken, async (req, res) => {
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
});

// ✅ Insert new message into session
router.post("/sessions/:sessionId/messages", authenticateToken, async (req, res) => {
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
});

// ✅ Rename session
router.put("/sessions/:sessionId", authenticateToken, async (req, res) => {
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
});

// ✅ Delete session
router.delete("/sessions/:sessionId", authenticateToken, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await pool.query(
      "SELECT * FROM chat_sessions WHERE session_id = $1 AND user_id = $2",
      [sessionId, req.user.id]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    await pool.query("DELETE FROM chat_sessions WHERE session_id = $1", [
      sessionId,
    ]);

    res.json({ message: "Session deleted successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
