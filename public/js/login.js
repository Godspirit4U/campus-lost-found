import { api, setSession } from './api.js';
import { mountHeader, setTheme, currentTheme, $, $$, toast, ICONS } from './ui.js';

const form = $('#login-form');

function paint() {
  const points = [
    'Post lost and found items in under a minute',
    'Every claim verified by the lost and found desk',
    'Track your reports and pickups in one place',
  ];
  $('#auth-points').innerHTML = points
    .map((p) => `<div>${ICONS.check}<span>${p}</span></div>`).join('');

  $('#email-icon').insertAdjacentHTML('afterbegin', ICONS.inbox);

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
  const errorHost = $('#login-error');
  errorHost.innerHTML = '';
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Signing in';

  try {
    const { token, user } = await api.login({
      email: $('#email').value.trim(),
      password: $('#password').value,
    });
    setSession(token, user);
    toast(`Welcome back, ${user.name.split(' ')[0]}.`, 'ok');
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || (user.role === 'admin' ? '/admin.html' : '/dashboard.html');
  } catch (err) {
    errorHost.innerHTML = `<div class="notice notice-bad" style="margin-bottom:16px">${err.message}</div>`;
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

paint();
mountHeader('login');
