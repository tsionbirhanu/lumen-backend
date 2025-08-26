const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

const router = express.Router();


// Register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user
    const newUser = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashedPassword]
    );

    // Generate token
    const token = jwt.sign(
      { userId: newUser.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      message: "User created successfully",
      token,
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.rows[0].password);

    if (!validPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        email: user.rows[0].email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Google OAuth - SIMPLIFIED VERSION
router.post("/google", async (req, res) => {
  try {
    const { email, name, picture, sub } = req.body;
    const randomPassword = require("crypto").randomBytes(16).toString("hex");

    // Check if user exists with this Google ID
    let user = await pool.query(
      "SELECT id, username, email, name, picture FROM users WHERE google_id = $1 OR email = $2",
      [sub, email]
    );

    if (user.rows.length === 0) {
      // Create new user
      const newUser = await pool.query(
        `INSERT INTO users (username, email, password, google_id, name, picture, auth_provider) 
   VALUES ($1, $2, $3, $4, $5, $6, 'google') 
   RETURNING id, username, email, name, picture`,
        [email, email, randomPassword, sub, name, picture]
      );

      user = newUser;
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: "Google login successful",
      token,
      user: user.rows[0],
    });
  } catch (error) {
  console.error("Google login error:", error);
  res.status(500).json({ message: "Server error" });
}

});

module.exports = router;
