import { api } from './api.js';
import {
  mountHeader, reference, requireAdmin, statusBadge, typeBadge, escapeHtml,
  formatDate, formatDateTime, timeAgo, $, $$, toast, emptyState,
  confirmDialog, promptDialog, ICONS,
} from './ui.js';

const panel = $('#panel');
let ref;

/* ------------------------------------------------------------------ charts */
const note = (message) => `<p class="muted" style="font-size:.86rem;margin:0">${escapeHtml(message)}</p>`;

function stackedBars(rows) {
  if (!rows.length) return note('No listings yet, so there is nothing to break down.');
  const max = Math.max(1, ...rows.map((r) => r.lost + r.found));
  return `
    <div class="legend">
      <span><i style="background:var(--warn)"></i>Lost</span>
      <span><i style="background:var(--success)"></i>Found</span>
    </div>
    <div class="bars">
      ${rows.map((r) => `
        <div class="bar-row">
          <span class="bar-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
          <span class="bar-track">
            <span class="bar-fill lost" style="width:${(r.lost / max) * 100}%"></span>
            <span class="bar-fill found" style="width:${(r.found / max) * 100}%"></span>
          </span>
          <span class="bar-value">${r.lost + r.found}</span>
        </div>`).join('')}
    </div>`;
}

function singleBars(rows) {
  if (!rows.length) return note('No listings yet.');
  const max = Math.max(1, ...rows.map((r) => r.count));
  return `<div class="bars">
    ${rows.map((r) => `
      <div class="bar-row">
        <span class="bar-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
        <span class="bar-track"><span class="bar-fill single" style="width:${(r.count / max) * 100}%"></span></span>
        <span class="bar-value">${r.count}</span>
      </div>`).join('')}
  </div>`;
}

function lineChart(weeks) {
  const total = weeks.reduce((sum, w) => sum + w.lost + w.found, 0);
  if (!total) return note('No reports in the last eight weeks.');

  const width = 560;
  const height = 180;
  const pad = 22;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.lost, w.found)));
  const step = (width - pad * 2) / Math.max(1, weeks.length - 1);
  const point = (value, i) => [pad + i * step, height - pad - (value / max) * (height - pad * 2)];
  const path = (key) => weeks.map((w, i) => {
    const [x, y] = point(w[key], i);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `
    <div class="legend">
      <span><i style="background:var(--warn)"></i>Lost</span>
      <span><i style="background:var(--success)"></i>Found</span>
    </div>
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reports per week">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="var(--border)"></line>
      <path d="${path('lost')}" fill="none" stroke="var(--warn)" stroke-width="2.5" stroke-linejoin="round"></path>
      <path d="${path('found')}" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linejoin="round"></path>
      ${weeks.map((w, i) => `<text x="${point(0, i)[0]}" y="${height - 4}" font-size="9"
        fill="var(--text-3)" text-anchor="middle">${escapeHtml(w.label)}</text>`).join('')}
    </svg>`;
}

function donut(rows) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (!total) return note('No claims yet.');

  const colours = {
    pending: 'var(--warn)', approved: 'var(--success)', collected: 'var(--accent)',
    rejected: 'var(--danger)', cancelled: 'var(--text-3)',
  };
  let cursor = 0;
  const stops = rows.map((r) => {
    const from = cursor;
    cursor += (r.count / total) * 360;
    return `${colours[r.status] || 'var(--text-3)'} ${from}deg ${cursor}deg`;
  }).join(', ');

  return `<div class="donut-row">
    <div class="donut" style="background: conic-gradient(${stops})"></div>
    <div class="donut-key">
      ${rows.map((r) => `<span><i style="background:${colours[r.status] || 'var(--text-3)'}"></i>
        ${escapeHtml(r.status)} <strong>${r.count}</strong></span>`).join('')}
    </div>
  </div>`;
}

