const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const SENDPULSE_TOKEN_URL = 'https://api.sendpulse.com/oauth/access_token';
const SENDPULSE_EMAIL_URL = 'https://api.sendpulse.com/smtp/emails';
const TOKEN_TTL_BUFFER_MS = 60 * 1000;
const BRAND = {
  navy: '#2D1157',
  blue: '#3A1A6A',
  accent: '#FBBF24',
  accentHover: '#D97706',
  light: '#F1F1F1',
  surface: '#FFFFFF',
  text: '#1F2937',
  muted: '#6B7280'
};

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const getRequiredEnv = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`SendPulse is not configured. Set ${name}.`);
  }

  return value;
};

const getSender = () => {
  const fromEmail = process.env.SENDPULSE_FROM_EMAIL;
  const fromName = process.env.SENDPULSE_FROM_NAME || 'E-del';

  if (!fromEmail) {
    throw new Error('SendPulse sender is not configured. Set SENDPULSE_FROM_EMAIL.');
  }

  return {
    email: fromEmail,
    name: fromName
  };
};

const getAccessToken = async () => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node.js 18+ or add a fetch polyfill.');
  }

  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const clientId = getRequiredEnv('SENDPULSE_API_ID');
  const clientSecret = getRequiredEnv('SENDPULSE_API_SECRET');

  const response = await fetch(SENDPULSE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const description =
      payload?.error_description ||
      payload?.message ||
      `HTTP ${response.status}`;
    throw new Error(`SendPulse token request failed: ${description}`);
  }

  if (!payload?.access_token) {
    throw new Error('SendPulse token response did not include an access token.');
  }

  const expiresInSeconds = Number(payload.expires_in || 3600);
  cachedToken = payload.access_token;
  cachedTokenExpiresAt = Date.now() + expiresInSeconds * 1000 - TOKEN_TTL_BUFFER_MS;

  return cachedToken;
};

const sendSendpulseEmail = async ({ to, subject, text, html }) => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node.js 18+ or add a fetch polyfill.');
  }

  const token = await getAccessToken();
  const sender = getSender();

  const response = await fetch(SENDPULSE_EMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: {
        subject,
        text,
        html: Buffer.from(html, 'utf8').toString('base64'),
        from: sender,
        to: [
          {
            email: to
          }
        ],
        auto_plain_text: false
      }
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const description =
      payload?.error_description ||
      payload?.message ||
      payload?.error ||
      `HTTP ${response.status}`;
    throw new Error(`SendPulse email request failed: ${description}`);
  }

  return payload;
};

