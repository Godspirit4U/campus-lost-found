const multer = require('multer');

/**
 * Files are held in memory, not written to disk: the storage adapter decides
 * where they live. That keeps one code path for local development and for
 * Supabase Storage, and means a rejected request never leaves a stray file.
 */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;

function fileFilter(req, file, cb) {
  if (!ALLOWED.includes(file.mimetype)) {
    const err = new Error('Only JPEG, PNG or WebP images are accepted.');
    err.status = 400;
    return cb(err);
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_BYTES, files: MAX_FILES },
});

module.exports = { upload, ALLOWED, MAX_BYTES, MAX_FILES };
