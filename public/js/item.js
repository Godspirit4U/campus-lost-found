import { api, getUser, getToken, ApiError } from './api.js';
import {
  mountHeader, reference, statusBadge, typeBadge, escapeHtml, formatDate,
  $, toast, emptyState, ICONS, confirmDialog,
} from './ui.js';

const root = $('#detail-root');
const id = new URLSearchParams(window.location.search).get('id');
let ref;
let item;

function claimForm() {
  return `
    <form class="card" id="claim-form" style="margin-top:18px">
      <h3>Claim this item</h3>
      <p class="muted" style="font-size:.87rem">
        The desk compares your answer with the detail the finder recorded. Only the desk sees it.
      </p>
      <div class="field">
        <label for="claim-message">Why is this yours? <span class="req">*</span></label>
        <textarea id="claim-message" name="message" required minlength="10"
          placeholder="Where and when you lost it, and what ties it to you."></textarea>
      </div>
      <div class="field">
        <label for="claim-answer">Identifying detail <span class="req">*</span></label>
        <input id="claim-answer" name="verificationAnswer" type="text" required
          placeholder="A scratch, an engraving, what is inside the pocket">
        <div class="hint">This is compared with what the finder recorded.</div>
      </div>
      <div class="field">
        <label for="claim-proof">Proof photo</label>
        <input id="claim-proof" name="proofImage" type="file" accept="image/jpeg,image/png,image/webp">
      </div>
      <button class="btn btn-primary btn-block" type="submit">Submit claim</button>
    </form>`;
}

function render() {
  const user = getUser();
  const isOwner = user && item.reporter && item.reporter.id === user.id;
  const canClaim = user && !isOwner && item.status === 'active';

  const gallery = item.images && item.images.length
    ? `<div class="gallery">${item.images.map((src, i) =>
      `<img src="${escapeHtml(src)}" alt="Photo ${i + 1} of ${escapeHtml(item.title)}">`).join('')}</div>`
    : `<div class="detail-image" style="flex-direction:column;gap:10px">
         ${ICONS.image}
         <span style="font-size:.82rem">${escapeHtml(ref.categoryName(item.category))}</span>
       </div>`;

  let claimBlock = '';
  if (!getToken()) {
    claimBlock = item.status === 'active'
      ? `<div class="notice notice-info" style="margin-top:18px">
           <a href="/login.html?next=${encodeURIComponent(`/item.html?id=${item.id}`)}">Sign in</a> to claim this item.
         </div>`
      : '';
  } else if (isOwner) {
    claimBlock = `<div class="notice notice-info" style="margin-top:18px">
      This is your own report, so you cannot claim it.</div>`;
  } else if (canClaim) {
    claimBlock = claimForm();
  } else {
    claimBlock = `<div class="notice notice-warn" style="margin-top:18px">
      This item is ${escapeHtml(item.status)} and is not open to claims.</div>`;
  }

  root.innerHTML = `
    <div class="detail">
      <div class="detail-media">
        ${gallery}
        <div class="card" style="margin-top:18px">
          <h3 style="font-size:1rem">Description</h3>
          <p style="white-space:pre-line">${escapeHtml(item.description)}</p>
          ${item.privateDetail ? `<div class="notice notice-info" style="margin-top:14px">
            <strong>Your private detail.</strong> Only you and the desk see this:
            ${escapeHtml(item.privateDetail)}</div>` : ''}
        </div>
      </div>

      <div>
        <div class="row" style="gap:8px;margin-bottom:14px">
          ${typeBadge(item.type)} ${statusBadge(item.status)}
        </div>
        <h1 class="detail-title">${escapeHtml(item.title)}</h1>
        <div class="meta" style="margin-bottom:22px">
          <span>${ICONS.users}${escapeHtml(item.reporter.name)}</span>
          <span>${ICONS.calendar}${formatDate(item.createdAt)}</span>
          <span>${ICONS.eye}${item.viewCount} views</span>
        </div>

        <div class="card card--pad">
          <dl class="spec-list">
            <dt>Category</dt><dd>${escapeHtml(ref.categoryName(item.category))}</dd>
            <dt>Building</dt><dd>${escapeHtml(ref.buildingName(item.location.building))}</dd>
            <dt>Specific spot</dt><dd>${escapeHtml(item.location.detail || 'Not given')}</dd>
            <dt>Date ${item.type === 'lost' ? 'lost' : 'found'}</dt><dd>${formatDate(item.dateOccurred)}</dd>
            <dt>Colour</dt><dd>${escapeHtml(item.colour || 'Not given')}</dd>
            <dt>Brand</dt><dd>${escapeHtml(item.brand || 'Not given')}</dd>
          </dl>
        </div>

        ${isOwner ? `<div class="card card--pad" style="margin-top:18px">
          <h3 style="font-size:1rem">Manage this listing</h3>
          <p class="muted" style="font-size:.85rem">You can edit the details or take the listing down.</p>
          <div class="row">
            <a class="btn btn-sm" href="/report.html?edit=${item.id}">Edit listing</a>
            <button class="btn btn-sm btn-quiet-danger" id="owner-delete">Remove listing</button>
          </div>
        </div>` : ''}
        <div id="matches-panel"></div>
        ${claimBlock}
      </div>
    </div>`;

  const deleteBtn = $('#owner-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Remove this listing?',
        body: 'It disappears from the catalogue immediately and its photos are deleted. This cannot be undone.',
        confirmLabel: 'Remove listing',
        danger: true,
      });
      if (!yes) return;
      try {
        await api.deleteItem(item.id);
        toast('Listing removed.', 'ok');
        window.location.href = '/dashboard.html';
      } catch (err) { toast(err.message, 'bad'); }
    });
  }

  const form = $('#claim-form');
  if (form) form.addEventListener('submit', submitClaim);
}

