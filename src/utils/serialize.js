const storage = require('./storage');

/**
 * Every response body is built here, so a private column can never leak by
 * accident through a newly added endpoint.
 */

function plain(row) {
  if (!row) return null;
  return row.get ? row.get({ plain: true }) : row;
}

function serializeUser(user) {
  const u = plain(user);
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    studentId: u.studentId || null,
    role: u.role,
    phone: u.phone || '',
    isBlocked: !!u.isBlocked,
    createdAt: u.createdAt,
  };
}

/** What a stranger may know about the person who posted an item. */
function publicUser(user) {
  const u = plain(user);
  if (!u) return null;
  return { id: u.id, name: u.name, studentId: u.studentId };
}

function serializeItem(item, viewer) {
  const i = plain(item);
  if (!i) return null;

  const isOwner = viewer && String(i.reporterId) === String(viewer.id);
  const isAdmin = viewer && viewer.role === 'admin';
  const reporterDoc = i.reporter && i.reporter.id ? i.reporter : null;

  const out = {
    id: i.id,
    type: i.type,
    title: i.title,
    category: i.category,
    description: i.description,
    colour: i.colour,
    brand: i.brand,
    location: { building: i.building, detail: i.locationDetail },
    dateOccurred: i.dateOccurred,
    // Stored as storage keys; rendered as URLs. Legacy "/uploads/..." values
    // pass through untouched so old listings keep working.
    images: (i.images || []).map((k) => storage.publicUrl(k)).filter(Boolean),
    status: i.status,
    viewCount: i.viewCount,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    returnedAt: i.returnedAt,
    reporter: reporterDoc ? publicUser(reporterDoc) : { id: i.reporterId, name: 'Student' },
  };

  if (isOwner || isAdmin) {
    out.privateDetail = i.privateDetail;
    out.adminNote = i.adminNote;
    out.isDeleted = i.isDeleted;
    if (reporterDoc) out.reporter = serializeUser(reporterDoc);
  }
  return out;
}

function serializeClaim(claim, viewer) {
  const c = plain(claim);
  if (!c) return null;

  const isAdmin = viewer && viewer.role === 'admin';
  const claimantDoc = c.claimant && c.claimant.id ? c.claimant : null;
  const itemDoc = c.item && c.item.id ? c.item : null;

  const out = {
    id: c.id,
    itemId: c.itemId,
    claimant: claimantDoc ? publicUser(claimantDoc) : { id: c.claimantId },
    message: c.message,
    status: c.status,
    decisionNote: c.decisionNote,
    decidedAt: c.decidedAt,
    createdAt: c.createdAt,
    collectedAt: c.collectedAt,
  };

  if (isAdmin) {
    out.verificationAnswer = c.verificationAnswer;
    out.proofImage = c.proofImage;
    out.pickupCode = c.pickupCode;
    if (claimantDoc) out.claimant = serializeUser(claimantDoc);
  }
  if (itemDoc) {
    out.item = {
      id: itemDoc.id,
      title: itemDoc.title,
      type: itemDoc.type,
      category: itemDoc.category,
      status: itemDoc.status,
      location: { building: itemDoc.building, detail: itemDoc.locationDetail },
      images: (itemDoc.images || []).map((k) => storage.publicUrl(k)).filter(Boolean),
    };
  }
  return out;
}

module.exports = { serializeUser, publicUser, serializeItem, serializeClaim };
