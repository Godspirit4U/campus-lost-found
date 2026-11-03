const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, PasswordReset } = require('../models');
const otp = require('../utils/otp');
const mailer = require('../utils/mailer');
const { serializeUser } = require('../utils/serialize');
const { audit } = require('../utils/audit');

function signToken(user) {
  return jwt.sign(
    // ver is the session epoch: it is bumped on every password change, so old
    // tokens stop working without any server-side session store.
    { sub: user.id, role: user.role, ver: Number(user.tokenVersion || 0) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res, next) {
  try {
    const { name, email, studentId, password, phone } = req.validated;

    const existing = await User.findOne({
      where: { [Op.or]: [{ email }, { studentId: studentId.toUpperCase() }] },
    });
    if (existing) {
      const field = existing.email === email ? 'email' : 'student ID';
      return res.status(409).json({ success: false, message: `An account with that ${field} already exists.` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // The first account created becomes the administrator, which is how a fresh
    // deployment bootstraps without a manual database edit.
    const isFirstUser = (await User.count()) === 0;

    const user = await User.create({
      name,
      email,
      studentId: studentId.toUpperCase(),
      passwordHash,
      phone: phone || '',
      role: isFirstUser ? 'admin' : 'user',
    });

    // The audit helper reads ip and user-agent off the request, so the request
    // must be passed, with the actor attached.
    req.user = user;
    await audit(req, { action: 'user.register', entityType: 'User', entityId: user.id, summary: `Registered ${user.email}` });

    return res.status(201).json({
      success: true,
      message: 'Account created.',
      data: { token: signToken(user), user: serializeUser(user) },
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.validated;
    const user = await User.scope('withPassword').findOne({ where: { email } });

    // One message for both failure modes: no account enumeration.
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'This account has been blocked. Contact the administrator.' });
    }

    req.user = user;
    await audit(req, { action: 'user.login', entityType: 'User', entityId: user.id, summary: `Login ${user.email}` });

    return res.json({
      success: true,
      message: 'Signed in.',
      data: { token: signToken(user), user: serializeUser(user) },
    });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res) {
  return res.json({ success: true, data: { user: serializeUser(req.user) } });
}

async function updateProfile(req, res, next) {
  try {
    const { name, phone } = req.validated;
    if (name !== undefined) req.user.name = name;
    if (phone !== undefined) req.user.phone = phone;
    await req.user.save();
    return res.json({ success: true, message: 'Profile updated.', data: { user: serializeUser(req.user) } });
  } catch (err) {
    return next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.validated;
    const user = await User.scope('withPassword').findByPk(req.user.id);
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await audit(req, { action: 'user.change_password', entityType: 'User', entityId: user.id, summary: 'Password changed' });
    // Every previously issued token is now refused; return a fresh one so the
    // person who just changed their password stays signed in.
    return res.json({
      success: true,
      message: 'Password changed. Other devices have been signed out.',
      data: { token: signToken(user) },
    });
  } catch (err) {
    return next(err);
  }
}

/* --------------------------------------------------------- password reset */

/**
 * POST /api/auth/forgot-password
 *
 * Always answers the same way, whether or not the address is registered, so the
 * endpoint cannot be used to enumerate accounts. Throttling is also invisible
 * for the same reason: a caller who asks too often simply receives no new code.
 */
async function forgotPassword(req, res, next) {
  const generic = {
    success: true,
    message: 'If that address is registered, a six-digit code is on its way. It expires in a few minutes.',
  };

  try {
    const { email } = req.validated;
    const user = await User.findOne({ where: { email } });

    if (!user || user.isBlocked) return res.json(generic);

    const recent = await PasswordReset.findOne({
      where: { userId: user.id },
      order: [['requestedAt', 'DESC']],
    });
    const sinceSeconds = recent ? (Date.now() - new Date(recent.requestedAt).getTime()) / 1000 : Infinity;
    if (sinceSeconds < otp.RESEND_SECONDS()) return res.json(generic);

    // A new code invalidates every earlier one for this account.
    await PasswordReset.destroy({ where: { userId: user.id } });

    const code = otp.generateCode();
    await PasswordReset.create({
      userId: user.id,
      otpHash: otp.hashCode(code),
      expiresAt: otp.expiresAt(),
      requestedAt: new Date(),
    });

    const result = await mailer.sendOtp({ to: user.email, code, minutes: otp.TTL_MINUTES() });
    if (!result.delivered) {
      console.error('[auth] reset code could not be delivered:', result.reason);
    }
    await audit(req, { action: 'user.forgot_password', entityType: 'User', entityId: user.id, summary: 'Reset code requested' });

    return res.json(generic);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/verify-otp
 * Checks the code, burns it, and returns a short-lived token for the password step.
 */
async function verifyOtp(req, res, next) {
  try {
    const { email, code } = req.validated;
    const invalid = { success: false, message: 'That code is not valid or has expired. Request a new one.' };

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(400).json(invalid);

    const record = await PasswordReset.findOne({
      where: { userId: user.id, consumedAt: null },
      order: [['requestedAt', 'DESC']],
    });
    if (!record) return res.status(400).json(invalid);
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'That code has expired. Request a new one.' });
    }
    if (record.attempts >= otp.MAX_ATTEMPTS()) {
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect attempts. Request a new code.',
      });
    }

    if (!otp.codesMatch(code, record.otpHash)) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json(invalid);
    }

    record.consumedAt = new Date();
    await record.save();

    const resetToken = jwt.sign(
      { sub: user.id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    await audit(req, { action: 'user.verify_otp', entityType: 'User', entityId: user.id, summary: 'Reset code verified' });
    return res.json({ success: true, message: 'Code verified. Choose a new password.', data: { resetToken } });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * The reset token proves the code was verified; it is not a session token.
 */
async function resetPassword(req, res, next) {
  try {
    const { resetToken, password } = req.validated;

    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'That reset link has expired. Start again.' });
    }
    if (payload.purpose !== 'password-reset') {
      return res.status(400).json({ success: false, message: 'That reset link is not valid.' });
    }

    const user = await User.findByPk(payload.sub);
    if (!user || user.isBlocked) {
      return res.status(400).json({ success: false, message: 'That account is no longer available.' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await audit(req, { action: 'user.password_reset', entityType: 'User', entityId: user.id, summary: 'Password reset with a one-time code' });
    await mailer.sendResetConfirmation({ to: user.email, name: user.name }).catch(() => {});

    return res.json({ success: true, message: 'Password updated. You can sign in now.' });
  } catch (err) {
    return next(err);
  }
}

/**
 * With stateless JWTs there is nothing to invalidate server side, so logout is a
 * client side token discard. Password changes rotate passwordChangedAt, which
 * invalidates every token issued before the change.
 */
async function logout(req, res) {
  return res.json({ success: true, message: 'Signed out. Discard the token on the client.' });
}

module.exports = {
  register, login, me, updateProfile, changePassword, logout,
  forgotPassword, verifyOtp, resetPassword,
};