async function submitClaim(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Submitting';

  const data = new FormData();
  data.append('message', form.message.value);
  data.append('verificationAnswer', form.verificationAnswer.value);
  const proof = form.proofImage.files[0];
  if (proof) data.append('proofImage', proof);

  try {
    await api.createClaim(item.id, data);
    toast('Claim submitted. The desk will review it.', 'ok');
    form.outerHTML = `<div class="notice notice-ok" style="margin-top:18px">
      Your claim is with the desk. Track it on your dashboard.</div>`;
  } catch (err) {
    const detail = err instanceof ApiError && err.errors.length ? ` ${err.errors[0].message}` : '';
    toast(`${err.message}${detail}`, 'bad');
    button.disabled = false;
    button.textContent = 'Submit claim';
  }
}

async function loadMatches() {
  const user = getUser();
  const isOwner = user && item.reporter && item.reporter.id === user.id;
  if (!user || (!isOwner && user.role !== 'admin')) return;

  try {
    const { matches } = await api.itemMatches(item.id);
    if (!matches.length) return;
    $('#matches-panel').innerHTML = `
      <div class="card" style="margin-top:18px">
        <h3 style="font-size:1rem">Possible matches</h3>
        <p class="muted" style="font-size:.83rem">Scored against the other active reports.</p>
        <div class="stack">
          ${matches.map((m) => {
    const other = item.type === 'lost' ? m.foundItem : m.lostItem;
    return `
              <div class="match-card">
                <div class="spread">
                  <a href="/item.html?id=${encodeURIComponent(other.id)}"><strong>${escapeHtml(other.title)}</strong></a>
                  <span class="match-score">${Math.round(m.score * 100)}%</span>
                </div>
                <div class="muted" style="font-size:.8rem">
                  ${escapeHtml(ref.buildingName(other.location.building))}, ${formatDate(other.dateOccurred)}
                </div>
                <ul class="match-reasons">${m.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
              </div>`;
  }).join('')}
        </div>
      </div>`;
  } catch { /* enhancement only */ }
}

async function init() {
  ref = await reference();

  if (!id) {
    root.innerHTML = emptyState('No listing selected', 'Pick an item from the catalogue to see its details.',
      { href: '/browse.html', label: 'Browse items' });
    return;
  }

  try {
    const data = await api.getItem(id);
    item = data.item;
    document.title = `${item.title} | Campus Lost and Found`;
    render();
    loadMatches();
  } catch (err) {
    root.innerHTML = emptyState('Listing not available', err.message, { href: '/browse.html', label: 'Browse items' });
  }
}

mountHeader('item').then(init);
