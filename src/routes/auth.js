const express = require("express");
const bcrypt = require("bcryptjs");
const { authenticateToken } = require('../middleware/auth')
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../config/database");
const { body, validationResult } = require("express-validator");
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "15m" });
};

const generateRefreshToken = async (userId) => {
  const refreshToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, refreshToken, expiresAt]
  );

  return refreshToken;
};

// REGISTER
router.post(
  "/register",
  [
    body("username")
      .isLength({ min: 3, max: 20 })
      .withMessage("Username must be 3-20 characters"),
    body("email").isEmail().withMessage("Invalid email"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/\d/)
      .withMessage("Password must contain a number")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { username, email, password } = req.body;

      const userExists = await pool.query(
        "SELECT * FROM users WHERE email = $1 OR username = $2",
        [email, username]
      );

      if (userExists.rows.length > 0) {
        return res.status(400).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await pool.query(
        "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
        [username, email, hashedPassword]
      );

      const accessToken = generateAccessToken(newUser.rows[0].id);
      const refreshToken = await generateRefreshToken(newUser.rows[0].id);

      res.status(201).json({
        message: "User created successfully",
        accessToken,
        refreshToken,
        user: newUser.rows[0],
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// LOGIN
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Invalid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password } = req.body;

      const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (user.rows.length === 0)
        return res.status(400).json({ message: "Invalid credentials" });

      const validPassword = await bcrypt.compare(password, user.rows[0].password);
      if (!validPassword) return res.status(400).json({ message: "Invalid credentials" });

      const accessToken = generateAccessToken(user.rows[0].id);
      const refreshToken = await generateRefreshToken(user.rows[0].id);

      res.json({
        message: "Login successful",
        accessToken,
        refreshToken,
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
  }
);

// GOOGLE OAUTH
// router.post(
//   "/google",
//   [
//     body("email").isEmail().withMessage("Invalid email"),
//     body("sub").notEmpty().withMessage("Google ID required"),
//     body("name").notEmpty().withMessage("Name is required"),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

//     try {
//       const { email, name, picture, sub } = req.body;
//       const randomPassword = crypto.randomBytes(16).toString("hex");

//       let user = await pool.query(
//         "SELECT id, username, email, name, picture FROM users WHERE google_id = $1 OR email = $2",
//         [sub, email]
//       );

//       if (user.rows.length === 0) {
//         const newUser = await pool.query(
//           `INSERT INTO users (username, email, password, google_id, name, picture, auth_provider) 
//            VALUES ($1, $2, $3, $4, $5, $6, 'google') 
//            RETURNING id, username, email, name, picture`,
//           [email, email, randomPassword, sub, name, picture]
//         );
//         user = newUser;
//       }

//       const accessToken = generateAccessToken(user.rows[0].id);
//       const refreshToken = await generateRefreshToken(user.rows[0].id);

//       res.json({
//         message: "Google login successful",
//         accessToken,
//         refreshToken,
//         user: user.rows[0],
//       });
//     } catch (error) {
//       console.error("Google login error:", error);
//       res.status(500).json({ message: "Server error" });
//     }
//   }
// );

router.post(
  "/google",
  [
    // The frontend should only send the ID Token now, so we validate for it.
    body("idToken").notEmpty().withMessage("Google ID Token is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { idToken } = req.body;

      // 1. Verify the ID Token with Google
      const ticket = await client.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      
      const payload = ticket.getPayload();
      const { sub, email, name, picture } = payload; // Extract data from verified token

      // You need to have a `google_id` column in your `users` table
      
      let user = await pool.query(
        "SELECT id, username, email, name, picture FROM users WHERE google_id = $1 OR email = $2",
        [sub, email]
      );

      if (user.rows.length === 0) {
        // New user registration
        const randomPassword = crypto.randomBytes(16).toString("hex");
        const newUser = await pool.query(
          `INSERT INTO users (username, email, password, google_id, name, picture, auth_provider) 
           VALUES ($1, $2, $3, $4, $5, $6, 'google') 
           RETURNING id, username, email, name, picture`,
          [name || email.split('@')[0], email, randomPassword, sub, name, picture] // Use name or part of email for username
        );
        user = newUser;
      }

      const accessToken = generateAccessToken(user.rows[0].id);
      const refreshToken = await generateRefreshToken(user.rows[0].id);

      res.json({
        message: "Google login successful",
        accessToken,
        refreshToken,
        user: user.rows[0],
      });
    } catch (error) {
      console.error("Google ID Token validation or login error:", error);
      // Send a 401 for token-related errors
      if (error.message.includes('Token used too early') || error.message.includes('Invalid token')) {
          return res.status(401).json({ message: "Invalid or expired Google ID token" });
      }
      res.status(500).json({ message: "Server error during Google login" });
    }
  }
);

// REFRESH
router.post(
  "/refresh",
  [body("refreshToken").notEmpty().withMessage("Refresh token required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { refreshToken } = req.body;
      const result = await pool.query(
        "SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()",
        [refreshToken]
      );

      if (result.rows.length === 0)
        return res.status(403).json({ message: "Invalid or expired refresh token" });

      const userId = result.rows[0].user_id;
      const newAccessToken = generateAccessToken(userId);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// LOGOUT
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);
    }
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// PROFILE
router.get("/profile", authenticateToken, async (req, res) => {
    // The authenticateToken middleware has already fetched the user data
    // and attached it to req.user, excluding the password hash.
    
    // The query in auth.js: 'SELECT id, username, email, name, picture FROM users...'
    
    // If you need more fields, update the query in middleware/auth.js

    res.json({
        message: "Profile retrieved successfully",
        user: req.user,
    });
});

module.exports = router;
