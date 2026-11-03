// Outbound email for registration links and email-change codes.
//
// With RESEND_API_KEY set, messages go through Resend's HTTP API (no SDK needed). Without it the mailer is disabled:
// nothing is sent, the message is logged, and callers may show the link or code directly so local development and
// tests still work end to end.

const fail = (status, message) => Object.assign(new Error(message), { status })

export function createMailer({ env = process.env, fetchImpl = globalThis.fetch, log = console } = {}) {
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.MAIL_FROM?.trim() || "Dragon's Dungeon <onboarding@resend.dev>"
  if (!apiKey) {
    return {
      enabled: false,
      from,
      async send(message) {
        log.info?.(`[mail disabled] To: ${message.to} · ${message.subject}\n${message.text}`)
        return { delivered: false }
      },
    }
  }
  return {
    enabled: true,
    from,
    async send({ to, subject, text, html }) {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw fail(502, `Email could not be sent (${response.status}). ${body.slice(0, 200)}`.trim())
      }
      return { delivered: true }
    },
  }
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

export function registrationEmail({ username, role = 'player', link, appName = "Dragon's Dungeon", artworkUrl }) {
  const roleName = role === 'dm' ? 'Dungeon Master' : 'player'
  const text = [
    `${appName}`,
    '',
    `Hello ${username},`,
    '',
    `Someone used this email address to register a ${roleName} account at ${appName}, the character-sheet companion for the Essence system.`,
    'Open this link to confirm it was you and finish creating the account:',
    link,
    '',
    'The link works once and expires in 24 hours. Opening it signs you straight in.',
    '',
    `If you did not register with ${appName}, you can safely ignore this email. No account will be created and nothing else will be sent.`,
  ].join('\n')
  const safeLink = escapeHtml(link)
  const art = artworkUrl ? `<img src="${escapeHtml(artworkUrl)}" width="160" height="168" alt="${escapeHtml(appName)} dragon crest" style="display:block;margin:0 auto 16px;border:0;outline:none;max-width:160px;height:auto">` : ''
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#15131a;font-family:Georgia,'Times New Roman',serif;color:#efe6d6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15131a;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#231f2b;border:1px solid #4a3f5c;border-radius:12px;padding:32px 28px">
<tr><td align="center">${art}
<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#c9a85c">${escapeHtml(appName)}</p>
<h1 style="margin:0 0 20px;font-size:26px;font-weight:normal;color:#f6efe0">Finish creating your account</h1></td></tr>
<tr><td style="font-size:16px;line-height:1.55">
<p style="margin:0 0 14px">Hello ${escapeHtml(username)},</p>
<p style="margin:0 0 14px">Someone used this email address to register a <strong>${roleName}</strong> account at ${escapeHtml(appName)}, the character-sheet companion for the Essence system. Open the link below to confirm it was you and finish creating the account.</p>
<p style="margin:24px 0;text-align:center"><a href="${safeLink}" style="display:inline-block;padding:14px 28px;background:#c9a85c;color:#1b1620;text-decoration:none;font-weight:bold;border-radius:8px;font-size:16px">Create my account</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#b7ab97">If the button does not work, copy this link into your browser:<br><a href="${safeLink}" style="color:#e2c57a;word-break:break-all">${safeLink}</a></p>
<p style="margin:0 0 14px;font-size:14px;color:#d8cdb8">The link works once and expires in 24 hours. Opening it signs you straight in.</p>
<hr style="border:0;border-top:1px solid #4a3f5c;margin:22px 0">
<p style="margin:0;font-size:13px;color:#a79b88">If you did not register with ${escapeHtml(appName)}, you can safely ignore this email. No account will be created and nothing else will be sent.</p>
</td></tr></table></td></tr></table></body></html>`
  return { subject: `Finish creating your ${appName} account`, text, html }
}

export function emailChangeEmail({ username, code, appName = "Dragon's Dungeon" }) {
  return {
    subject: `${appName}: confirm your new email address`,
    text: `Hello ${username},\n\nEnter this code in ${appName} to confirm your new email address:\n\n${code}\n\nThe code expires in 15 minutes. If you did not request this change, ignore this email and your address stays as it is.`,
    html: `<p>Hello ${escapeHtml(username)},</p><p>Enter this code in ${escapeHtml(appName)} to confirm your new email address:</p><p style="font-size:1.6em;letter-spacing:0.2em"><strong>${escapeHtml(code)}</strong></p><p>The code expires in 15 minutes. If you did not request this change, ignore this email and your address stays as it is.</p>`,
  }
}
