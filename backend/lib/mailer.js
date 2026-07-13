const { Resend } = require('resend');
const { frontendUrl: baseUrl } = require('./urls');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendBoothConfirmation({ to, boothName, activationName, profileUrl }) {
  if (!resend) return;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="background:#0a0a0a;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:40px 20px">
    <tr><td>
      <p style="font-size:12px;letter-spacing:.15em;color:#555;margin-bottom:32px;text-transform:uppercase">⬡ Silver Glider Activations</p>
      <h1 style="font-size:26px;font-weight:700;margin-bottom:8px;color:#f0f0f0">You're in the running.</h1>
      <p style="color:#666;font-size:15px;margin-bottom:32px">${activationName} — Best Booth Award</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px;margin-bottom:28px">
        <tr><td style="padding:8px 0;border-bottom:1px solid #1a1a1a">
          <span style="color:#555;font-size:13px">Booth</span>
          <span style="float:right;font-size:13px;color:#f0f0f0;font-weight:600">${boothName}</span>
        </td></tr>
        <tr><td style="padding:8px 0">
          <span style="color:#555;font-size:13px">Status</span>
          <span style="float:right;font-size:13px;color:#1CC5BE;font-weight:600">Approved — live now</span>
        </td></tr>
      </table>

      <p style="color:#666;font-size:14px;margin-bottom:20px;line-height:1.6">Your booth QR code is ready. Print it and display it at your booth so festival attendees can scan and vote for you.</p>

      <a href="${profileUrl}" style="display:block;background:#1CC5BE;color:#0a0a0a;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin-bottom:32px">Print My QR Code</a>

      <p style="color:#333;font-size:12px;text-align:center;line-height:1.6">Top booth wins 2 concert tickets.<br>Silver Glider — music discovery by text.</p>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM || 'booths@silverglidertix.com',
    to,
    subject: `Your booth is live — ${activationName}`,
    html
  });
}

async function sendWelcomeEmail({ to }) {
  if (!resend) return;
  const url = baseUrl();
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">3 SF shows, every Friday. We do the digging.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">

    <!-- Hero photo with gradient fade into body -->
    <tr><td style="padding:0;line-height:0;font-size:0;background:#0a0a0a">
      <div style="position:relative;line-height:0;font-size:0">
        <img src="${url}/concert-bg.jpg" alt="" width="520" style="display:block;width:100%;max-width:520px;height:240px;object-fit:cover;object-position:center 30%">
        <div style="position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(transparent,#0a0a0a)"></div>
      </div>
    </td></tr>

    <!-- Logo -->
    <tr><td style="text-align:center;padding:0 32px 36px;background:#0a0a0a">
      <img src="${url}/logo.png" alt="Silver Glider" width="64" height="64" style="display:inline-block">
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:0 32px 52px;background:#0a0a0a">

      <!-- Kicker — brand promise first -->
      <p style="font-size:13px;font-weight:600;color:#1CC5BE;letter-spacing:.06em;text-transform:uppercase;margin:0 0 16px">We do the digging, you show up.</p>

      <!-- Headline -->
      <h1 style="font-size:34px;font-weight:800;margin:0 0 16px;color:#f0f0f0;letter-spacing:-.02em;line-height:1.1">Good taste confirmed.</h1>

      <!-- Body copy -->
      <p style="font-size:16px;color:#999;line-height:1.75;margin:0 0 40px">Every Friday, 3 SF shows worth going to. No noise, no fluff. Just the ones that are actually worth your time.</p>

      <!-- CTA box -->
      <div style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:22px 24px">
        <p style="font-size:11px;color:#444;margin:0 0 5px;text-transform:uppercase;letter-spacing:.1em">First drop</p>
        <p style="font-size:17px;color:#f0f0f0;margin:0;font-weight:700">3 shows. This Friday.</p>
      </div>

    </td></tr>

    <!-- Footer -->
    <tr><td style="background:#161616;border-top:1px solid #222;padding:28px 32px;text-align:center">
      <p style="font-size:12px;color:#777;line-height:1.8;margin:0 0 10px">You're receiving this because you signed up at a Silver Glider activation.<br>We'll never share your email or send you anything other than concert picks.</p>
      <p style="font-size:12px;margin:0 0 10px">
        <a href="${url}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#777;text-decoration:underline">Unsubscribe</a>
        <span style="color:#444;margin:0 8px">·</span>
        <a href="https://silverglidertickets.com" style="color:#777;text-decoration:none">silverglidertickets.com</a>
      </p>
      <p style="font-size:11px;color:#666;margin:0">Silver Glider · 490 Post St, Suite 500, San Francisco, CA 94102</p>
    </td></tr>

  </table>
</body>
</html>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM || 'activations@silverglidertix.com',
    to,
    subject: `Good taste confirmed.`,
    html
  });
}

async function sendAdminBoothNotification({ boothName, activationName, contactEmail, contactPhone, instagramHandle, profileUrl }) {
  if (!resend) return;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="background:#0a0a0a;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:40px 24px">
    <tr><td>
      <p style="font-size:12px;letter-spacing:.15em;color:#444;text-transform:uppercase;margin-bottom:24px">⬡ Silver Glider Activations</p>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 6px;color:#f0f0f0">New booth registered.</h1>
      <p style="font-size:14px;color:#555;margin:0 0 28px">${activationName}</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:20px">
        <tr><td style="padding:8px 0;border-bottom:1px solid #1a1a1a">
          <span style="color:#555;font-size:13px">Booth</span>
          <span style="float:right;font-size:13px;color:#f0f0f0;font-weight:600">${boothName}</span>
        </td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #1a1a1a">
          <span style="color:#555;font-size:13px">Email</span>
          <span style="float:right;font-size:13px;color:#f0f0f0">${contactEmail || '—'}</span>
        </td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #1a1a1a">
          <span style="color:#555;font-size:13px">Phone</span>
          <span style="float:right;font-size:13px;color:#f0f0f0">${contactPhone || '—'}</span>
        </td></tr>
        <tr><td style="padding:8px 0">
          <span style="color:#555;font-size:13px">Instagram</span>
          <span style="float:right;font-size:13px;color:#f0f0f0">${instagramHandle ? '@' + instagramHandle.replace(/^@/, '') : '—'}</span>
        </td></tr>
      </table>

      <a href="${profileUrl}" style="display:block;background:#1CC5BE;color:#0a0a0a;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-top:24px">View Booth Profile</a>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM || 'activations@silverglidertix.com',
    to: process.env.ACTIVATIONS_ADMIN_NOTIFY_EMAIL || 'rosewoodmarketin@gmail.com',
    subject: `New booth: ${boothName} — ${activationName}`,
    html
  });
}

module.exports = { sendBoothConfirmation, sendWelcomeEmail, sendAdminBoothNotification };
