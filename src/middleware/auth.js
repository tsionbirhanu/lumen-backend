const jwt = require('jsonwebtoken');
// const pool = require('../config/database');
const { pool } = require('../config/database');


const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await pool.query(
      'SELECT id, username, email, name, picture FROM users WHERE id = $1', 
      [decoded.userId]
    );
    
    if (user.rows.length === 0) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    
    req.user = user.rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { authenticateToken };