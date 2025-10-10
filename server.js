const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { testConnection } = require("./src/config/database");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:3000",
  "https://lumen-chatbot.vercel.app",
];

// Configure CORS to allow localhost and deployed frontend
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Headers to fix Cross-Origin-Opener-Policy / Google OAuth issues
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    message: "Lumen Backend API is running! (Database status: checking...)",
  });
});

app.get("/api/test", (req, res) => {
  res.json({ message: "Test endpoint works!" });
});

async function startServer() {
  try {
    const isConnected = await testConnection();

    if (!isConnected) {
      console.log(
        "⚠️  Database not available, starting server in limited mode"
      );
      console.log("Please start PostgreSQL service and restart the server");

      app.use((req, res) => {
        res.status(503).json({
          message: "Database not available. Please start PostgreSQL service.",
          instructions: "Run: net start postgresql-x64-17 (as Administrator)",
        });
      });
    } else {
      console.log("✅ Database connected successfully! Loading routes...");

      const authRoutes = require("./src/routes/auth");
      const chatRoutes = require("./src/routes/chat");
      const aiRoutes = require("./src/routes/ai");

      app.use("/api/auth", authRoutes);
      app.use("/api/chat", chatRoutes);
      app.use("/api/ai", aiRoutes);

      console.log("✅ All routes loaded successfully");
    }

    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ message: "Something went wrong!" });
    });

    app.use((req, res) => {
      res.status(404).json({ message: "Route not found" });
    });

    app.listen(PORT, () => {
      console.log(`\n🚀 Server is running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);

      if (isConnected) {
        console.log(`✅ Database: Connected`);
        
        console.log(`🤖 AI endpoints: http://localhost:${PORT}/api/ai/chat`);
        console.log(
          `🔐 Auth endpoints: http://localhost:${PORT}/api/auth/login`
        );
        console.log(
          `💬 Chat endpoints: http://localhost:${PORT}/api/chat/sessions`
        );
      } else {
        console.log(`❌ Database: Not connected - limited functionality`);
        console.log(`💡 Run as Administrator: net start postgresql-x64-17`);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
