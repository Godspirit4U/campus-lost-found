const express = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  registerSchema, loginSchema, updateProfileSchema, changePasswordSchema,
  forgotPasswordSchema, verifyOtpSchema, resetPasswordSchema,
} = require('../utils/schemas');

const router = express.Router();

// Brute force protection on the credential endpoints only.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

// Password recovery is limited more tightly than ordinary auth traffic.
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

router.post('/register', authLimiter, validate(registerSchema), c.register);
router.post('/forgot-password', recoveryLimiter, validate(forgotPasswordSchema), c.forgotPassword);
router.post('/verify-otp', recoveryLimiter, validate(verifyOtpSchema), c.verifyOtp);
router.post('/reset-password', recoveryLimiter, validate(resetPasswordSchema), c.resetPassword);
router.post('/login', authLimiter, validate(loginSchema), c.login);
router.post('/logout', requireAuth, c.logout);
router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, validate(updateProfileSchema), c.updateProfile);
router.patch('/password', requireAuth, validate(changePasswordSchema), c.changePassword);

module.exports = router;
