const { Op } = require('sequelize');
const { Item, Match } = require('../models');
const { ZONE_BY_BUILDING } = require('./constants');

/**
 * Custom feature: duplicate-item alerts driven by a match engine.
 *
 * Every new lost or found report is scored against the active reports of the
 * opposite type. The scoring is deterministic and explainable on purpose: no
 * external service, nothing that can behave differently during a demonstration,
 * and every match carries the reasons it was produced.
 *
 *   score = 0.35 text + 0.25 category + 0.20 location + 0.10 colour + 0.10 date
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'my', 'is',
  'it', 'was', 'i', 'lost', 'found', 'item', 'near', 'from', 'this', 'that', 'has', 'have',
]);

const MATCH_THRESHOLD = 0.55;
const DUPLICATE_THRESHOLD = 0.6;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Jaccard similarity over the two token sets: |A n B| / |A u B|. */
function textSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  setA.forEach((t) => { if (setB.has(t)) intersection += 1; });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const categoryScore = (a, b) => (a.category === b.category ? 1 : 0);

function locationScore(a, b) {
  if (a.building && a.building === b.building) return 1;
  const zoneA = ZONE_BY_BUILDING[a.building];
  const zoneB = ZONE_BY_BUILDING[b.building];
  if (zoneA && zoneA === zoneB) return 0.5;
  return 0;
}

function colourScore(a, b) {
  const colourA = (a.colour || '').trim().toLowerCase();
  const colourB = (b.colour || '').trim().toLowerCase();
  if (!colourA || !colourB) return 0.5; // missing data is neutral, not a penalty
  if (colourA === colourB) return 1;
  if (colourA.includes(colourB) || colourB.includes(colourA)) return 0.7;
  return 0;
}

function dateProximityScore(a, b) {
  const DAY = 24 * 60 * 60 * 1000;
  const diff = Math.abs(new Date(a.dateOccurred) - new Date(b.dateOccurred)) / DAY;
  if (Number.isNaN(diff)) return 0;
  if (diff <= 3) return 1;
  if (diff >= 14) return 0;
  return 1 - (diff - 3) / 11;
}

function scorePair(a, b) {
  const text = textSimilarity(`${a.title} ${a.description}`, `${b.title} ${b.description}`);
  const category = categoryScore(a, b);
  const location = locationScore(a, b);
  const colour = colourScore(a, b);
  const date = dateProximityScore(a, b);

  const score = 0.35 * text + 0.25 * category + 0.2 * location + 0.1 * colour + 0.1 * date;

  const reasons = [];
  if (category === 1) reasons.push(`same category: ${String(a.category).replace(/-/g, ' ')}`);
  if (location === 1) reasons.push(`both reported at ${String(a.building).replace(/-/g, ' ')}`);
  else if (location === 0.5) reasons.push('buildings in the same campus zone');
  if (text >= 0.2) reasons.push(`similar wording in the description (${Math.round(text * 100)}% overlap)`);
  if (colour === 1 && a.colour) reasons.push(`same colour: ${a.colour}`);

  const dayGap = Math.round(Math.abs(new Date(a.dateOccurred) - new Date(b.dateOccurred)) / (24 * 60 * 60 * 1000));
  if (!Number.isNaN(dayGap) && dayGap <= 14) reasons.push(`dates ${dayGap} day(s) apart`);

  return { score: Math.round(score * 1000) / 1000, reasons };
}

/**
 * Score a freshly approved item against every active report of the other type
 * and persist the pairs above the threshold. The unique index on
 * (lost_item_id, found_item_id) turns a repeat run into an update.
 */
async function generateMatchesFor(item) {
  const data = item.get ? item.get({ plain: true }) : item;
  const oppositeType = data.type === 'lost' ? 'found' : 'lost';

  const candidates = await Item.findAll({
    where: {
      type: oppositeType,
      status: 'active',
      isDeleted: false,
      id: { [Op.ne]: data.id },
    },
    limit: 500,
    raw: true,
  });

  const results = [];
  for (const candidate of candidates) {
    const { score, reasons } = scorePair(data, candidate);
    if (score < MATCH_THRESHOLD) continue;

    const lostItemId = data.type === 'lost' ? data.id : candidate.id;
    const foundItemId = data.type === 'lost' ? candidate.id : data.id;

    const existing = await Match.findOne({ where: { lostItemId, foundItemId } });
    if (existing) {
      await existing.update({ score, reasons, status: 'suggested' });
    } else {
      await Match.create({ lostItemId, foundItemId, score, reasons, status: 'suggested' });
    }
    results.push({ score, reasons, matchedItemId: candidate.id, reporterId: candidate.reporterId });
  }

  return results.sort((x, y) => y.score - x.score);
}

/** Matches for one item, populated for display. */
async function matchesForItem(item) {
  const data = item.get ? item.get({ plain: true }) : item;
  const where = data.type === 'lost' ? { lostItemId: data.id } : { foundItemId: data.id };
  return Match.findAll({
    where: { ...where, status: { [Op.ne]: 'dismissed' } },
    order: [['score', 'DESC']],
    include: [
      { model: Item, as: 'lostItem', include: [{ model: require('../models').User, as: 'reporter', attributes: ['id', 'name', 'studentId'] }] },
      { model: Item, as: 'foundItem', include: [{ model: require('../models').User, as: 'reporter', attributes: ['id', 'name', 'studentId'] }] },
    ],
  });
}

/**
 * Same-type reports that look like the same physical item logged twice.
 * Computed live for the admin panel rather than stored, because it is an
 * operational hint, not a record.
 */
async function findDuplicates(limit = 60) {
  const items = await Item.findAll({
    where: { status: { [Op.in]: ['active', 'pending'] }, isDeleted: false },
    order: [['createdAt', 'DESC']],
    limit,
    raw: true,
  });

  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.type !== b.type) continue;
      const { score, reasons } = scorePair(a, b);
      if (score >= DUPLICATE_THRESHOLD) pairs.push({ a, b, score, reasons });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, 20);
}

module.exports = {
  MATCH_THRESHOLD,
  DUPLICATE_THRESHOLD,
  tokenize,
  textSimilarity,
  scorePair,
  generateMatchesFor,
  matchesForItem,
  findDuplicates,
};