/* ----------------------------------------------------------------- overview */
async function renderOverview() {
  const [stats, charts] = await Promise.all([api.stats(), api.charts()]);
  const t = stats.totals;
  const c = stats.claims;
  const p = stats.performance;

  panel.innerHTML = `
    ${t.totalReports === 0 ? `<div class="notice notice-info" style="margin-bottom:22px">
      Nothing has been reported yet. These numbers fill in as students post items.
    </div>` : ''}

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon">${ICONS.alert}</div>
        <div class="label">Lost reports</div><div class="value">${t.totalLost}</div>
        <div class="sub">${stats.lostBreakdown.active || 0} listed now</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${ICONS.check}</div>
        <div class="label">Found reports</div><div class="value">${t.totalFound}</div>
        <div class="sub">${stats.foundBreakdown.active || 0} listed now</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${ICONS.list}</div>
        <div class="label">Listed now</div><div class="value">${t.activeListings}</div>
        <div class="sub">visible to the campus</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${ICONS.inbox}</div>
        <div class="label">Returned</div><div class="value">${t.returned}</div>
        <div class="sub">handed back to owners</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${ICONS.chart}</div>
        <div class="label">Recovery rate</div><div class="value">${p.recoveryRate}%</div>
        <div class="sub">of closed cases</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${ICONS.clock}</div>
        <div class="label">Avg. days to return</div><div class="value">${p.avgResolutionDays}</div>
        <div class="sub">report to handover</div>
      </div>
      <div class="stat-card ${c.pending ? 'is-alert' : ''}">
        <div class="stat-icon">${ICONS.clipboard}</div>
        <div class="label">Claims waiting</div><div class="value">${c.pending}</div>
        <div class="sub">${c.pendingOlderThan3Days} older than 3 days</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">${ICONS.users}</div>
        <div class="label">Registered people</div><div class="value">${t.totalUsers}</div>
        <div class="sub">students and desk staff</div>
      </div>
    </div>

    <div class="chart-grid" style="margin-top:20px">
      <div class="chart-card"><h3>By category</h3>${stackedBars(charts.byCategory.slice(0, 8))}</div>
      <div class="chart-card"><h3>Where items turn up</h3>${singleBars(charts.byBuilding.slice(0, 8))}</div>
      <div class="chart-card"><h3>Reports, last eight weeks</h3>${lineChart(charts.weeklyTrend)}</div>
      <div class="chart-card"><h3>Claim outcomes</h3>${donut(charts.claimOutcomes)}</div>
    </div>

    <div class="card" style="margin-top:20px">
      <h3 style="font-size:1rem">How these numbers are counted</h3>
      <p class="muted" style="font-size:.87rem">
        Recovery rate is items returned divided by items returned plus items archived. An archived item
        is one nobody claimed inside the holding period, so the figure shows how often a closed case ends
        in a handover rather than in disposal. Average days to return runs from the moment the report was
        posted to the moment the handover was recorded.
      </p>
    </div>`;
}

