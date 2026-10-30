const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

if (allowedOrigins.has(location.origin)) {
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return
    const data = event.data
    if (data?.type !== 'dragons-dungeon:roll20' || typeof data.requestId !== 'string' || data.requestId.length > 100) return
    if (typeof data.command !== 'string' || !/^\/roll 1d20(?:[+-]\d+(?:\.\d+)?)?$/.test(data.command)) return
    let result
    try { result = await chrome.runtime.sendMessage({ type: 'dragons-dungeon:roll20', requestId: data.requestId, command: data.command }) }
    catch { result = { sent: 0, reason: 'Roll20 bridge disconnected; reload this page.' } }
    window.postMessage({ type: 'dragons-dungeon:roll20-result', requestId: data.requestId, ...result }, location.origin)
  })
}