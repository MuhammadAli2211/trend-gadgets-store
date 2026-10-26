const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

const User = require("./models/User");

dotenv.config();

const createAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword || adminPassword.length < 12) {
      throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) before creating the admin user.");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    const existingAdmin = await User.findOne({
      email: adminEmail,
    });

    if (existingAdmin) {
      console.log("Admin already exists");

      await mongoose.disconnect();
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await User.create({
      name: "Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
    });

    console.log("Admin created successfully");
    console.log("Admin email:", adminEmail);

    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    console.error("Admin creation failed:", error);

    process.exit(1);
  }
};

createAdmin();