/* ------------------------------------------------------------------- claims */
async function renderClaims() {
  const { claims, counts } = await api.listClaims({ status: 'all' });
  if (!claims.length) {
    panel.innerHTML = emptyState(
      'No claims waiting',
      'When a student claims a found item it appears here with the identifying detail they gave. Approve or reject it, then record the handover with their pickup code.',
      { href: '/admin.html?tab=listings', label: 'See all listings' },
    );
    return;
  }

  const pending = claims.filter((c) => c.status === 'pending');
  const rest = claims.filter((c) => c.status !== 'pending');

  const row = (c) => `
    <tr>
      <td>
        <a href="/item.html?id=${c.itemId}" class="cell-title">${escapeHtml(c.item ? c.item.title : 'Listing')}</a>
        <div class="cell-sub">${c.item ? escapeHtml(ref.buildingName(c.item.location.building)) : ''}</div>
      </td>
      <td>
        ${escapeHtml(c.claimant.name || '')}
        <div class="cell-sub">${escapeHtml(c.claimant.email || '')}</div>
      </td>
      <td style="max-width:290px">
        <div style="font-size:.85rem">${escapeHtml(c.message)}</div>
        <div class="notice notice-info" style="margin-top:8px;font-size:.8rem">
          <strong>Their detail:</strong> ${escapeHtml(c.verificationAnswer || 'not given')}
        </div>
      </td>
      <td>
        ${statusBadge(c.status)}
        ${c.pickupCode ? `<div class="mono" style="margin-top:6px">${escapeHtml(c.pickupCode)}</div>` : ''}
        ${c.hasProof ? `<button class="btn btn-sm btn-quiet" data-proof="${c.id}" style="margin-top:6px">View evidence</button>` : ''}
      </td>
      <td class="muted" style="white-space:nowrap">${timeAgo(c.createdAt)}</td>
      <td style="white-space:nowrap">
        ${c.status === 'pending' ? `
          <button class="btn btn-success btn-sm" data-approve="${c.id}">Approve</button>
          <button class="btn btn-danger btn-sm" data-reject="${c.id}">Reject</button>` : ''}
        ${c.status === 'approved' ? `<button class="btn btn-sm" data-collect="${c.id}">Record handover</button>` : ''}
      </td>
    </tr>`;

  panel.innerHTML = `
    <div class="table-toolbar">
      <span class="badge badge-pending">${counts.pending || 0} waiting</span>
      <span class="badge badge-ok">${(counts.approved || 0) + (counts.collected || 0)} approved</span>
      <span class="badge badge-bad">${counts.rejected || 0} rejected</span>
    </div>
    <div class="table-wrap"><div class="table-scroll">
      <table>
        <thead><tr><th>Listing</th><th>Claimant</th><th>Claim and identifying detail</th><th>Status</th><th>Filed</th><th></th></tr></thead>
        <tbody>${[...pending, ...rest].map(row).join('')}</tbody>
      </table>
    </div></div>`;

  $$('[data-approve]').forEach((btn) => {
    btn.onclick = async () => {
      const ok = await confirmDialog({
        title: 'Approve this claim?',
        body: 'The item is reserved for this claimant and a pickup code is generated. Make sure their detail matches what the finder recorded.',
        confirmLabel: 'Approve claim',
      });
      if (!ok) return;
      const noteText = await promptDialog({
        title: 'Note for the student',
        body: 'Optional. They will see this on their dashboard.',
        label: 'Note',
        value: 'Identifying detail matched.',
      });
      if (noteText === null) return;
      try {
        const { claim } = await api.decideClaim(btn.dataset.approve, { action: 'approve', decisionNote: noteText });
        toast(`Approved. Pickup code ${claim.pickupCode}.`, 'ok');
        renderClaims();
        refreshBadge();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });

  $$('[data-reject]').forEach((btn) => {
    btn.onclick = async () => {
      const noteText = await promptDialog({
        title: 'Reject this claim',
        body: 'Give a reason. The student sees it on their dashboard.',
        label: 'Reason',
        value: 'The identifying detail did not match.',
        confirmLabel: 'Reject claim',
        required: true,
      });
      if (noteText === null) return;
      try {
        await api.decideClaim(btn.dataset.reject, { action: 'reject', decisionNote: noteText });
        toast('Claim rejected.', 'ok');
        renderClaims();
        refreshBadge();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });

  $$('[data-proof]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        const { url } = await api.claimProof(btn.dataset.proof);
        if (!url) { toast('This claim has no evidence attached.', 'bad'); return; }
        window.open(url, '_blank', 'noopener');
      } catch (err) { toast(err.message, 'bad'); }
    };
  });

  $$('[data-collect]').forEach((btn) => {
    btn.onclick = async () => {
      const code = await promptDialog({
        title: 'Record the handover',
        body: 'Enter the pickup code the student shows at the desk. This closes the claim and marks the item returned.',
        label: 'Pickup code',
        confirmLabel: 'Record handover',
        required: true,
      });
      if (!code) return;
      try {
        await api.collectClaim(btn.dataset.collect, { pickupCode: code.trim() });
        toast('Handover recorded. The item is now returned.', 'ok');
        renderClaims();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });
}

/* ----------------------------------------------------------------- listings */
let listingFilter = 'all';

async function renderListings() {
  const { items } = await api.adminItems({ status: listingFilter });
  const filters = [
    ['all', 'All'], ['active', 'Listed'], ['claimed', 'Reserved'],
    ['returned', 'Returned'], ['pending', 'Hidden'], ['archived', 'Archived'],
  ];

  const toolbar = `
    <div class="chips" style="margin-bottom:18px">
      ${filters.map(([value, label]) => `
        <button class="chip ${listingFilter === value ? 'is-active' : ''}" data-filter="${value}" type="button">${label}</button>
      `).join('')}
    </div>`;

  if (!items.length) {
    panel.innerHTML = toolbar + emptyState(
      'Nothing here yet',
      listingFilter === 'all'
        ? 'No items have been reported. Listings appear the moment a student posts one.'
        : 'No listings with this status.',
      { href: '/browse.html', label: 'Open the public catalogue' },
    );
    bindFilters();
    return;
  }

  panel.innerHTML = toolbar + `
    <div class="table-wrap"><div class="table-scroll">
      <table>
        <thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Reported by</th><th>Posted</th><th>Change status</th></tr></thead>
        <tbody>
          ${items.map((i) => `
            <tr>
              <td>
                <a href="/item.html?id=${i.id}" class="cell-title">${escapeHtml(i.title)}</a>
                <div class="cell-sub">${escapeHtml(ref.buildingName(i.location.building))}, ${formatDate(i.dateOccurred)}</div>
              </td>
              <td>${typeBadge(i.type)}</td>
              <td>${statusBadge(i.status)}</td>
              <td>${escapeHtml(i.reporter.name)}</td>
              <td class="muted" style="white-space:nowrap">${formatDate(i.createdAt)}</td>
              <td>
                <select data-status="${i.id}" style="width:auto;padding:6px 30px 6px 10px;font-size:.82rem">
                  ${['active', 'claimed', 'returned', 'pending', 'rejected', 'archived']
    .map((s) => `<option value="${s}" ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div></div>`;

  bindFilters();

  $$('[data-status]').forEach((select) => {
    select.onchange = async () => {
      try {
        await api.setStatus(select.dataset.status, { status: select.value });
        toast(`Status set to ${select.value}.`, 'ok');
        renderListings();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });
}

function bindFilters() {
  $$('[data-filter]').forEach((btn) => {
    btn.onclick = () => { listingFilter = btn.dataset.filter; renderListings(); };
  });
}

/* ------------------------------------------------------------------- people */
let peopleQuery = '';

async function renderPeople() {
  const { users } = await api.adminUsers(peopleQuery ? { q: peopleQuery } : {});
  const searchBar = `
    <form class="table-toolbar" id="people-search">
      <div class="input-icon" style="max-width:340px;flex:1">
        <input type="search" name="q" placeholder="Search by name, email or PRN" value="${escapeHtml(peopleQuery)}">
      </div>
      <button class="btn btn-sm" type="submit">Search</button>
      ${peopleQuery ? '<button class="btn btn-sm btn-quiet" type="button" id="clear-people">Clear</button>' : ''}
      <span class="muted" style="font-size:.82rem">${users.length} account${users.length === 1 ? '' : 's'}</span>
    </form>`;

  if (!users.length) {
    panel.innerHTML = searchBar + emptyState(
      peopleQuery ? 'No accounts match that search' : 'No accounts yet',
      peopleQuery ? 'Try a different name, email or PRN.' : 'Students appear here once they register.',
    );
    bindPeopleSearch();
    return;
  }

  panel.innerHTML = searchBar + `
    <div class="table-toolbar" id="bulk-bar" style="display:none">
      <span class="muted" id="bulk-count" style="font-size:.85rem"></span>
      <button class="btn btn-sm btn-danger" id="bulk-delete" type="button">Delete selected</button>
    </div>
    <div class="table-wrap"><div class="table-scroll">
      <table>
        <thead><tr>
          <th style="width:36px"><input type="checkbox" id="select-all" aria-label="Select all"></th>
          <th>Name</th><th>Email</th><th>PRN</th><th>Role</th><th>Listings</th><th>Joined</th><th></th>
        </tr></thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td><input type="checkbox" class="row-select" data-id="${u.id}" ${u.isSelf ? 'disabled title="This is your own account"' : ''} aria-label="Select ${escapeHtml(u.name)}"></td>
              <td class="cell-title">${escapeHtml(u.name)}
                ${u.isBlocked ? '<span class="badge badge-bad" style="margin-left:8px">Blocked</span>' : ''}
                ${u.isSelf ? '<span class="badge badge-info" style="margin-left:8px">You</span>' : ''}</td>
              <td>${escapeHtml(u.email)}</td>
              <td class="mono">${u.studentId ? escapeHtml(u.studentId) : '<span class="muted">—</span>'}</td>
              <td><span class="badge ${u.role === 'admin' ? 'badge-info' : 'badge-neutral'}">${escapeHtml(u.role)}</span></td>
              <td>${u.listingCount}</td>
              <td class="muted" style="white-space:nowrap">${formatDate(u.createdAt)}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-sm" data-role="${u.id}" data-current="${u.role}">
                  ${u.role === 'admin' ? 'Make student' : 'Make admin'}
                </button>
                <button class="btn btn-sm ${u.isBlocked ? 'btn-success' : 'btn-danger'}"
                  data-block="${u.id}" data-blocked="${u.isBlocked}">
                  ${u.isBlocked ? 'Unblock' : 'Block'}
                </button>
                <button class="btn btn-sm btn-quiet-danger" data-delete-user="${u.id}"
                  data-name="${escapeHtml(u.name)}" data-email="${escapeHtml(u.email)}"
                  data-listings="${u.listingCount}" data-claims="${u.claimCount}"
                  ${u.isSelf ? 'disabled title="You cannot delete your own account"' : ''}>
                  Delete
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div></div>`;

  bindPeopleSearch();
  bindUserDeletion(users);

  $$('[data-role]').forEach((btn) => {
    btn.onclick = async () => {
      const role = btn.dataset.current === 'admin' ? 'user' : 'admin';
      const ok = await confirmDialog({
        title: role === 'admin' ? 'Give this account desk access?' : 'Remove desk access?',
        body: role === 'admin'
          ? 'They will be able to approve claims, change listings and see every statistic.'
          : 'They keep their own account and listings, but lose the desk console.',
        confirmLabel: role === 'admin' ? 'Make admin' : 'Make student',
      });
      if (!ok) return;
      try {
        await api.updateUser(btn.dataset.role, { role });
        toast(`Role changed to ${role}.`, 'ok');
        renderPeople();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });

  $$('[data-block]').forEach((btn) => {
    btn.onclick = async () => {
      const blocked = btn.dataset.blocked === 'true';
      const ok = await confirmDialog({
        title: blocked ? 'Unblock this account?' : 'Block this account?',
        body: blocked
          ? 'They will be able to sign in and use the portal again.'
          : 'They will not be able to sign in. Their listings stay in the catalogue.',
        confirmLabel: blocked ? 'Unblock' : 'Block',
        danger: !blocked,
      });
      if (!ok) return;
      try {
        await api.updateUser(btn.dataset.block, { isBlocked: !blocked });
        toast(blocked ? 'Account unblocked.' : 'Account blocked.', 'ok');
        renderPeople();
      } catch (err) { toast(err.message, 'bad'); }
    };
  });
}

/**
 * Permanent deletion. Both the single-row and bulk paths funnel through the same
 * confirmation, which states exactly what else will go with the account.
 */
function bindUserDeletion(users) {
  const selected = () => $$('.row-select:checked').map((box) => box.dataset.id);
  const bar = $('#bulk-bar');
  const count = $('#bulk-count');

  const syncBar = () => {
    const ids = selected();
    bar.style.display = ids.length ? 'flex' : 'none';
    count.textContent = `${ids.length} account${ids.length === 1 ? '' : 's'} selected`;
  };

  $$('.row-select').forEach((box) => { box.onchange = syncBar; });
  $('#select-all')?.addEventListener('change', (event) => {
    $$('.row-select').forEach((box) => { if (!box.disabled) box.checked = event.target.checked; });
    syncBar();
  });

  const describe = (targets) => {
    const listings = targets.reduce((sum, u) => sum + (u.listingCount || 0), 0);
    const claims = targets.reduce((sum, u) => sum + (u.claimCount || 0), 0);
    const bits = [`${targets.length} account${targets.length === 1 ? '' : 's'}`];
    if (listings) bits.push(`${listings} listing${listings === 1 ? '' : 's'} and their photos`);
    if (claims) bits.push(`${claims} claim${claims === 1 ? '' : 's'}`);
    return bits.join(', ');
  };

  const runDelete = async (targets) => {
    const ok = await confirmDialog({
      title: targets.length === 1 ? `Delete ${targets[0].name}?` : `Delete ${targets.length} accounts?`,
      body: `This permanently removes ${describe(targets)}. It cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;

    let failures = 0;
    for (const target of targets) {
      try {
        await api.deleteUser(target.id);
      } catch (err) {
        failures += 1;
        toast(`${target.name}: ${err.message}`, 'bad');
      }
    }
    if (!failures) toast(`${targets.length} account${targets.length === 1 ? '' : 's'} deleted.`, 'ok');
    renderPeople();
  };

  $$('[data-delete-user]').forEach((btn) => {
    btn.onclick = () => runDelete([{
      id: btn.dataset.deleteUser,
      name: btn.dataset.name,
      email: btn.dataset.email,
      listingCount: Number(btn.dataset.listings),
      claimCount: Number(btn.dataset.claims),
    }]);
  });

  $('#bulk-delete')?.addEventListener('click', () => {
    const ids = selected();
    const targets = users.filter((u) => ids.includes(u.id) && !u.isSelf);
    if (targets.length) runDelete(targets);
  });
}

function bindPeopleSearch() {
  const bar = $('#people-search');
  if (!bar) return;
  bar.addEventListener('submit', (event) => {
    event.preventDefault();
    peopleQuery = bar.elements.q.value.trim();
    renderPeople();
  });
  $('#clear-people')?.addEventListener('click', () => {
    peopleQuery = '';
    renderPeople();
  });
}

/* ----------------------------------------------------------------- activity */
async function renderActivity() {
  const [{ pairs }, { logs }] = await Promise.all([
    api.duplicates().catch(() => ({ pairs: [] })),
    api.auditLog({ limit: 60 }).catch(() => ({ logs: [] })),
  ]);

  const duplicates = pairs.length ? pairs.map((p) => `
    <div class="card card--pad" style="margin-bottom:12px">
      <div class="spread">
        <strong style="font-size:.92rem">Possible duplicate</strong>
        <span class="match-score">${Math.round(p.score * 100)}% similar</span>
      </div>
      <div class="row" style="margin-top:12px;align-items:stretch">
        <a class="card card--pad card--hover" style="flex:1" href="/item.html?id=${p.a.id}">
          <strong style="font-size:.88rem">${escapeHtml(p.a.title)}</strong>
          <div class="cell-sub">${escapeHtml(ref.buildingName(p.a.location.building))}, ${formatDate(p.a.dateOccurred)}</div>
        </a>
        <a class="card card--pad card--hover" style="flex:1" href="/item.html?id=${p.b.id}">
          <strong style="font-size:.88rem">${escapeHtml(p.b.title)}</strong>
          <div class="cell-sub">${escapeHtml(ref.buildingName(p.b.location.building))}, ${formatDate(p.b.dateOccurred)}</div>
        </a>
      </div>
      <ul class="match-reasons">${p.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>`).join('')
    : note('No two listings look like the same item.');

  const audit = logs.length ? `
    <div class="table-wrap"><div class="table-scroll">
      <table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>
          ${logs.map((l) => `
            <tr>
              <td class="muted" style="white-space:nowrap">${formatDateTime(l.createdAt)}</td>
              <td>${escapeHtml(l.actor.name)}<div class="cell-sub">${escapeHtml(l.actor.role || '')}</div></td>
              <td><span class="badge badge-neutral">${escapeHtml(l.action)}</span></td>
              <td style="font-size:.84rem">${escapeHtml(l.summary)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div></div>`
    : note('Nothing recorded yet. Approvals, status changes and role changes all appear here.');

  panel.innerHTML = `
    <div class="chart-grid" style="grid-template-columns:1fr">
      <div class="chart-card">
        <h3>Possible duplicates</h3>
        <p class="muted" style="font-size:.85rem;margin-bottom:16px">
          Two reports of the same type that the scorer thinks describe one physical item.
        </p>
        ${duplicates}
      </div>
      <div class="chart-card">
        <h3>Audit trail</h3>
        <p class="muted" style="font-size:.85rem;margin-bottom:16px">
          Every privileged action, in order. This list is append only.
        </p>
        ${audit}
      </div>
    </div>`;
}

/* ------------------------------------------------------------------- shell */
const TABS = {
  overview: renderOverview,
  claims: renderClaims,
  listings: renderListings,
  people: renderPeople,
  activity: renderActivity,
};

async function refreshBadge() {
  try {
    const stats = await api.stats();
    const n = stats.claims.pending;
    $('#claim-badge').innerHTML = n ? `<span class="nav-count">${n}</span>` : '';
  } catch { /* cosmetic */ }
}

function setTab(name) {
  const tab = TABS[name] ? name : 'overview';
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  history.replaceState(null, '', `?tab=${tab}`);
  panel.innerHTML = '<div class="skeleton" style="height:200px"></div>';
  TABS[tab]().catch((err) => {
    panel.innerHTML = `<div class="notice notice-bad">${escapeHtml(err.message)}</div>`;
  });
}

async function init() {
  await mountHeader('admin');
  if (!requireAdmin()) return;

  $('#refresh').innerHTML = `${ICONS.activity}<span>Refresh</span>`;
  ref = await reference();

  $$('.tabs button').forEach((btn) => { btn.onclick = () => setTab(btn.dataset.tab); });
  $('#refresh').onclick = () => setTab(new URLSearchParams(window.location.search).get('tab') || 'overview');

  refreshBadge();
  setTab(new URLSearchParams(window.location.search).get('tab') || 'overview');
}

init();
