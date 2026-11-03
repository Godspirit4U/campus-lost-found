import { api, ApiError } from './api.js';
import { mountHeader, reference, requireLogin, $, toast, ICONS, escapeHtml } from './ui.js';

const form = $('#report-form');
const params = new URLSearchParams(window.location.search);
const editId = params.get('edit');
let ref;
let existingImages = [];
let keptImages = [];
let previewUrls = [];

function isEdit() { return Boolean(editId); }

function syncType() {
  const type = new FormData(form).get('type');
  $('#card-lost').classList.toggle('selected', type === 'lost');
  $('#card-found').classList.toggle('selected', type === 'found');
  $('#date-label').innerHTML = `${type === 'lost' ? 'Date lost' : 'Date found'} <span class="req">*</span>`;

  const detail = $('#privateDetail');
  detail.required = type === 'found';
  $('#private-req').textContent = type === 'found' ? '*' : '';
  $('#private-hint').textContent = type === 'found'
    ? 'Required for found items. This is what a claimant must describe to prove the item is theirs. Only you and the desk see it.'
    : 'Only you and the desk see this. It helps verify a claim if someone makes one.';
}

function renderExisting() {
  const host = $('#existing-images');
  const thumbs = $('#existing-thumbs');
  if (!existingImages.length) {
    host.classList.add('hidden');
    thumbs.innerHTML = '';
    return;
  }
  host.classList.remove('hidden');
  thumbs.innerHTML = existingImages.map((url, i) => `
    <label class="thumb" style="cursor:pointer">
      <img src="${escapeHtml(url)}" alt="">
      <input type="checkbox" data-keep="${i}" checked
        style="position:absolute;top:6px;right:6px;width:18px;height:18px;accent-color:var(--accent)">
    </label>`).join('');

  keptImages = [...existingImages];
  thumbs.querySelectorAll('[data-keep]').forEach((box) => {
    box.addEventListener('change', () => {
      const url = existingImages[Number(box.dataset.keep)];
      keptImages = box.checked
        ? [...new Set([...keptImages, url])]
        : keptImages.filter((u) => u !== url);
    });
  });
}

function renderThumbs() {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
  const host = $('#new-thumbs');
  host.innerHTML = '';
  Array.from($('#images').files).slice(0, 3).forEach((file) => {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    const el = document.createElement('div');
    el.className = 'thumb';
    el.innerHTML = `<img src="${url}" alt="">`;
    host.appendChild(el);
  });
}

