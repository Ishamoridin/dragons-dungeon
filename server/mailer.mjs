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

export function registrationEmail({ username, link, appName = "Dragon's Dungeon" }) {
  return {
    subject: `Finish creating your ${appName} account`,
    text: `Hello ${username},\n\nOpen this link to finish creating your ${appName} account:\n${link}\n\nThe link works once and expires in 24 hours. If you did not request an account, ignore this email.`,
    html: `<p>Hello ${escapeHtml(username)},</p><p>Open this link to finish creating your ${escapeHtml(appName)} account:</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>The link works once and expires in 24 hours. If you did not request an account, ignore this email.</p>`,
  }
}

export function emailChangeEmail({ username, code, appName = "Dragon's Dungeon" }) {
  return {
    subject: `${appName}: confirm your new email address`,
    text: `Hello ${username},\n\nEnter this code in ${appName} to confirm your new email address:\n\n${code}\n\nThe code expires in 15 minutes. If you did not request this change, ignore this email and your address stays as it is.`,
    html: `<p>Hello ${escapeHtml(username)},</p><p>Enter this code in ${escapeHtml(appName)} to confirm your new email address:</p><p style="font-size:1.6em;letter-spacing:0.2em"><strong>${escapeHtml(code)}</strong></p><p>The code expires in 15 minutes. If you did not request this change, ignore this email and your address stays as it is.</p>`,
  }
}
