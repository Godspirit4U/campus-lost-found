import { api } from './api.js';
import {
  mountHeader, reference, itemCard, loadingCards, emptyState, $, $$, debounce, ICONS,
} from './ui.js';

const form = $('#filter-form');
const results = $('#results');
const pager = $('#pager');
const countLabel = $('#results-count');
let ref;
let page = 1;

function readFilters() {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach((k) => { if (!data[k]) delete data[k]; });
  return data;
}

function syncChips() {
  const type = form.elements.type.value;
  $$('#quick-chips .chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.quick === type);
  });
}

async function load() {
  const filters = readFilters();
  const params = new URLSearchParams(filters);
  history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
  syncChips();

  results.innerHTML = loadingCards(6);
  pager.innerHTML = '';

  try {
    const { items, pagination } = await api.listItems({ ...filters, page, limit: 12 });

    countLabel.innerHTML = pagination.total
      ? `<b>${pagination.total}</b> item${pagination.total === 1 ? '' : 's'} found`
      : 'No results';

    results.innerHTML = items.length
      ? items.map((item) => itemCard(item, ref)).join('')
      : `<div style="grid-column:1/-1">${emptyState(
        'Nothing matches those filters',
        'Try a wider date range, or clear the keyword and search again.',
        { href: '/browse.html', label: 'Clear filters' },
      )}</div>`;

    if (pagination.pages > 1) {
      pager.innerHTML = `
        <button class="btn btn-sm" id="prev" ${pagination.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${pagination.page} of ${pagination.pages}</span>
        <button class="btn btn-sm" id="next" ${pagination.page >= pagination.pages ? 'disabled' : ''}>Next</button>`;
      $('#prev').onclick = () => { page -= 1; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      $('#next').onclick = () => { page += 1; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    }
  } catch (err) {
    results.innerHTML = `<div style="grid-column:1/-1">${emptyState('Could not load listings', err.message)}</div>`;
  }
}

async function init() {
  ref = await reference();

  $('#f-category').insertAdjacentHTML('beforeend',
    ref.categories.map((c) => `<option value="${c.slug}">${c.name}</option>`).join(''));
  $('#f-building').insertAdjacentHTML('beforeend',
    ref.buildings.map((b) => `<option value="${b.slug}">${b.name}</option>`).join(''));

  $('#f-q').closest('.input-icon').insertAdjacentHTML('afterbegin', ICONS.search);

  new URLSearchParams(window.location.search).forEach((value, key) => {
    const field = form.elements[key];
    if (field) field.value = value;
  });

  $('#more-filters').addEventListener('click', () => {
    const extra = $('#explore-extra');
    extra.classList.toggle('hidden');
    $('#more-filters').textContent = extra.classList.contains('hidden') ? 'More filters' : 'Fewer filters';
  });

  form.addEventListener('submit', (event) => { event.preventDefault(); page = 1; load(); });
  form.addEventListener('reset', () => setTimeout(() => { page = 1; load(); }, 0));
  form.elements.type.addEventListener('change', () => { page = 1; load(); });
  form.elements.sort.addEventListener('change', () => { page = 1; load(); });
  form.elements.category.addEventListener('change', () => { page = 1; load(); });
  form.elements.building.addEventListener('change', () => { page = 1; load(); });
  $('#f-q').addEventListener('input', debounce(() => { page = 1; load(); }, 350));

  $$('#quick-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      form.elements.type.value = chip.dataset.quick;
      page = 1;
      load();
    });
  });

  load();
}

mountHeader('browse').then(init);
