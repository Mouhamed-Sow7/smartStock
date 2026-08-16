const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  createDemoUser,
  changerMonMotDePasse,
  modifierMonProfil,
  getAbonnement,
} = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/register", register);
router.post("/login", login);
router.post("/demo", createDemoUser);
router.post("/create-demo-user", createDemoUser);
router.get("/me", authMiddleware, getProfile);
router.patch("/profil", authMiddleware, modifierMonProfil);
router.get("/abonnement", authMiddleware, getAbonnement);
router.patch("/change-password", authMiddleware, changerMonMotDePasse);

module.exports = router;
