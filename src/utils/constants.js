/**
 * Reference data for categories and campus locations.
 *
 * This file is the single place to change either list: the API serves it from
 * here and the frontend builds every dropdown from that response, so nothing
 * else needs editing.
 *
 * LOCATIONS_VERIFIED is false because the building names below are placeholders
 * written during development. Replace BUILDINGS with the official campus list
 * and flip the flag once the university confirms them. Until then the report
 * form shows a note that the list is provisional.
 */

const LOCATIONS_VERIFIED = false;

// Category slugs are stored on existing items, so slugs are treated as stable
// identifiers. Names and order can change freely; adding a slug is safe.
const CATEGORIES = [
  { slug: 'mobile-phones', name: 'Mobile Phones', icon: 'phone' },
  { slug: 'laptops-tablets', name: 'Laptops and Tablets', icon: 'laptop' },
  { slug: 'electronics', name: 'Chargers, Cables and Audio', icon: 'plug' },
  { slug: 'id-cards-documents', name: 'ID Cards and Documents', icon: 'id' },
  { slug: 'wallets-purses', name: 'Wallets and Purses', icon: 'wallet' },
  { slug: 'keys', name: 'Keys', icon: 'key' },
  { slug: 'bags-backpacks', name: 'Bags and Backpacks', icon: 'bag' },
  { slug: 'books-stationery', name: 'Books and Stationery', icon: 'book' },
  { slug: 'clothing', name: 'Clothing', icon: 'shirt' },
  { slug: 'jewellery-accessories', name: 'Jewellery and Accessories', icon: 'gem' },
  { slug: 'water-bottles', name: 'Water Bottles', icon: 'bottle' },
  { slug: 'sports-equipment', name: 'Sports Equipment', icon: 'ball' },
  { slug: 'other', name: 'Other', icon: 'box' },
];

// PROVISIONAL. These are development placeholders, not official Sai University
// buildings. Replace this array with the verified list.
const BUILDINGS = [
  { slug: 'central-library', name: 'Central Library', zone: 'academic', verified: LOCATIONS_VERIFIED },
  { slug: 'main-auditorium', name: 'Main Auditorium', zone: 'academic', verified: LOCATIONS_VERIFIED },
  { slug: 'academic-block-a', name: 'Academic Block A', zone: 'academic', verified: LOCATIONS_VERIFIED },
  { slug: 'academic-block-b', name: 'Academic Block B', zone: 'academic', verified: LOCATIONS_VERIFIED },
  { slug: 'computing-lab', name: 'Computing Lab', zone: 'academic', verified: LOCATIONS_VERIFIED },
  { slug: 'cafeteria', name: 'Cafeteria', zone: 'social', verified: LOCATIONS_VERIFIED },
  { slug: 'student-centre', name: 'Student Centre', zone: 'social', verified: LOCATIONS_VERIFIED },
  { slug: 'sports-complex', name: 'Sports Complex', zone: 'sports', verified: LOCATIONS_VERIFIED },
  { slug: 'boys-hostel', name: 'Boys Hostel', zone: 'residential', verified: LOCATIONS_VERIFIED },
  { slug: 'girls-hostel', name: 'Girls Hostel', zone: 'residential', verified: LOCATIONS_VERIFIED },
  { slug: 'parking-area', name: 'Parking Area', zone: 'outdoor', verified: LOCATIONS_VERIFIED },
  { slug: 'bus-bay', name: 'Bus Bay', zone: 'outdoor', verified: LOCATIONS_VERIFIED },
  { slug: 'admin-block', name: 'Administration Block', zone: 'academic', verified: LOCATIONS_VERIFIED },
];

const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
const BUILDING_SLUGS = BUILDINGS.map((b) => b.slug);
const ZONE_BY_BUILDING = BUILDINGS.reduce((acc, b) => {
  acc[b.slug] = b.zone;
  return acc;
}, {});

const ITEM_STATUSES = ['pending', 'active', 'claimed', 'returned', 'rejected', 'archived'];
const CLAIM_STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'collected'];
const ITEM_TYPES = ['lost', 'found'];

module.exports = {
  LOCATIONS_VERIFIED,
  CATEGORIES,
  BUILDINGS,
  CATEGORY_SLUGS,
  BUILDING_SLUGS,
  ZONE_BY_BUILDING,
  ITEM_STATUSES,
  CLAIM_STATUSES,
  ITEM_TYPES,
};
