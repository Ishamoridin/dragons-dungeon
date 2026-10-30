chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'dragons-dungeon:submit-roll') return
  if (typeof message.command !== 'string' || message.command.length > 100 || !/^\/roll 1d20(?:[+-]\d+(?:\.\d+)?)?$/.test(message.command)) return
  const input = document.querySelector('#textchat-input textarea')
  const button = document.querySelector('#textchat-input button')
  if (!(input instanceof HTMLTextAreaElement) || !button || button.disabled) {
    reply({ submitted: false, reason: 'Roll20 chat is not ready; paste the copied roll into chat.' })
    return
  }
  if (input.value.trim()) {
    reply({ submitted: false, reason: 'Roll20 has an unfinished chat message; the draft was kept.' })
    return
  }
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setValue.call(input, message.command)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  button.click()
  reply({ submitted: true })
})