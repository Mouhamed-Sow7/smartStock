const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  createDemoUser,
} = require("../controllers/auth.controller"); // Routes publiques — PAS de middleware auth router.post("/register", register); router.post("/login", login); router.post("/demo", createDemoUser); // Route protégée — avec middleware auth const authMiddleware = require("../middleware/auth.middleware"); router.get("/me", authMiddleware, getProfile); module.exports = router;
