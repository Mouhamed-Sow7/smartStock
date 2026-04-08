const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "smartstock-secret-key-2024";
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "Token non fourni" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.tenantId = decoded.tenantId || "default";
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Token invalide ou expiré" });
  }
};
module.exports = authMiddleware;
