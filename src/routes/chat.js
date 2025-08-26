const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all chat sessions for user
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await pool.query(
      `SELECT cs.*, 
              (SELECT content FROM messages m 
               WHERE m.session_id = cs.id 
               ORDER BY m.created_at ASC 
               LIMIT 1) as first_message
       FROM chat_sessions cs
       WHERE cs.user_id = $1
       ORDER BY cs.updated_at DESC`,
      [req.user.id]
    );

    res.json(sessions.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages for a specific session
router.get('/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    // Verify user owns this session
    const session = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.user.id]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const messages = await pool.query(
      'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );

    res.json(messages.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new chat session
router.post('/sessions', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body;
    const sessionId = Date.now().toString();
    
    const newSession = await pool.query(
      'INSERT INTO chat_sessions (user_id, session_id, title) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, sessionId, title || 'New Chat']
    );

    res.status(201).json(newSession.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a message to a session
router.post('/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { content, isUser } = req.body;
    
    // Verify user owns this session
    const session = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.user.id]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const newMessage = await pool.query(
      'INSERT INTO messages (session_id, content, is_user) VALUES ($1, $2, $3) RETURNING *',
      [sessionId, content, isUser]
    );

    // Update session updated_at timestamp
    await pool.query(
      'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [sessionId]
    );

    res.status(201).json(newMessage.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a chat session
router.delete('/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    // Verify user owns this session
    const session = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.user.id]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    await pool.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId]);

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Rename a chat session
router.put('/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { title } = req.body;
    
    // Verify user owns this session
    const session = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.user.id]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const updatedSession = await pool.query(
      'UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [title, sessionId]
    );

    res.json(updatedSession.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;