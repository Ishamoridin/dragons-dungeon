const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
const seen = new Set()

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'dragons-dungeon:roll20') return
  let origin
  try { origin = new URL(sender.url).origin } catch { return }
  if (!allowedOrigins.has(origin) || sender.frameId !== 0 || !sender.tab) return
  if (typeof message.command !== 'string' || message.command.length > 100 || !/^\/roll 1d20(?:[+-]\d+(?:\.\d+)?)?$/.test(message.command)) return
  if (typeof message.requestId !== 'string' || message.requestId.length > 100) return
  const key = `${sender.tab.id}:${message.requestId}`
  if (seen.has(key)) { reply({ sent: 0, reason: 'Duplicate roll ignored.' }); return }
  seen.add(key)
  if (seen.size > 256) seen.delete(seen.values().next().value)
  const send = async () => {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://app.roll20.net/editor*' })
      const results = await Promise.all(tabs.map(async (tab) => {
        try { return await chrome.tabs.sendMessage(tab.id, { type: 'dragons-dungeon:submit-roll', command: message.command }) }
        catch { return { submitted: false, reason: 'Refresh Roll20 to enable the bridge.' } }
      }))
      const sent = results.filter((result) => result?.submitted).length
      reply({ sent, reason: sent ? '' : results[0]?.reason ?? 'No open Roll20 editor tabs; paste the copied roll into chat.' })
    } catch { reply({ sent: 0, reason: 'Roll20 tabs could not be reached; paste the copied roll into chat.' }) }
  }
  void send()
  return true
})