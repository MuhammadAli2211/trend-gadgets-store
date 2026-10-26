const multer = require("multer");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "video/mp4",
    "video/mov",
    "video/quicktime",
    "video/webm",
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Only JPG, PNG, WEBP images and MP4, MOV, WEBM videos are allowed");
    error.status = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10,
  },
  fileFilter,
});

module.exports = upload;
