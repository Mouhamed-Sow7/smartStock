const mongoose = require("mongoose");
const connectDB = async () => {
  try {
    console.log("Connexion à MongoDB en cours...");
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/smartStock",
    );
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
module.exports = connectDB;
