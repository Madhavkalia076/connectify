const path = require('path');
const multer = require('multer');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — generous enough for a photo, small enough that
                                            // one user can't fill up free-tier disk space quickly

// Shared by every route that accepts an image (message attachments, room images) — one place
// defining "what counts as a valid image upload" for the whole app, rather than each route
// re-declaring its own multer instance with the same rules.
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../uploads'),
    filename: (req, file, cb) => {
      // Never trust the original filename directly (it's attacker-controlled input — could
      // contain path traversal characters, collide with another upload, or just be unsafe to put
      // straight into a URL). Generate our own unique name, keep only the file extension.
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    // Checking the browser-supplied MIME type isn't a hard security guarantee (it can be spoofed),
    // but it's a reasonable first filter — real content-type enforcement would need to inspect the
    // file's actual bytes, which is more than this project's scope needs. Unrestricted file upload
    // is a classic vulnerability class (e.g. uploading a disguised executable) — this is the basic
    // mitigation: only accept a small allowlist of known-safe image types, nothing else.
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, GIF, or WEBP images are allowed.'));
    }
    cb(null, true);
  },
});

module.exports = upload;
