const multer = require("multer");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Only JPG, PNG, and WEBP image files are allowed.");
    error.status = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8,
  },

  fileFilter,
});

module.exports = upload;
