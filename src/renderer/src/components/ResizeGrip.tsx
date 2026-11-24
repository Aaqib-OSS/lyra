import { useRef } from 'react'

/**
 * Bottom-right resize handle. The window is transparent (so the OS gives it no resize border);
 * movement is computed in the main process from the OS cursor position, like dragging.
 */
export function ResizeGrip() {
  const active = useRef(false)
  const raf = useRef(0)

  return (
    <div
      className="grip"
      data-nodrag
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize window. Use the arrow keys."
      title="Drag to resize (or focus and use the arrow keys)"
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10
        const d: Record<string, [number, number]> = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowUp: [0, -step] }
        const delta = d[e.key]
        if (!delta) return
        e.preventDefault()
        e.stopPropagation() // arrows seek / change volume elsewhere; here they resize
        window.lyra.window.resizeBy(delta[0], delta[1])
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        active.current = true
        window.lyra.window.resizeStart()
      }}
      onPointerMove={() => {
        if (!active.current || raf.current) return
        raf.current = requestAnimationFrame(() => {
          raf.current = 0
          window.lyra.window.resizeMove()
        })
      }}
      onPointerUp={(e) => {
        if (!active.current) return
        active.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        window.lyra.window.resizeEnd()
      }}
      onPointerCancel={() => {
        if (!active.current) return
        active.current = false
        window.lyra.window.resizeEnd()
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  )
}
