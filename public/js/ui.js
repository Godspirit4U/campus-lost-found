/**
 * Shared front-end furniture.
 *
 * Public pages get a top navigation bar; the student and admin dashboards get a
 * sidebar shell. Both are built here so every page shares one implementation.
 * API calls, session handling and validation all live in api.js and are
 * unchanged by this file.
 */
import { getUser, getToken, clearSession, isAdmin, api } from './api.js';

// Re-exported so page modules have a single import for shell helpers.
export { isAdmin };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------------------------------------------ icons */
const icon = (paths, size = 18) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  home: icon('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  grid: icon('<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>'),
  inbox: icon('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z"/>'),
  bell: icon('<path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 7h18s-3-1-3-7"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>'),
  chart: icon('<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>'),
  clipboard: icon('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9.5 11h5M9.5 15h3"/>'),
  list: icon('<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  users: icon('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.4a3.4 3.4 0 0 1 0 6.2M18 20a6.6 6.6 0 0 0-2-4.7"/>'),
  activity: icon('<path d="M3 12h3.5l2.5-7 4 14 2.5-7H21"/>'),
  menu: icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
  image: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.8" cy="9.8" r="1.6"/><path d="m4 17.5 4.8-4.6 3.6 3.4 3-2.8 4.6 4"/>'),
  box: icon('<path d="m3 8 9-5 9 5v8l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  check: icon('<path d="m4.5 12.5 5 5L20 7"/>'),
  arrowRight: icon('<path d="M4 12h15M13 6l6 6-6 6"/>'),
  mapPin: icon('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.8"/>'),
  calendar: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
  tag: icon('<path d="M20.5 13.5 12 22l-9-9 8.5-8.5H20a1 1 0 0 1 1 1v7.5a1 1 0 0 1-.5.5z"/><circle cx="16.5" cy="7.5" r="1.2"/>'),
  sun: icon('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'),
  moon: icon('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>'),
  eye: icon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: icon('<path d="M3 3l18 18"/><path d="M10.6 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1"/><path d="M6.4 6.5A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  upload: icon('<path d="M21 15v3.5A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5V15"/><path d="M7.5 8.5 12 4l4.5 4.5M12 4v12"/>'),
  alert: icon('<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17.5h.01"/>'),
  logout: icon('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>'),
  filter: icon('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
  chevronRight: icon('<path d="m9 5 7 7-7 7"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
  shield: icon('<path d="M12 3l7.5 3v6c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  sparkle: icon('<path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9z"/>'),
};

/* ------------------------------------------------------------------ helpers */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

export function timeAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(value);
}

export function debounce(fn, ms = 320) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

/* ------------------------------------------------------------------- theme */
const THEME_KEY = 'clf.theme';

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
  $$('.theme-toggle').forEach((btn) => {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

function themeButton() {
  return `<button class="theme-toggle" type="button" data-theme-toggle
    aria-label="Switch theme" title="Switch theme">
    <span class="icon-moon">${ICONS.moon}</span><span class="icon-sun">${ICONS.sun}</span>
  </button>`;
}

function wireTheme() {
  $$('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', (event) => { event.preventDefault(); toggleTheme(); });
  });
  setTheme(currentTheme());
}

/* ------------------------------------------------------------ reference data */
let refCache = null;

export async function reference() {
  if (refCache) return refCache;
  const [cats, locs] = await Promise.all([api.categories(), api.buildings()]);
  refCache = {
    categories: cats.categories,
    buildings: locs.buildings,
    categoryName: (slug) => (cats.categories.find((c) => c.slug === slug) || {}).name || slug,
    buildingName: (slug) => (locs.buildings.find((b) => b.slug === slug) || {}).name || slug,
  };
  return refCache;
}

/* ------------------------------------------------------------------ badges */
const STATUS_TEXT = {
  pending: 'Hidden', active: 'Listed', claimed: 'Reserved', returned: 'Returned',
  rejected: 'Rejected', archived: 'Archived', approved: 'Approved',
  cancelled: 'Cancelled', collected: 'Collected', suggested: 'Suggested',
  dismissed: 'Dismissed', confirmed: 'Confirmed',
};
const STATUS_CLASS = {
  pending: 'badge-pending', active: 'badge-info', claimed: 'badge-info',
  returned: 'badge-ok', rejected: 'badge-bad', archived: 'badge-neutral',
  approved: 'badge-ok', cancelled: 'badge-neutral', collected: 'badge-ok',
};

export function statusBadge(status) {
  return `<span class="badge ${STATUS_CLASS[status] || 'badge-neutral'}">${escapeHtml(STATUS_TEXT[status] || status)}</span>`;
}

export function typeBadge(type) {
  return `<span class="badge ${type === 'lost' ? 'badge-lost' : 'badge-found'}">${type === 'lost' ? 'Lost' : 'Found'}</span>`;
}

/* --------------------------------------------------------------- feedback */
export function toast(message, kind = '') {
  let host = $('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${kind === 'bad' ? ICONS.alert : ICONS.check}<span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

function openModal(inner) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
  document.body.appendChild(backdrop);

  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  return { backdrop, close };
}

/** In-app replacement for window.confirm. Resolves true when confirmed. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const { close } = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
      <div class="modal-actions">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
      </div>`);
    $('[data-cancel]').addEventListener('click', () => { close(); resolve(false); });
    $('[data-confirm]').addEventListener('click', () => { close(); resolve(true); });
  });
}

/** In-app replacement for window.prompt. Resolves the string, or null. */
export function promptDialog({ title, body = '', label = 'Note', value = '', confirmLabel = 'Save', required = false }) {
  return new Promise((resolve) => {
    const { close } = openModal(`
      <h3>${escapeHtml(title)}</h3>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
      <div class="field" style="margin:16px 0 0">
        <label for="modal-input">${escapeHtml(label)}</label>
        <input id="modal-input" type="text" value="${escapeHtml(value)}">
      </div>
      <div class="modal-actions">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-confirm>${escapeHtml(confirmLabel)}</button>
      </div>`);
    const input = $('#modal-input');
    input.focus();
    input.select();
    const done = () => {
      const text = input.value.trim();
      if (required && !text) { input.focus(); return; }
      close();
      resolve(text);
    };
    $('[data-cancel]').addEventListener('click', () => { close(); resolve(null); });
    $('[data-confirm]').addEventListener('click', done);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
  });
}

/* --------------------------------------------------------------- app shell */
/**
 * Two chrome patterns:
 *   visitor  - top navigation bar on every public page
 *   member   - sidebar, used for every signed-in page except the landing page
 * The sidebar is not tied to one page, so it stays put as a student moves
 * between Home, Explore, Report and Account settings.
 */
const PAGE_META = {
  home: ['Home'],
  browse: ['Explore'],
  item: ['Explore', 'Listing'],
  report: ['Report an item'],
  dashboard: ['Home'],
  account: ['Account settings'],
  admin: ['Desk'],
};

function navLink({ href, label, icon, active, count }) {
  const current = active === href ? 'aria-current="page"' : '';
  return `<a class="nav-link" href="${href}" ${current}>
      ${ICONS[icon] || ''}<span>${escapeHtml(label)}</span>
      ${count ? `<span class="nav-count">${count}</span>` : ''}
    </a>`;
}

function sidebarGroups(active) {
  const admin = isAdmin();
  const explore = navLink({ href: '/browse.html', label: 'Explore', icon: 'search', active });

  if (admin) {
    return `
      <div class="nav-group">
        <span class="nav-label">Desk</span>
        ${navLink({ href: '/admin.html', label: 'Overview', icon: 'chart', active })}
        ${navLink({ href: '/admin.html?tab=claims', label: 'Claims queue', icon: 'clipboard', active })}
        ${navLink({ href: '/admin.html?tab=listings', label: 'Listings', icon: 'list', active })}
        ${navLink({ href: '/admin.html?tab=people', label: 'People', icon: 'users', active })}
        ${navLink({ href: '/admin.html?tab=activity', label: 'Activity', icon: 'activity', active })}
      </div>
      <div class="nav-group">
        <span class="nav-label">Browse</span>
        ${explore}
        ${navLink({ href: '/account.html', label: 'Account settings', icon: 'shield', active })}
      </div>`;
  }

  return `
    <div class="nav-group">
      <span class="nav-label">Main</span>
      ${navLink({ href: '/dashboard.html', label: 'Home', icon: 'grid', active })}
      ${explore}
      ${navLink({ href: '/report.html', label: 'Report an item', icon: 'plus', active })}
    </div>
    <div class="nav-group">
      <span class="nav-label">Your account</span>
      ${navLink({ href: '/dashboard.html?tab=my-claims', label: 'My claims', icon: 'inbox', active })}
      ${navLink({ href: '/dashboard.html?tab=notifications', label: 'Notifications', icon: 'bell', active })}
      ${navLink({ href: '/account.html', label: 'Account settings', icon: 'shield', active })}
    </div>`;
}

function brand() {
  return `<a class="brand" href="/index.html">
      <img class="brand-logo" src="/img/logo.svg" alt="" width="34" height="34">
      <span class="brand-text"><b>Campus Lost &amp; Found</b><span>Sai University</span></span>
    </a>`;
}

export async function mountHeader(active) {
  const host = $('#site-header');
  if (!host) return;

  const user = getUser();
  const admin = isAdmin();
  const app = $('.app');
  // The landing page keeps the visitor bar even for signed-in users; everything
  // else switches to the sidebar once someone is signed in.
  const shell = Boolean(user) && active !== 'home';
  if (app) app.classList.toggle('app--shell', shell);

  if (shell) {
    const initials = (user.name || '').split(' ').filter(Boolean)
      .map((p2) => p2[0]).slice(0, 2).join('').toUpperCase();

    host.className = 'sidebar';
    host.innerHTML = `
      <div class="sidebar-head">${brand()}</div>
      <nav class="sidebar-nav" aria-label="Main">${sidebarGroups(active)}</nav>
      <div class="sidebar-foot">
        <div class="user-chip">
          <span class="avatar">${escapeHtml(initials)}</span>
          <span>
            <span class="user-chip-name">${escapeHtml(user.name)}</span>
            <span class="user-chip-role">${admin ? 'Administrator' : 'Student'}</span>
          </span>
        </div>
        <button class="signout-btn" id="nav-logout">Sign out</button>
      </div>`;

    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => app && app.classList.remove('nav-open'));

    const topbar = $('#topbar');
    if (topbar) {
      const trail = PAGE_META[active] || ['Home'];
      topbar.className = 'topbar';
      topbar.innerHTML = `
        <div class="topbar-left">
          <button class="icon-btn drawer-btn" id="drawer-open" aria-label="Open navigation">${ICONS.menu}</button>
          <div class="crumbs">
            <a href="/index.html">Portal</a>
            ${trail.map((part) => `<span aria-hidden="true">/</span><span>${escapeHtml(part)}</span>`).join('')}
          </div>
        </div>
        <div class="topbar-actions">
          ${themeButton()}
          <button class="icon-btn" id="bell-btn" aria-label="Notifications" aria-expanded="false">${ICONS.bell}</button>
          ${admin
    ? `<a class="btn btn-sm" href="/admin.html?tab=claims">${ICONS.clipboard}<span>Claims queue</span></a>`
    : `<a class="btn btn-primary btn-sm" href="/report.html">${ICONS.plus}<span>Report an item</span></a>`}
        </div>`;
      $('#drawer-open')?.addEventListener('click', () => app.classList.toggle('nav-open'));
    }
  } else {
    host.className = 'navbar';
    host.innerHTML = `
      <div class="navbar-inner">
        ${brand()}
        <nav class="nav-links" aria-label="Main">
          <a href="/index.html" ${active === 'home' ? 'aria-current="page"' : ''}>Home</a>
          <a href="/browse.html" ${active === 'browse' ? 'aria-current="page"' : ''}>Explore</a>
          ${user ? `<a href="${admin ? '/admin.html' : '/dashboard.html'}">${admin ? 'Desk' : 'Dashboard'}</a>` : ''}
        </nav>
        <div class="nav-actions">
          <button class="icon-btn nav-menu-btn" id="nav-menu" aria-label="Open menu" aria-expanded="false">${ICONS.menu}</button>
          ${themeButton()}
          ${user ? `<button class="icon-btn" id="bell-btn" aria-label="Notifications" aria-expanded="false">${ICONS.bell}</button>` : ''}
          ${user
    ? `<a class="btn btn-sm nav-user" href="${admin ? '/admin.html' : '/dashboard.html'}">
                 <span class="avatar avatar-sm">${escapeHtml((user.name || '').split(' ').filter(Boolean)
    .map((p2) => p2[0]).slice(0, 2).join('').toUpperCase())}</span>
                 <span class="nav-user-name">${escapeHtml((user.name || '').split(' ')[0] || 'Account')}</span>
               </a>`
    : `<a class="btn btn-ghost btn-sm nav-signin" href="/login.html">Sign in</a>
               <a class="btn btn-primary btn-sm" href="/register.html">Get started</a>`}
        </div>
      </div>`;
  }

  wireTheme();

  const menuBtn = $('#nav-menu');
  if (menuBtn) {
    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const bar = $('.navbar');
      const open = bar.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      const bar = $('.navbar');
      if (!bar || !bar.classList.contains('is-open')) return;
      if (bar.contains(event.target)) return;
      bar.classList.remove('is-open');
    });
  }

  if (user) initBell();

  const logout = $('#nav-logout');
  if (logout) {
    logout.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Sign out?',
        body: 'You will need to sign in again to post items or manage claims.',
        confirmLabel: 'Sign out',
      });
      if (yes) { clearSession(); window.location.href = '/index.html'; }
    });
  }
}

