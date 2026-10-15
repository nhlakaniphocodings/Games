'use client'

import { useCallback } from 'react'

type Control = 'left' | 'right' | 'jump' | 'action' | 'up' | 'down'

export function TouchControls({
  onControl,
  visible,
}: {
  onControl: (control: Control, down: boolean) => void
  visible: boolean
}) {
  const bind = useCallback(
    (control: Control) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        onControl(control, true)
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.preventDefault()
        onControl(control, false)
      },
      onPointerCancel: () => onControl(control, false),
      onPointerLeave: () => onControl(control, false),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [onControl],
  )

  if (!visible) return null

  return (
    <div className="touch-controls">
      <div className="touch-cluster touch-left">
        <button type="button" className="touch-btn" tabIndex={-1} {...bind('left')} aria-label="Move left">
          ◀
        </button>
        <button type="button" className="touch-btn" tabIndex={-1} {...bind('right')} aria-label="Move right">
          ▶
        </button>
      </div>
      <div className="touch-cluster touch-right">
        <button type="button" className="touch-btn touch-action" tabIndex={-1} {...bind('action')} aria-label="Special action">
          ✦
        </button>
        <button type="button" className="touch-btn touch-jump" tabIndex={-1} {...bind('jump')} aria-label="Jump">
          ▲
        </button>
      </div>
    </div>
  )
}
