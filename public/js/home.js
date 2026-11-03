import { api } from './api.js';
import {
  mountHeader, reference, itemCard, loadingCards, emptyState, $, ICONS, isAdmin,
} from './ui.js';

const CATEGORY_ICONS = {
  electronics: 'sparkle', 'mobile-phones': 'box', 'laptops-tablets': 'grid',
  'id-cards-documents': 'clipboard', 'wallets-purses': 'inbox', keys: 'shield',
  'bags-backpacks': 'box', 'books-stationery': 'list', clothing: 'tag',
  'jewellery-accessories': 'sparkle', 'water-bottles': 'box',
  'sports-equipment': 'activity', other: 'box',
};

async function loadStats() {
  const host = $('#hero-stats');
  try {
    const [lost, found, listed] = await Promise.all([
      api.listItems({ type: 'lost', limit: 1 }),
      api.listItems({ type: 'found', limit: 1 }),
      api.listItems({ limit: 1 }),
    ]);
    host.innerHTML = `
      <div class="stat"><b>${lost.pagination.total}</b><span>Lost reports</span></div>
      <div class="stat"><b>${found.pagination.total}</b><span>Found reports</span></div>
      <div class="stat"><b>${listed.pagination.total}</b><span>Listed now</span></div>`;
  } catch {
    host.innerHTML = '';
  }
}

async function loadCategories(ref) {
  const host = $('#category-grid');
  host.innerHTML = ref.categories.slice(0, 12).map((c) => `
    <a class="category-card" href="/browse.html?category=${encodeURIComponent(c.slug)}">
      <span class="cc-icon">${ICONS[CATEGORY_ICONS[c.slug] || 'tag']}</span>
      <b>${c.name}</b>
    </a>`).join('');
}

async function loadRecent(ref) {
  const host = $('#recent-items');
  host.innerHTML = loadingCards(6);
  try {
    const { items } = await api.listItems({ limit: 6, sort: 'newest' });
    host.innerHTML = items.length
      ? items.map((item) => itemCard(item, ref)).join('')
      : `<div style="grid-column:1/-1">${emptyState(
        'Nothing listed yet',
        'The catalogue is empty. The first report posted will appear here straight away.',
        { href: '/report.html', label: 'Post the first report' },
      )}</div>`;
  } catch (err) {
    host.innerHTML = `<div style="grid-column:1/-1">${emptyState('Could not load listings', err.message)}</div>`;
  }
}

async function init() {
  $('#hero-search-icon').insertAdjacentHTML('afterbegin', ICONS.search);
  if (isAdmin()) {
    const cta = $('#hero-report');
    if (cta) { cta.href = '/browse.html'; cta.textContent = 'Browse items'; }
  }

  $('#hero-search').addEventListener('submit', (event) => {
    event.preventDefault();
    const q = $('#hero-q').value.trim();
    window.location.href = `/browse.html${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  });

  loadStats();
  try {
    const ref = await reference();
    loadCategories(ref);
    loadRecent(ref);
  } catch {
    $('#recent-items').innerHTML = emptyState('Could not load the catalogue', 'Please refresh the page.');
  }
}

mountHeader('home').then(init);
