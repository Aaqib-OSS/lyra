import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
}

/**
 * Keyboard behaviour every modal dialog needs: focus moves in when it opens, Tab stays inside it,
 * Esc closes it (without also leaving fullscreen), and focus returns to whatever opened it.
 * Give the dialog element role="dialog" aria-modal="true" and pass its ref here.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, opts: { escape?: boolean } = {}): void {
  const escape = opts.escape ?? true
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
    if (!root.contains(document.activeElement)) (focusables(root)[0] ?? root).focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && escape) {
        e.stopPropagation()
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables(root)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [ref, escape])
}
