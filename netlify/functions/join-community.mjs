const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SLACK_INVITE = 'https://join.slack.com/t/africanlp/shared_invite/zt-488w1yzj6-ui~rrekZQmavOujYh6x_~w';

export default async function handler(req) {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    return Response.json({ ok: false, error: 'Email service is not configured yet.' }, { status: 500 });
  }

  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Could not read request body.' }, { status: 400 });
  }

  const name = String(body.name || '').trim().slice(0, 200);
  const email = String(body.email || '').trim().toLowerCase();
  const reason = String(body.reason || '').trim().slice(0, 2000);

  if (!name) return Response.json({ ok: false, error: 'Please enter your name.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (!reason) return Response.json({ ok: false, error: 'Please tell us why you want to join.' }, { status: 400 });

  const from = process.env.BREVO_FROM_EMAIL || 'hello@afrispeech.org';
  const message = {
    sender: { email: from, name: 'AfriSpeech' },
    to: [{ email, name }],
    subject: 'Welcome to the Africa NLP community',
    htmlContent:
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Welcome! We are glad you want to join the Africa NLP community.</p>` +
      `<p>To finish joining, open the invite link below:</p>` +
      `<p><a href="${SLACK_INVITE}">Join the Africa NLP Slack workspace</a></p>` +
      `<p>Once you are in, please head to the <strong>#introductions</strong> channel and tell everyone a little about what you are working on in NLP.</p>` +
      `<p>We look forward to building with you.</p>` +
      `<p>— The AfriSpeech team</p>`,
  };

  let res;
  try {
    res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': key,
        'content-type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (e) {
    return Response.json({ ok: false, error: 'Could not reach the email service.' }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Brevo send failed', res.status, detail);
    return Response.json({ ok: false, error: 'Could not send the welcome email.' }, { status: 502 });
  }

  return Response.json({ ok: true, slackInvite: SLACK_INVITE });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}