import { api, getUser, setSession, getToken, ApiError } from './api.js';
import {
  mountHeader, requireLogin, $, $$, toast, ICONS, escapeHtml,
} from './ui.js';

const ROLE_LABEL = { admin: 'Administrator (lost and found desk)', user: 'Student' };

function paintIcons() {
  $$('[data-reveal]').forEach((btn) => {
    const input = document.getElementById(btn.dataset.reveal);
    btn.innerHTML = ICONS.eye;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

function fillProfile(user) {
  $('#name').value = user.name || '';
  $('#phone').value = user.phone || '';
  $('#email-view').value = user.email || '';
  $('#prn-view').value = user.studentId || 'Not applicable (desk account)';
  $('#role-view').value = ROLE_LABEL[user.role] || user.role;
  $('#prn-view').disabled = true;
}

async function saveProfile(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const host = $('#profile-msg');
  host.innerHTML = '';
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Saving';

  try {
    const { user } = await api.updateProfile({
      name: $('#name').value.trim(),
      phone: $('#phone').value.trim(),
    });
    // Keep the cached session in step with the server.
    setSession(getToken(), user);
    fillProfile(user);
    host.innerHTML = '<div class="notice notice-ok" style="margin-bottom:14px">Profile updated.</div>';
    toast('Profile saved.', 'ok');
  } catch (err) {
    const details = err instanceof ApiError ? err.errors.map((e) => e.message) : [];
    host.innerHTML = `<div class="notice notice-bad" style="margin-bottom:14px">${escapeHtml(err.message)}${
      details.length ? `<ul style="margin:8px 0 0 18px">${details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Save changes';
  }
}

async function savePassword(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const host = $('#password-msg');
  host.innerHTML = '';

  const next = $('#next').value;
  if (next !== $('#confirm').value) {
    host.innerHTML = '<div class="notice notice-bad" style="margin-bottom:14px">The two new passwords do not match.</div>';
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Updating';

  try {
    const { token } = await api.changePassword({
      currentPassword: $('#current').value,
      newPassword: next,
    });
    // The server rotates passwordChangedAt, so the old token is dead; keep the
    // new one or the next click would sign the user out.
    setSession(token, getUser());
    $('#password-form').reset();
    host.innerHTML = '<div class="notice notice-ok" style="margin-bottom:14px">Password updated. Other devices have been signed out.</div>';
    toast('Password updated.', 'ok');
  } catch (err) {
    const details = err instanceof ApiError ? err.errors.map((e) => e.message) : [];
    host.innerHTML = `<div class="notice notice-bad" style="margin-bottom:14px">${escapeHtml(err.message)}${
      details.length ? `<ul style="margin:8px 0 0 18px">${details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Update password';
  }
}

async function init() {
  if (!requireLogin()) return;
  paintIcons();

  try {
    const { user } = await api.me();
    setSession(getToken(), user);
    fillProfile(user);
  } catch {
    fillProfile(getUser() || {});
  }

  $('#profile-form').addEventListener('submit', saveProfile);
  $('#password-form').addEventListener('submit', savePassword);
}

mountHeader('account').then(init);
