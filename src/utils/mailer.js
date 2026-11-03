/**
 * Email delivery.
 *
 * Two adapters behind one function:
 *   brevo   - used when BREVO_API_KEY is present
 *   console - development fallback that logs to the server and never leaves the box
 *
 * Nothing here throws into a request. Every failure is reported to the caller as
 * { delivered: false, reason } so the API can tell the truth about what happened.
 */

function mode() {
  return process.env.BREVO_API_KEY ? 'brevo' : 'console';
}

function sender() {
  return {
    email: process.env.MAIL_FROM_EMAIL || 'no-reply@saiuniversity.edu.in',
    name: process.env.MAIL_FROM_NAME || 'SaiU Lost & Found',
  };
}

function siteUrl() {
  return String(process.env.APP_BASE_URL || 'https://campus-lost-found-qfx1.onrender.com').replace(/\/+$/, '');
}

function layout({ heading, intro, body, footer }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e3db;border-radius:14px;overflow:hidden;">
          <tr><td style="background:#6b46c1;padding:22px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:12px;">
                <img src="${siteUrl()}/img/logo.svg" width="38" height="38" alt=""
                     style="display:block;border-radius:10px;background:#ffffff;">
              </td>
              <td>
                <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.02em;">SaiU Lost &amp; Found</div>
                <div style="color:#e9e2ff;font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-top:4px;">Sai University</div>
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px 8px;">
            <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:#1b1a18;">${heading}</h1>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#57534d;">${intro}</p>
            ${body}
          </td></tr>
          <tr><td style="padding:8px 28px 30px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#8a857c;">${footer}</p>
          </td></tr>
        </table>
        <div style="max-width:520px;margin:14px auto 0;font-size:11px;color:#9b968d;text-align:center;">
          You received this because someone used this address on the SaiU Lost &amp; Found portal.
        </div>
      </td></tr>
    </table>
  </body>
</html>`;
}

function otpEmail({ code, minutes }) {
  return {
    subject: `Your SaiU Lost & Found reset code: ${code}`,
    html: layout({
      heading: 'Reset your password',
      intro: 'Enter this code on the portal to choose a new password. It expires shortly and can be used once.',
      body: `<div style="margin:0 0 18px;padding:18px;border:1px dashed #cfc7f5;border-radius:12px;background:#f6f2ff;text-align:center;">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:32px;letter-spacing:10px;font-weight:700;color:#4c1d95;">${code}</div>
        </div>
        <p style="margin:0 0 8px;font-size:14px;color:#57534d;">The code expires in ${minutes} minutes.</p>`,
      footer: 'If you did not ask to reset your password, ignore this email. Your password has not changed.',
    }),
    text: `Your SaiU Lost & Found reset code is ${code}. It expires in ${minutes} minutes.`,
  };
}

function resetDoneEmail({ name }) {
  return {
    subject: 'Your SaiU Lost & Found password was changed',
    html: layout({
      heading: 'Password changed',
      intro: `${name ? `${name}, your` : 'Your'} password was reset successfully. You can sign in with the new password now.`,
      body: '<p style="margin:0 0 8px;font-size:14px;color:#57534d;">If this was not you, contact the lost and found desk immediately.</p>',
      footer: 'This is an automated message from the SaiU Lost & Found portal.',
    }),
    text: 'Your SaiU Lost & Found password was changed.',
  };
}

async function deliver({ to, subject, html, text }) {
  const from = sender();
  const current = mode();

  if (current === 'console') {
    // Development adapter: no network, no secrets, output goes to the server log
    // only. Never enabled when BREVO_API_KEY exists.
    console.log(`[mailer:console] to=${to} subject="${subject}"`);
    if (process.env.MAIL_LOG_BODY === 'true') console.log(text || html);
    return { delivered: true, adapter: 'console' };
  }

  if (typeof fetch !== 'function') {
    return { delivered: false, adapter: current, reason: 'fetch-unavailable' };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: from,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[mailer:brevo] ${res.status} ${detail.slice(0, 300)}`);
      return { delivered: false, adapter: current, reason: `http-${res.status}` };
    }
    return { delivered: true, adapter: 'brevo' };
  } catch (err) {
    console.error('[mailer:brevo] network failure:', err.message);
    return { delivered: false, adapter: current, reason: 'network' };
  }
}

async function sendOtp({ to, code, minutes }) {
  const { subject, html, text } = otpEmail({ code, minutes });
  return deliver({ to, subject, html, text });
}

async function sendResetConfirmation({ to, name }) {
  const { subject, html, text } = resetDoneEmail({ name });
  return deliver({ to, subject, html, text });
}

/** Used by the health/settings endpoints to describe the current adapter. */
function status() {
  return {
    adapter: mode(),
    configured: mode() === 'brevo',
    sender: sender().email,
  };
}

module.exports = { sendOtp, sendResetConfirmation, status, mode };
