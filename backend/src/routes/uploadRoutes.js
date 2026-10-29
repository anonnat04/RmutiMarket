const express = require("express");
const multer = require("multer");
const { supabase } = require("../config/db");
const { requireUserAuth } = require("../middleware/userAuth");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF) เท่านั้น"), false);
    }
  },
});

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "campus-market";

/**
 * POST /api/upload
 * Upload 1-10 images to Supabase Storage
 */
router.post("/", requireUserAuth, upload.array("images", 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "ไม่พบไฟล์รูปภาพที่ต้องการอัปโหลด" });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      const ext = file.originalname.split(".").pop() || "jpg";
      const filename = `${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        return res.status(500).json({ error: `อัปโหลดรูปภาพไม่สำเร็จ: ${uploadError.message}` });
      }

      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
      uploadedUrls.push(urlData.publicUrl);
    }

    res.json({ urls: uploadedUrls });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
