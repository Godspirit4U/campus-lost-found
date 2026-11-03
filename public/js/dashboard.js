import { api, getUser } from './api.js';
import {
  mountHeader, reference, requireLogin, statusBadge, typeBadge, escapeHtml,
  formatDate, timeAgo, $, $$, toast, emptyState, confirmDialog, ICONS,
} from './ui.js';

const panel = $('#panel');
let ref;

function setTab(name) {
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  history.replaceState(null, '', `?tab=${name}`);
  render(name);
}

async function render(tab) {
  panel.innerHTML = '<div class="skeleton" style="height:140px"></div>';
  if (tab === 'my-listings') return renderListings();
  if (tab === 'my-claims') return renderClaims();
  if (tab === 'claims-on-my-items') return renderClaimsOnMine();
  return renderNotifications();
}

async function renderListings() {
  const { items } = await api.myItems();
  if (!items.length) {
    panel.innerHTML = emptyState('You have not posted anything',
      'Anything you report will appear here with its status, views and any claims on it.',
      { href: '/report.html', label: 'Post a report' });
    return;
  }

  panel.innerHTML = `
    <div class="table-wrap"><div class="table-scroll">
      <table>
        <thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Claims</th><th>Views</th><th>Posted</th><th></th></tr></thead>
        <tbody>
          ${items.map((i) => {
    const claims = Object.values(i.claims || {}).reduce((a, b) => a + b, 0);
    return `<tr>
              <td>
                <a class="cell-title" href="/item.html?id=${i.id}">${escapeHtml(i.title)}</a>
                <div class="cell-sub">${escapeHtml(ref.categoryName(i.category))}, ${escapeHtml(ref.buildingName(i.location.building))}</div>
              </td>
              <td>${typeBadge(i.type)}</td>
              <td>${statusBadge(i.status)}</td>
              <td>${claims}</td>
              <td>${i.viewCount}</td>
              <td class="muted" style="white-space:nowrap">${formatDate(i.createdAt)}</td>
              <td style="white-space:nowrap">
                <a class="btn btn-sm" href="/report.html?edit=${i.id}">Edit</a>
                <button class="btn btn-sm btn-quiet-danger" data-delete="${i.id}">Remove</button>
              </td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div></div>`;

  $$('[data-delete]').forEach((btn) => {
    btn.onclick = async () => {
      const yes = await confirmDialog({
        title: 'Remove this listing?',
        body: 'It disappears from the catalogue straight away. You can post it again later.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!yes) return;
      try {
        await api.deleteItem(btn.dataset.delete);
        toast('Listing removed.', 'ok');
        renderListings();
        loadSummary();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });
}

async function renderClaims() {
  const { claims } = await api.myClaims();
  if (!claims.length) {
    panel.innerHTML = emptyState('No claims yet',
      'When you claim a found item, it appears here with the desk decision and your pickup code.',
      { href: '/browse.html', label: 'Find your item' });
    return;
  }

  panel.innerHTML = `<div class="stack">${claims.map((c) => `
    <div class="card card--pad">
      <div class="spread">
        <div>
          <a href="/item.html?id=${c.itemId}"><strong>${escapeHtml(c.item ? c.item.title : 'Listing')}</strong></a>
          <div class="cell-sub">Filed ${timeAgo(c.createdAt)}</div>
        </div>
        <div class="row">
          ${statusBadge(c.status)}
          ${c.status === 'pending' ? `<button class="btn btn-sm" data-cancel="${c.id}">Cancel</button>` : ''}
        </div>
      </div>
      <p style="margin:14px 0 0;font-size:.88rem">${escapeHtml(c.message)}</p>
      ${c.status === 'approved' ? `<div class="notice notice-ok" style="margin-top:14px">
        Approved. Collect at the desk and quote this code:
        <span class="mono" style="font-weight:600">${escapeHtml(c.pickupCode || '')}</span></div>` : ''}
      ${c.decisionNote ? `<div class="notice notice-info" style="margin-top:12px">
        Desk note: ${escapeHtml(c.decisionNote)}</div>` : ''}
    </div>`).join('')}</div>`;

  $$('[data-cancel]').forEach((btn) => {
    btn.onclick = async () => {
      const yes = await confirmDialog({
        title: 'Cancel this claim?',
        body: 'The desk will no longer review it. You can submit a new claim later if the item is still available.',
        confirmLabel: 'Cancel claim',
        danger: true,
      });
      if (!yes) return;
      try {
        await api.cancelClaim(btn.dataset.cancel);
        toast('Claim cancelled.', 'ok');
        renderClaims();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });
}

async function renderClaimsOnMine() {
  const { items } = await api.myItems();
  const withClaims = items.filter((i) => Object.values(i.claims || {}).reduce((a, b) => a + b, 0) > 0);

  if (!withClaims.length) {
    panel.innerHTML = emptyState('No claims on your items',
      'When someone claims an item you reported, you will see it here.');
    return;
  }

  const groups = await Promise.all(withClaims.map(async (item) => {
    const { claims } = await api.itemClaims(item.id);
    return { item, claims };
  }));

  panel.innerHTML = `<div class="stack">${groups.map(({ item, claims }) => `
    <div class="card">
      <div class="spread">
        <a href="/item.html?id=${item.id}"><strong>${escapeHtml(item.title)}</strong></a>
        <div class="row">${typeBadge(item.type)} ${statusBadge(item.status)}</div>
      </div>
      <div class="stack" style="margin-top:16px">
        ${claims.map((c) => `
          <div class="notice notice-info">
            <div class="spread">
              <span><strong>${escapeHtml(c.claimant.name)}</strong>, ${timeAgo(c.createdAt)}</span>
              ${statusBadge(c.status)}
            </div>
            <p style="margin:8px 0 0;font-size:.86rem">${escapeHtml(c.message)}</p>
          </div>`).join('')}
      </div>
      <p class="muted" style="font-size:.8rem;margin:14px 0 0">
        The desk makes the decision. You will be notified when it is approved or rejected.
      </p>
    </div>`).join('')}</div>`;
}

async function renderNotifications() {
  const { notifications, unreadCount } = await api.notifications();
  if (!notifications.length) {
    panel.innerHTML = emptyState('No notifications',
      'Status changes, matches and claim decisions will appear here.');
    return;
  }

  panel.innerHTML = `
    <div class="spread" style="margin-bottom:16px">
      <span class="muted" style="font-size:.86rem">${unreadCount} unread</span>
      <button class="btn btn-sm" id="read-all">Mark all read</button>
    </div>
    <div class="stack">
      ${notifications.map((n) => `
        <div class="card card--pad" style="border-left:3px solid ${n.isRead ? 'var(--border)' : 'var(--accent)'}">
          <div class="spread">
            <strong style="font-size:.93rem">${escapeHtml(n.title)}</strong>
            <span class="muted" style="font-size:.78rem">${timeAgo(n.createdAt)}</span>
          </div>
          <p style="margin:8px 0 0;font-size:.86rem">${escapeHtml(n.message)}</p>
          ${n.link ? `<a href="${escapeHtml(n.link)}" style="font-size:.83rem">Open</a>` : ''}
        </div>`).join('')}
    </div>`;

  $('#read-all').onclick = async () => {
    await api.markAllRead();
    toast('All marked as read.', 'ok');
    renderNotifications();
  };
}

async function loadSummary() {
  const user = getUser();
  const { items } = await api.myItems();
  const { claims } = await api.myClaims();
  const returned = items.filter((i) => i.status === 'returned').length;

  $('#welcome').textContent = user.studentId
    ? `Signed in as ${user.name}, PRN ${user.studentId}`
    : `Signed in as ${user.name}`;
  $('#summary').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">${ICONS.list}</div>
      <div class="label">My listings</div>
      <div class="value">${items.length}</div>
      <div class="sub">${items.filter((i) => i.status === 'active').length} live now</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${ICONS.inbox}</div>
      <div class="label">Claims filed</div>
      <div class="value">${claims.length}</div>
      <div class="sub">${claims.filter((c) => c.status === 'pending').length} awaiting a decision</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${ICONS.check}</div>
      <div class="label">Items recovered</div>
      <div class="value">${returned}</div>
      <div class="sub">returned to their owner</div>
    </div>`;
}

async function init() {
  if (!requireLogin()) return;
  ref = await reference();
  await loadSummary();

  $$('.tabs button').forEach((btn) => { btn.onclick = () => setTab(btn.dataset.tab); });
  setTab(new URLSearchParams(window.location.search).get('tab') || 'my-listings');
}

mountHeader('dashboard').then(init);
