require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const generateRoute = require("./routes/generate"); // <-- Import the route

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve uploaded images

// Serve frontend static files (SPA)
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// API-only status route
app.get("/api/status", (req, res) => {
  res.send("Holord Backend Running 🚀");
});

// Use generate route
app.use("/generate", generateRoute);

// app.get('/*', (req,res) => res.sendFile(path.join(frontendPath,'index.html')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
