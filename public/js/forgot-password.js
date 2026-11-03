import { api, ApiError } from './api.js';
import { setTheme, currentTheme, $, $$, toast, ICONS } from './ui.js';

let email = '';
let resetToken = '';

function paint() {
  $('#auth-points').innerHTML = [
    'A six-digit code, valid for a few minutes',
    'One code per request, and it can only be used once',
    'Your other signed-in devices are signed out',
  ].map((p) => `<div>${ICONS.check}<span>${p}</span></div>`).join('');

  $('#email-icon').insertAdjacentHTML('afterbegin', ICONS.inbox);
  $$('[data-reveal]').forEach((btn) => {
    const input = document.getElementById(btn.dataset.reveal);
    btn.innerHTML = ICONS.eye;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
    });
  });
  $$('.theme-toggle').forEach((btn) => {
    btn.innerHTML = `<span class="icon-moon">${ICONS.moon}</span><span class="icon-sun">${ICONS.sun}</span>`;
  });
  setTheme(currentTheme());
}

function go(step) {
  ['1', '2', '3', 'done'].forEach((n) => $(`#step-${n}`).classList.add('hidden'));
  $(`#step-${step}`).classList.remove('hidden');
  $$('#steps .badge').forEach((b) => {
    const n = Number(b.dataset.step);
    const current = step === 'done' ? 4 : Number(step);
    b.className = `badge ${n < current ? 'badge-ok' : n === current ? 'badge-info' : 'badge-neutral'}`;
  });
}

function showError(step, message, details = []) {
  const host = $(`#error-${step}`);
  host.innerHTML = `<div class="notice notice-bad" style="margin-bottom:16px">
      ${message}${details.length ? `<ul style="margin:8px 0 0 18px">${details.map((d) => `<li>${d}</li>`).join('')}</ul>` : ''}
    </div>`;
}

async function submitEmail(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  $('#error-1').innerHTML = '';
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Sending';

  email = $('#email').value.trim();
  try {
    await api.forgotPassword({ email });
    $('#sent-to').textContent = email;
    go('2');
    $('#code').focus();
    toast('If that address is registered, a code is on its way.', 'ok');
  } catch (err) {
    showError(1, err.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Send code';
  }
}

async function submitCode(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  $('#error-2').innerHTML = '';
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Checking';

  try {
    const data = await api.verifyOtp({ email, code: $('#code').value.trim() });
    resetToken = data.resetToken;
    go('3');
    $('#password').focus();
  } catch (err) {
    const details = err instanceof ApiError ? err.errors.map((e) => e.message) : [];
    showError(2, err.message, details);
  } finally {
    button.disabled = false;
    button.textContent = 'Verify code';
  }
}

async function submitPassword(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  $('#error-3').innerHTML = '';

  const password = $('#password').value;
  const confirm = $('#confirm').value;
  if (password !== confirm) {
    showError(3, 'The two passwords do not match.');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Saving';

  try {
    await api.resetPassword({ resetToken, password });
    go('done');
    toast('Password updated. You can sign in now.', 'ok');
  } catch (err) {
    const details = err instanceof ApiError ? err.errors.map((e) => e.message) : [];
    showError(3, err.message, details);
    button.disabled = false;
    button.textContent = 'Set new password';
  }
}

async function resend() {
  const btn = $('#resend');
  btn.disabled = true;
  try {
    await api.forgotPassword({ email });
    toast('If that address is registered, a new code is on its way.', 'ok');
  } catch (err) {
    showError(2, err.message);
  } finally {
    setTimeout(() => { btn.disabled = false; }, 5000);
  }
}

paint();
$('#form-email').addEventListener('submit', submitEmail);
$('#form-code').addEventListener('submit', submitCode);
$('#form-password').addEventListener('submit', submitPassword);
$('#resend').addEventListener('click', resend);
$('#code').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});
