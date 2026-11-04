const express = require("express");

const upload = require("../config/contentMulter");

const {
  createProductUploadSignature,
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
} = require("../controllers/productController");

const {
  protect,
  adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(adminOnly);

router.get("/", getProducts);

router.get("/:id", getProduct);

router.post("/upload-signature", express.json(), createProductUploadSignature);

router.post(
  "/",
  upload.fields([
    { name: "images", maxCount: 8 },
    { name: "videos", maxCount: 2 },
    { name: "productImage", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  createProduct
);

router.put(
  "/:id",
  upload.fields([
    { name: "images", maxCount: 8 },
    { name: "videos", maxCount: 2 },
    { name: "video", maxCount: 1 },
  ]),
  updateProduct
);

router.delete(
  "/:id",
  deleteProduct
);

router.put(
  "/:id/toggle-status",
  toggleProductStatus
);

module.exports = router;
