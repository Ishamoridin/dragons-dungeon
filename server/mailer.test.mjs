import assert from 'node:assert/strict'
import test from 'node:test'
import { createMailer, emailChangeEmail, registrationEmail } from './mailer.mjs'

test('without a Resend key the mailer is disabled and only logs', async () => {
  const lines = []
  const mailer = createMailer({ env: {}, log: { info: (line) => lines.push(line) } })
  assert.equal(mailer.enabled, false)
  const result = await mailer.send({ to: 'someone@example.com', subject: 'Hi', text: 'Body' })
  assert.deepEqual(result, { delivered: false })
  assert.match(lines[0], /someone@example.com/)
})

test('with a Resend key messages are posted to the API and failures surface', async () => {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, init })
    return requests.length === 1 ? Response.json({ id: 'email_1' }) : new Response('{"message":"invalid from"}', { status: 422 })
  }
  const mailer = createMailer({ env: { RESEND_API_KEY: 're_test', MAIL_FROM: 'Dungeon <mail@example.com>' }, fetchImpl })
  assert.equal(mailer.enabled, true)
  assert.deepEqual(await mailer.send({ to: 'a@example.com', subject: 'S', text: 'T', html: '<p>T</p>' }), { delivered: true })
  assert.equal(requests[0].url, 'https://api.resend.com/emails')
  assert.equal(requests[0].init.headers.Authorization, 'Bearer re_test')
  assert.deepEqual(JSON.parse(requests[0].init.body), { from: 'Dungeon <mail@example.com>', to: ['a@example.com'], subject: 'S', text: 'T', html: '<p>T</p>' })
  await assert.rejects(mailer.send({ to: 'a@example.com', subject: 'S', text: 'T' }), /Email could not be sent \(422\)/)
})

test('message templates carry the link or code and escape HTML', () => {
  const registration = registrationEmail({ username: 'Lirril <3', link: 'https://example.com/?register=abc&x=1' })
  assert.match(registration.text, /https:\/\/example.com\/\?register=abc&x=1/)
  assert.match(registration.html, /Lirril &lt;3/)
  assert.match(registration.html, /register=abc&amp;x=1/)
  const change = emailChangeEmail({ username: 'Gym', code: '123456' })
  assert.match(change.text, /123456/)
  assert.match(change.subject, /confirm your new email/)
})