const buildEmailShell = ({
  preheader,
  headline,
  body,
  ctaLabel,
  ctaUrl,
  footerNote
}) => {
  const safePreheader = escapeHtml(preheader || '');
  const safeHeadline = escapeHtml(headline || '');
  const safeBody = Array.isArray(body)
    ? body.map((paragraph) => `<p style="margin:0 0 16px;">${escapeHtml(paragraph)}</p>`).join('')
    : '';
  const safeCtaLabel = escapeHtml(ctaLabel || '');
  const safeCtaUrl = escapeHtml(ctaUrl || '#');
  const safeFooterNote = escapeHtml(footerNote || '');

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${safeHeadline}</title>
    </head>
    <body style="margin:0;padding:0;background:${BRAND.light};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${safePreheader}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.light};margin:0;padding:0;width:100%;">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;width:100%;background:${BRAND.surface};border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:24px;box-shadow:0 18px 60px rgba(45,17,87,0.12);">
              <tr>
                <td style="background:linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.blue} 100%);padding:28px 32px 22px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="color:${BRAND.accent};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;padding-bottom:18px;">
                        E-del
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#ffffff;font-size:30px;line-height:1.15;font-weight:800;padding-bottom:12px;">
                        ${safeHeadline}
                      </td>
                    </tr>
                    <tr>
                      <td style="color:rgba(255,255,255,0.88);font-size:16px;line-height:1.65;">
                        ${safePreheader}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <div style="font-size:16px;line-height:1.75;color:${BRAND.text};">
                    ${safeBody}
                  </div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;">
                    <tr>
                      <td>
                        <a href="${safeCtaUrl}" style="display:inline-block;background:${BRAND.accent};color:${BRAND.navy};text-decoration:none;font-size:15px;font-weight:800;line-height:1;padding:16px 24px;border-radius:999px;border:1px solid ${BRAND.accent};">
                          ${safeCtaLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <div style="background:${BRAND.light};border-left:4px solid ${BRAND.accent};padding:16px 18px;border-radius:14px;color:${BRAND.muted};font-size:14px;line-height:1.7;">
                    If the button does not work, copy and paste this link into your browser:
                    <br />
                    <a href="${safeCtaUrl}" style="color:${BRAND.blue};word-break:break-all;">${safeCtaUrl}</a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 32px;">
                  <div style="border-top:1px solid #E5E7EB;padding-top:18px;color:${BRAND.muted};font-size:12px;line-height:1.7;">
                    ${safeFooterNote}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};

const buildCustomEmailHtml = ({ subject, message }) => {
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const body = lines.length
    ? lines
    : ['There is a new message from the E-del team.'];

  return buildEmailShell({
    preheader: subject,
    headline: subject,
    body,
    ctaLabel: 'Visit E-del',
    ctaUrl: process.env.PUBLIC_WEB_BASE_URL || 'http://localhost:5500',
    footerNote: 'This is an automated message sent from the E-del admin dashboard.'
  });
};

const sendPasswordResetEmail = async ({ to, fullName, resetUrl }) => {
  if (!to) {
    throw new Error('Recipient email is required.');
  }

  if (!resetUrl) {
    throw new Error('Reset URL is required.');
  }

  const displayName = fullName || 'there';
  const subject = 'Reset your E-del password';
  const text = [
    `Hello ${displayName},`,
    '',
    'We received a request to reset your E-del password.',
    `Use this link to create a new password: ${resetUrl}`,
    '',
    'This link expires in 30 minutes.',
    'If you did not request this reset, you can ignore this email.'
  ].join('\n');

  const html = buildEmailShell({
    preheader: 'Password reset requested for your E-del account.',
    headline: `Reset your password, ${displayName}`,
    body: [
      `Hello ${displayName},`,
      'We received a request to reset your E-del password.',
      'Use the button below to create a new password. For security, the link expires in 30 minutes.',
      'If you did not request this reset, you can safely ignore this email.'
    ],
    ctaLabel: 'Reset Password',
    ctaUrl: resetUrl,
    footerNote: 'This message was sent automatically by E-del. Please do not reply to this inbox.'
  });

  return sendSendpulseEmail({
    to,
    subject,
    text,
    html
  });
};

const sendEmailVerificationEmail = async ({ to, fullName, verifyUrl }) => {
  if (!to) {
    throw new Error('Recipient email is required.');
  }

  if (!verifyUrl) {
    throw new Error('Verification URL is required.');
  }

  const displayName = fullName || 'there';
  const subject = 'Verify your E-del email';
  const text = [
    `Hello ${displayName},`,
    '',
    'Welcome to E-del. Please verify your email address to activate your account.',
    `Use this link to verify your email: ${verifyUrl}`,
    '',
    'If you did not create this account, you can ignore this email.'
  ]
    .filter(Boolean)
    .join('\n');

  const body = [
    `Hello ${displayName},`,
    'Welcome to E-del. Please verify your email address to activate your account.',
    'Use the button below to finish setting up your account.',
    'If the link does not open correctly, you can request a new verification email from the sign-in page.',
    'If you did not create this account, you can safely ignore this email.'
  ];

  const html = buildEmailShell({
    preheader: 'Verify your E-del email address to activate your account.',
    headline: 'Verify your email',
    body,
    ctaLabel: 'Verify Email',
    ctaUrl: verifyUrl,
    footerNote: 'This message was sent automatically by E-del. Please do not reply to this inbox.'
  });

  return sendSendpulseEmail({
    to,
    subject,
    text,
    html
  });
};

const sendCustomAdminEmail = async ({ to, subject, message }) => {
  if (!to) {
    throw new Error('Recipient email is required.');
  }

  if (!subject || !String(subject).trim()) {
    throw new Error('Email subject is required.');
  }

  if (!message || !String(message).trim()) {
    throw new Error('Email message is required.');
  }

  const normalizedSubject = String(subject).trim();
  const normalizedMessage = String(message).trim();
  const text = normalizedMessage;
  const html = buildCustomEmailHtml({
    subject: normalizedSubject,
    message: normalizedMessage
  });

  return sendSendpulseEmail({
    to,
    subject: normalizedSubject,
    text,
    html
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendCustomAdminEmail,
  sendSendpulseEmail
};