/* ------------------------------------------------------------------- bell */
async function initBell() {
  const btn = $('#bell-btn');
  if (!btn) return;

  let data;
  try {
    data = await api.notifications();
  } catch { return; }

  // The counter is refreshed on a timer and whenever the tab regains focus, so
  // it does not sit stale on a page that has been open for a while.
  const refresh = async () => {
    try {
      const fresh = await api.notifications();
      data = fresh;
      paint(fresh.unreadCount);
      const panel = $('#bell-panel');
      if (panel) { panel.remove(); btn.setAttribute('aria-expanded', 'false'); }
    } catch { /* keep the last known state */ }
  };
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  const paint = (count) => {
    btn.querySelector('.bell-dot')?.remove();
    if (count > 0) {
      const dot = document.createElement('span');
      dot.className = 'bell-dot';
      dot.textContent = count > 9 ? '9+' : String(count);
      btn.appendChild(dot);
    }
  };
  paint(data.unreadCount);

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = $('#bell-panel');
    if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    btn.setAttribute('aria-expanded', 'true');

    const panel = document.createElement('div');
    panel.className = 'bell-panel';
    panel.id = 'bell-panel';
    const items = data.notifications.slice(0, 6);
    panel.innerHTML = `
      <div class="bell-head">
        <span>${data.unreadCount} unread</span>
        <button class="btn btn-quiet btn-sm" id="bell-read">Mark all read</button>
      </div>
      ${items.length ? items.map((n) => `
        <a class="bell-item ${n.isRead ? '' : 'unread'}" data-id="${escapeHtml(n.id)}"
           href="${escapeHtml(n.link || '/dashboard.html?tab=notifications')}">
          <strong>${escapeHtml(n.title)}</strong>
          <span>${escapeHtml(n.message || '')}</span>
        </a>`).join('') : '<div class="bell-item"><span>Nothing new right now.</span></div>'}
      <div class="bell-head"><a href="/dashboard.html?tab=notifications">See all</a></div>`;
    document.body.appendChild(panel);

    $('#bell-read')?.addEventListener('click', async () => {
      await api.markAllRead();
      paint(0);
      panel.remove();
    });

    // Opening a notification marks just that one as read.
    $$('.bell-item[data-id]', panel).forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const entry = data.notifications.find((n) => n.id === id);
        if (entry && !entry.isRead) {
          api.markRead(id).then(() => {
            entry.isRead = true;
            paint(Math.max(0, data.unreadCount - 1));
            data.unreadCount = Math.max(0, data.unreadCount - 1);
          }).catch(() => {});
        }
      });
    });
  });

  document.addEventListener('click', (event) => {
    const panel = $('#bell-panel');
    if (!panel) return;
    if (panel.contains(event.target) || btn.contains(event.target)) return;
    panel.remove();
  });
}