function showErrors(errors) {
  const host = $('#form-errors');
  if (!errors.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="notice notice-bad" style="margin-bottom:16px">
      <strong>Check these fields</strong>
      <ul style="margin:8px 0 0 18px">${errors.map((e) => `<li>${escapeHtml(e.field)}: ${escapeHtml(e.message)}</li>`).join('')}</ul>
    </div>`;
  host.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function toStorageKeys(urls) {
  // Existing images come back as renderable URLs; the API stores object keys.
  // Strip the known prefixes so a kept image round-trips unchanged.
  const base = window.location.origin;
  return urls.map((u) => u
    .replace(`${base}/uploads/`, '')
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/[^/]+\//, '')
    .replace(/^\/uploads\//, ''));
}

async function submit(event) {
  event.preventDefault();
  const button = $('#submit-btn');
  showErrors([]);

  const data = new FormData(form);
  const files = $('#images').files;
  data.delete('images');
  Array.from(files).slice(0, 3).forEach((file) => data.append('images', file));
  if (isEdit()) data.append('keepImages', JSON.stringify(toStorageKeys(keptImages)));

  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> ${isEdit() ? 'Saving' : 'Publishing'}`;

  try {
    if (isEdit()) {
      await api.updateItemForm(editId, data);
      toast('Listing updated.', 'ok');
      window.location.href = `/item.html?id=${editId}`;
    } else {
      const { item } = await api.createItem(data);
      toast('Published. It is live now.', 'ok');
      window.location.href = `/item.html?id=${item.id}`;
    }
  } catch (err) {
    const errors = err instanceof ApiError ? err.errors : [];
    showErrors(errors.length ? errors : [{ field: 'form', message: err.message }]);
    toast(err.message, 'bad');
    button.disabled = false;
    button.textContent = isEdit() ? 'Save changes' : 'Publish report';
  }
}

async function prefill() {
  const { item } = await api.getItem(editId);

  $('#page-title').textContent = 'Edit listing';
  $('#page-subtitle').textContent = 'Changes go live as soon as you save.';
  $('#submit-btn').textContent = 'Save changes';
  $('#cancel-link').href = `/item.html?id=${editId}`;
  document.title = `Edit ${item.title} | Campus Lost and Found`;

  const radio = form.querySelector(`input[name="type"][value="${item.type}"]`);
  if (radio) radio.checked = true;
  radio?.setAttribute('disabled', 'disabled');   // the type of a listing is fixed
  form.querySelectorAll('input[name="type"]').forEach((r) => { r.disabled = true; });
  $('#card-lost').insertAdjacentHTML('afterend',
    '<div class="hint" style="flex-basis:100%;margin-top:8px">The type of a listing cannot be changed after it is posted. If it was reported wrongly, remove it and post again.</div>');

  $('#title').value = item.title;
  $('#category').value = item.category;
  $('#building').value = item.location.building;
  $('#locationDetail').value = item.location.detail || '';
  $('#dateOccurred').value = String(item.dateOccurred).slice(0, 10);
  $('#description').value = item.description;
  $('#colour').value = item.colour || '';
  $('#brand').value = item.brand || '';
  $('#privateDetail').value = item.privateDetail || '';

  existingImages = item.images || [];
  renderExisting();
}

async function init() {
  if (!requireLogin()) return;
  ref = await reference();

  $('#upload-icon').innerHTML = ICONS.upload;
  $('#category').innerHTML = `<option value="">Choose a category</option>${
    ref.categories.map((c) => `<option value="${c.slug}">${c.name}</option>`).join('')}`;
  $('#building').innerHTML = `<option value="">Choose a building</option>${
    ref.buildings.map((b) => `<option value="${b.slug}">${b.name}</option>`).join('')}`;

  const today = new Date().toISOString().slice(0, 10);
  $('#dateOccurred').max = today;
  if (!isEdit()) $('#dateOccurred').value = today;

  // The building list is provisional until the university confirms it.
  try {
    const { verified } = await api.buildings();
    if (!verified) {
      $('#building').insertAdjacentHTML('afterend',
        '<div class="hint" style="margin-top:6px">This building list is provisional while campus locations are being confirmed.</div>');
    }
  } catch { /* cosmetic */ }

  form.addEventListener('change', syncType);
  $('#images').addEventListener('change', renderThumbs);

  // Drag and drop onto the zone, which then feeds the same file input.
  const zone = $('#upload-zone');
  ['dragenter', 'dragover'].forEach((evt) => zone.addEventListener(evt, (event) => {
    event.preventDefault();
    zone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((evt) => zone.addEventListener(evt, (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragging');
  }));
  zone.addEventListener('drop', (event) => {
    const dropped = Array.from(event.dataTransfer.files || []);
    if (!dropped.length) return;
    const transfer = new DataTransfer();
    dropped.slice(0, 3).forEach((file) => transfer.items.add(file));
    $('#images').files = transfer.files;
    renderThumbs();
  });
  form.addEventListener('submit', submit);

  if (isEdit()) {
    try {
      await prefill();
    } catch (err) {
      toast(err.message, 'bad');
      window.location.href = '/dashboard.html';
      return;
    }
  } else {
    const preset = params.get('type');
    if (preset === 'found' || preset === 'lost') {
      form.querySelector(`input[value="${preset}"]`).checked = true;
    }
  }

  syncType();
}

mountHeader('report').then(init);
