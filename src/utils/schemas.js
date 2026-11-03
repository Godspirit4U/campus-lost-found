const { z } = require('zod');
const { CATEGORY_SLUGS, BUILDING_SLUGS, ITEM_TYPES, ITEM_STATUSES } = require('./constants');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  // PRN: the permanent registration number issued by the university. Numeric,
  // normally seven digits, but the range is left slightly open.
  studentId: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, 'PRN must be 6 to 10 digits, for example 2023001'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  phone: z.string().trim().max(20).optional().default(''),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code'),
});

const resetPasswordSchema = z.object({
  resetToken: z.string().trim().min(10, 'Start the reset again from the beginning'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// multipart/form-data sends everything as strings, so coerce where needed.
const createItemSchema = z.object({
  type: z.enum(ITEM_TYPES, { message: 'Type must be lost or found' }),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  category: z.enum(CATEGORY_SLUGS, { message: 'Choose a valid category' }),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
  privateDetail: z.string().trim().max(500).optional().default(''),
  colour: z.string().trim().max(40).optional().default(''),
  brand: z.string().trim().max(60).optional().default(''),
  building: z.enum(BUILDING_SLUGS, { message: 'Choose a valid campus building' }),
  locationDetail: z.string().trim().max(200).optional().default(''),
  dateOccurred: z.coerce.date({ message: 'Enter a valid date' }),
  privateDetailRequired: z.any().optional(),
});

const updateItemSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  category: z.enum(CATEGORY_SLUGS).optional(),
  description: z.string().trim().min(10).max(2000).optional(),
  privateDetail: z.string().trim().max(500).optional(),
  colour: z.string().trim().max(40).optional(),
  brand: z.string().trim().max(60).optional(),
  building: z.enum(BUILDING_SLUGS).optional(),
  locationDetail: z.string().trim().max(200).optional(),
  dateOccurred: z.coerce.date().optional(),
  images: z.array(z.string()).max(3).optional(),
  // Multipart edit form: JSON array of storage keys the user kept.
  keepImages: z.string().optional(),
});

const itemStatusSchema = z.object({
  status: z.enum(ITEM_STATUSES),
  adminNote: z.string().trim().max(500).optional().default(''),
});

const createClaimSchema = z.object({
  message: z.string().trim().min(10, 'Tell us why this item is yours (at least 10 characters)').max(1000),
  verificationAnswer: z
    .string()
    .trim()
    .min(2, 'Answer the ownership verification question')
    .max(500),
});

const decideClaimSchema = z.object({
  action: z.enum(['approve', 'reject']),
  decisionNote: z.string().trim().max(500).optional().default(''),
});

const collectClaimSchema = z.object({
  pickupCode: z.string().trim().min(4, 'Enter the pickup code').max(12),
});

const updateUserSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  isBlocked: z.boolean().optional(),
});

module.exports = {
  objectId,
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  createItemSchema,
  updateItemSchema,
  itemStatusSchema,
  createClaimSchema,
  decideClaimSchema,
  collectClaimSchema,
  updateUserSchema,
};
