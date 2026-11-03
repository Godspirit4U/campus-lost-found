const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/db');

const sequelize = getSequelize();

/* ------------------------------------------------------------------ users */
const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true, validate: { isEmail: true } },
    // The PRN belongs to a student. Desk accounts are staff and do not have one,
    // so the column is nullable; uniqueness still applies when it is present.
    studentId: { type: DataTypes.STRING(30), allowNull: true, unique: true },
    // Excluded from every query unless the 'withPassword' scope is used.
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'user' },
    phone: { type: DataTypes.STRING(20), defaultValue: '' },
    isBlocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Every token carries this number. Changing a password increments it, which
    // invalidates every token issued before the change. A counter is used rather
    // than a timestamp because two events in the same second would otherwise be
    // indistinguishable.
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'users',
    underscored: true,
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
    indexes: [{ fields: ['role'] }],
  }
);

/* ------------------------------------------------------------------ items */
const Item = sequelize.define(
  'Item',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reporterId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(6), allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    category: { type: DataTypes.STRING(40), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    // Never returned by a public endpoint. See utils/serialize.js.
    privateDetail: { type: DataTypes.TEXT, defaultValue: '' },
    colour: { type: DataTypes.STRING(40), defaultValue: '' },
    brand: { type: DataTypes.STRING(60), defaultValue: '' },
    building: { type: DataTypes.STRING(40), allowNull: false },
    locationDetail: { type: DataTypes.STRING(200), defaultValue: '' },
    dateOccurred: { type: DataTypes.DATEONLY, allowNull: false },
    images: { type: DataTypes.JSON, defaultValue: [] },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' },
    viewCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    adminNote: { type: DataTypes.STRING(500), defaultValue: '' },
    returnedAt: { type: DataTypes.DATE, allowNull: true },
    archivedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'items',
    underscored: true,
    indexes: [
      { fields: ['status', 'type', 'category', 'building'] },
      { fields: ['created_at'] },
      { fields: ['title'] },
    ],
  }
);

/* ----------------------------------------------------------------- claims */
const Claim = sequelize.define(
  'Claim',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    itemId: { type: DataTypes.UUID, allowNull: false },
    claimantId: { type: DataTypes.UUID, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    verificationAnswer: { type: DataTypes.TEXT, allowNull: false },
    proofImage: { type: DataTypes.STRING(255), defaultValue: '' },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' },
    decisionNote: { type: DataTypes.STRING(500), defaultValue: '' },
    decidedBy: { type: DataTypes.UUID, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    pickupCode: { type: DataTypes.STRING(12), defaultValue: '' },
    collectedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'claims',
    underscored: true,
    indexes: [{ fields: ['item_id', 'claimant_id', 'status'] }, { fields: ['status'] }],
  }
);

/* ---------------------------------------------------------------- matches */
const Match = sequelize.define(
  'Match',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    lostItemId: { type: DataTypes.UUID, allowNull: false },
    foundItemId: { type: DataTypes.UUID, allowNull: false },
    score: { type: DataTypes.FLOAT, allowNull: false },
    reasons: { type: DataTypes.JSON, defaultValue: [] },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'suggested' },
  },
  {
    tableName: 'matches',
    underscored: true,
    indexes: [{ unique: true, fields: ['lost_item_id', 'found_item_id'] }],
  }
);

/* ---------------------------------------------------------- notifications */
const Notification = sequelize.define(
  'Notification',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(40), allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    message: { type: DataTypes.TEXT, defaultValue: '' },
    link: { type: DataTypes.STRING(255), defaultValue: '' },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: 'notifications',
    underscored: true,
    indexes: [{ fields: ['user_id', 'is_read'] }],
  }
);

/* --------------------------------------------------------- password resets */
const PasswordReset = sequelize.define(
  'PasswordReset',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    otpHash: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    consumedAt: { type: DataTypes.DATE, allowNull: true },
    requestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'password_resets',
    underscored: true,
    indexes: [{ fields: ['user_id', 'consumed_at'] }],
  }
);

/* -------------------------------------------------------------- audit log */
const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actorId: { type: DataTypes.UUID, allowNull: true },
    actorRole: { type: DataTypes.STRING(12), defaultValue: '' },
    action: { type: DataTypes.STRING(60), allowNull: false },
    entityType: { type: DataTypes.STRING(30), defaultValue: '' },
    entityId: { type: DataTypes.STRING(40), defaultValue: '' },
    summary: { type: DataTypes.STRING(500), defaultValue: '' },
    ip: { type: DataTypes.STRING(60), defaultValue: '' },
    userAgent: { type: DataTypes.STRING(300), defaultValue: '' },
  },
  {
    tableName: 'audit_logs',
    underscored: true,
    updatedAt: false,
    indexes: [{ fields: ['created_at'] }],
  }
);

/* ------------------------------------------------------------ associations */
Item.belongsTo(User, { as: 'reporter', foreignKey: 'reporterId', onDelete: 'CASCADE' });
User.hasMany(Item, { as: 'items', foreignKey: 'reporterId' });

Claim.belongsTo(Item, { as: 'item', foreignKey: 'itemId', onDelete: 'CASCADE' });
Item.hasMany(Claim, { as: 'claims', foreignKey: 'itemId' });
Claim.belongsTo(User, { as: 'claimant', foreignKey: 'claimantId', onDelete: 'CASCADE' });
Claim.belongsTo(User, { as: 'decider', foreignKey: 'decidedBy', onDelete: 'SET NULL' });

Match.belongsTo(Item, { as: 'lostItem', foreignKey: 'lostItemId', onDelete: 'CASCADE' });
Match.belongsTo(Item, { as: 'foundItem', foreignKey: 'foundItemId', onDelete: 'CASCADE' });

Notification.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });

PasswordReset.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(PasswordReset, { as: 'passwordResets', foreignKey: 'userId' });
AuditLog.belongsTo(User, { as: 'actor', foreignKey: 'actorId', onDelete: 'SET NULL' });

module.exports = { sequelize, User, Item, Claim, Match, Notification, AuditLog, PasswordReset };
