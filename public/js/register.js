import { api, setSession, ApiError } from './api.js';
import { mountHeader, setTheme, currentTheme, $, $$, toast, ICONS } from './ui.js';

const form = $('#register-form');

function paint() {
  const points = [
    'Report lost items and hand in what you find',
    'Claim an item with the detail only you would know',
    'Collect from the desk with a pickup code',
  ];
  $('#auth-points').innerHTML = points
    .map((p) => `<div>${ICONS.check}<span>${p}</span></div>`).join('');

  $$('.theme-toggle').forEach((btn) => {
    btn.innerHTML = `<span class="icon-moon">${ICONS.moon}</span><span class="icon-sun">${ICONS.sun}</span>`;
  });

  const toggle = $('#toggle-password');
  const input = $('#password');
  toggle.innerHTML = ICONS.eye;
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  setTheme(currentTheme());
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const host = $('#register-error');
  host.innerHTML = '';
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Creating account';

  try {
    const { token, user } = await api.register({
      name: $('#name').value.trim(),
      studentId: $('#studentId').value.trim(),
      email: $('#email').value.trim(),
      phone: $('#phone').value.trim(),
      password: $('#password').value,
    });
    setSession(token, user);
    toast('Account created. Welcome.', 'ok');
    window.location.href = '/dashboard.html';
  } catch (err) {
    const list = err instanceof ApiError && err.errors.length
      ? `<ul style="margin:8px 0 0 18px">${err.errors.map((e) => `<li>${e.message}</li>`).join('')}</ul>`
      : '';
    host.innerHTML = `<div class="notice notice-bad" style="margin-bottom:16px">${err.message}${list}</div>`;
    button.disabled = false;
    button.textContent = 'Create account';
  }
});

paint();
mountHeader('register');