/* ------------------------------------------------------------------ guards */
export function requireLogin(redirectBack = true) {
  if (getToken()) return true;
  const next = redirectBack ? `?next=${encodeURIComponent(window.location.pathname + window.location.search)}` : '';
  window.location.href = `/login.html${next}`;
  return false;
}

export function requireAdmin() {
  if (!isAdmin()) { window.location.href = '/index.html'; return false; }
  return true;
}

/* --------------------------------------------------------------- fragments */
export function itemCard(item, ref) {
  const media = item.images && item.images.length
    ? `<img src="${escapeHtml(item.images[0])}" alt="" loading="lazy">`
    : `<span style="opacity:.55">${ICONS.image}</span>`;

  return `
    <a class="item-card" href="/item.html?id=${encodeURIComponent(item.id)}">
      <div class="item-thumb">
        ${media}
        <span class="thumb-badge">${typeBadge(item.type)}</span>
      </div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="meta" style="font-size:.8rem">
          <span>${ICONS.tag}${escapeHtml(ref.categoryName(item.category))}</span>
        </div>
        <div class="item-foot">
          <span class="where">${ICONS.mapPin}${escapeHtml(ref.buildingName(item.location.building))}</span>
          <span>${formatDate(item.dateOccurred)}</span>
        </div>
      </div>
    </a>`;
}

export function emptyState(title, body, cta = null) {
  return `
    <div class="empty">
      <span class="empty-icon">${ICONS.box}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
      ${cta ? `<a class="btn btn-primary" href="${cta.href}">${escapeHtml(cta.label)}</a>` : ''}
    </div>`;
}

export function loadingCards(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="sk-thumb skeleton" style="border-radius:0"></div>
      <div class="sk-body">
        <div class="skeleton" style="width:70%"></div>
        <div class="skeleton" style="width:44%"></div>
        <div class="skeleton" style="width:56%;margin-top:6px"></div>
      </div>
    </div>`).join('');
}

/* Theme controls exist on pages that never mount the shell, so bind them once
   the document is ready rather than relying on mountHeader. */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => wireTheme());
  } else {
    wireTheme();
  }
}
