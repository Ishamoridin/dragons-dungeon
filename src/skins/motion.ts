/* Exit animations for conditionally rendered overlays.
   Every modal, menu and popover in the app unmounts with `{open && <X/>}`, so there is no closing phase to
   style. This observer catches an overlay the moment React removes it, puts an inert clone back in its place
   with the `skin-closing` class, and drops the clone when its CSS animation ends. The per-skin close
   keyframes in App.css key off that class. */

const OVERLAYS = '.dm-modal-backdrop, .attribute-modal-backdrop, .settings-menu-panel, .tutorial-panel'
const FALLBACK_MS = 1200

export function installSkinMotion(): () => void {
  if (typeof MutationObserver === 'undefined' || typeof matchMedia === 'undefined') return () => {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const parent = record.target
      if (!(parent instanceof HTMLElement) || !parent.isConnected) continue
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement) || !node.matches(OVERLAYS) || node.classList.contains('skin-closing')) continue
        const ghost = node.cloneNode(true) as HTMLElement
        ghost.classList.add('skin-closing')
        ghost.setAttribute('aria-hidden', 'true')
        ghost.removeAttribute('role')
        ghost.style.pointerEvents = 'none'
        const anchor = record.nextSibling && record.nextSibling.parentNode === parent ? record.nextSibling : null
        parent.insertBefore(ghost, anchor)
        const done = () => ghost.remove()
        ghost.addEventListener('animationend', done, { once: true })
        window.setTimeout(done, FALLBACK_MS)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
