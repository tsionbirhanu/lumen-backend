const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { testConnection } = require("./src/config/database");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

<<<<<<< HEAD
=======

>>>>>>> d322731d2d3577453661b4dedb6fa3e71ce0f83f
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
<<<<<<< HEAD
        
=======
>>>>>>> d322731d2d3577453661b4dedb6fa3e71ce0f83f
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
