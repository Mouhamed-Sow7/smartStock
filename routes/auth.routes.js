const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", authController.getProfile);
router.post("/demo", authController.createDemoUser);

module.exports = router;
