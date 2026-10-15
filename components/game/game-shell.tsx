'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import Link from 'next/link'
import { audio } from '@/lib/game/audio'
import { GameController, type UiState } from '@/lib/game/controller'
import { formatTime } from '@/lib/game/math'
import { progress } from '@/lib/game/storage'
import { useGameRecord, useSettings } from '@/lib/game/use-progress'
import type { GameModule } from '@/lib/game/types'
import { GameCompleteOverlay, IntroOverlay, LevelCompleteOverlay, PauseOverlay } from './game-overlays'
import { LevelSelect } from './level-select'
import { TouchControls } from './touch-controls'

const CONTROL_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'KeyE',
  'KeyJ',
  'Enter',
])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable || tag === 'BUTTON' || tag === 'A'
}

export function GameShell({ module: mod }: { module: GameModule }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const controllerRef = useRef<GameController | null>(null)
  const settings = useSettings()
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const record = useGameRecord(mod.slug)

  const [ui, setUi] = useState<UiState>({
    status: 'intro',
    level: 1,
    levelCount: mod.levels,
    deaths: 0,
    levelDeaths: 0,
    totalDeaths: 0,
    elapsedMs: 0,
    bestMs: null,
    narrator: { text: '', id: 0 },
    flashId: 0,
    toast: null,
    reducedMotion: false,
  })
  const [showLevels, setShowLevels] = useState(false)
  const [narrator, setNarrator] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [touch, setTouch] = useState(false)
  const [shareLabel, setShareLabel] = useState('Share run')
  const [confirmReset, setConfirmReset] = useState(false)
  const statusRef = useRef(ui.status)
  statusRef.current = ui.status

  const hasProgress = record.unlocked > 1 || Object.keys(record.levels).length > 0
  const isCoarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches, [])

  // create controller + loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const controller = new GameController({ canvas, module: mod, onUi: setUi })
    controller.setSettings(settingsRef.current)
    controllerRef.current = controller
    controller.run()
    return () => {
      controller.destroy()
      controllerRef.current = null
    }
  }, [mod])

  // keep settings in sync
  useEffect(() => {
    controllerRef.current?.setSettings(settings)
    audio.configure(settings.muted, settings.volume)
  }, [settings])

  // keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const controller = controllerRef.current
      if (!controller) return
      if (e.code === 'Escape') {
        if (statusRef.current !== 'intro') {
          e.preventDefault()
          controller.togglePause()
        }
        setShowLevels(false)
        return
      }
      if (isTypingTarget(e.target)) return
      if (e.code === 'KeyM') {
        e.preventDefault()
        progress.setSettings({ muted: !settingsRef.current.muted })
        return
      }
      if (e.code === 'KeyR') {
        e.preventDefault()
        controller.restart()
        return
      }
      if (CONTROL_KEYS.has(e.code)) {
        if (controller.handleKey(e.code, true)) e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const controller = controllerRef.current
      if (!controller) return
      if (isTypingTarget(e.target)) return
      controller.handleKey(e.code, false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // narrator + toast lifecycle
  useEffect(() => {
    if (!ui.narrator.text) return
    setNarrator(ui.narrator.text)
    const t = window.setTimeout(() => setNarrator(''), 2800)
    return () => window.clearTimeout(t)
  }, [ui.narrator.id, ui.narrator.text])

  useEffect(() => {
    if (!ui.toast) return
    setToast(`Reward unlocked: ${ui.toast.name}`)
    const t = window.setTimeout(() => setToast(null), 3600)
    return () => window.clearTimeout(t)
  }, [ui.toast])

  useEffect(() => {
    setTouch(isCoarse)
  }, [isCoarse])

  const handleSettings = useCallback((patch: Partial<typeof settings>) => {
    progress.setSettings(patch)
    audio.resume()
  }, [])

  const start = useCallback(() => {
    audio.resume()
    controllerRef.current?.begin()
  }, [])

  const openLevels = useCallback(() => {
    controllerRef.current?.pause()
    setShowLevels(true)
  }, [])

  const selectLevel = useCallback((level: number) => {
    audio.resume()
    setShowLevels(false)
    controllerRef.current?.selectLevel(level)
  }, [])

  const resetGame = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    progress.resetGame(mod.slug)
    setConfirmReset(false)
    setShowLevels(false)
    controllerRef.current?.begin(1)
  }, [confirmReset, mod.slug])

  const share = useCallback(async () => {
    const text = progress.exportText()
    try {
      if (navigator.share) {
        await navigator.share({ title: 'X Games', text })
        setShareLabel('Shared!')
      } else {
        await navigator.clipboard.writeText(text)
        setShareLabel('Copied!')
      }
    } catch {
      setShareLabel('Copy failed')
    }
    window.setTimeout(() => setShareLabel('Share run'), 2200)
  }, [])

  const clearedLevels = Object.values(record.levels).filter((l) => l.completed).length
  const bestMs = Object.values(record.levels).reduce<number | null>((acc, l) => {
    if (l.bestMs == null) return acc
    return acc == null ? l.bestMs : Math.min(acc, l.bestMs)
  }, null)

  const playing = ui.status === 'playing' || ui.status === 'dying' || ui.status === 'paused'
  const showTouch = touch && (ui.status === 'playing' || ui.status === 'dying')

  return (
    <div className="game-shell" data-game={mod.slug}>
      <div className="game-toolbar">
        <div className="game-toolbar-left">
          <span className="game-stat">
            <span className="game-stat-label">Level</span>
            <span className="game-stat-value">
              {ui.level}/{mod.levels}
            </span>
          </span>
          <span className="game-stat">
            <span className="game-stat-label">Deaths</span>
            <span className="game-stat-value">{ui.levelDeaths}</span>
          </span>
          <span className="game-stat">
            <span className="game-stat-label">Time</span>
            <span className="game-stat-value">{formatTime(ui.elapsedMs)}</span>
          </span>
          {ui.bestMs != null && (
            <span className="game-stat game-stat-best">
              <span className="game-stat-label">Best</span>
              <span className="game-stat-value">{formatTime(ui.bestMs)}</span>
            </span>
          )}
        </div>
        <div className="game-toolbar-right">
          <button
            type="button"
            className="icon-btn"
            onClick={() => handleSettings({ muted: !settings.muted })}
            aria-label={settings.muted ? 'Unmute' : 'Mute'}
          >
            {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => controllerRef.current?.restart()}
            disabled={!playing}
            aria-label="Restart level"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => controllerRef.current?.togglePause()}
            disabled={ui.status !== 'playing' && ui.status !== 'paused'}
            aria-label={ui.status === 'paused' ? 'Resume' : 'Pause'}
          >
            <Pause size={18} />
          </button>
        </div>
      </div>

      <div className="game-stage">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          onPointerDown={(e) => {
            audio.resume()
            controllerRef.current?.setPointer(e.clientX, e.clientY, true)
          }}
          onPointerMove={(e) => controllerRef.current?.setPointer(e.clientX, e.clientY, e.buttons > 0)}
          onPointerUp={(e) => controllerRef.current?.setPointer(e.clientX, e.clientY, false)}
          onPointerLeave={(e) => controllerRef.current?.setPointer(e.clientX, e.clientY, false)}
        />

        {ui.flashId > 0 && <div key={ui.flashId} className="game-flash" aria-hidden="true" />}

        {narrator && (
          <div key={ui.narrator.id} className="narrator-bar" role="status" aria-live="polite">
            <span className="narrator-x">X</span>
            <span>{narrator}</span>
          </div>
        )}

        {toast && <div className="game-toast">{toast}</div>}

        <TouchControls onControl={(c, d) => controllerRef.current?.setTouch(c, d)} visible={showTouch} />

        {ui.status === 'intro' && (
          <IntroOverlay
            module={mod}
            settings={settings}
            onSettings={handleSettings}
            onStart={start}
            onLevels={openLevels}
            hasProgress={hasProgress}
          />
        )}

        {ui.status === 'paused' && !showLevels && (
          <PauseOverlay
            settings={settings}
            onSettings={handleSettings}
            onResume={() => controllerRef.current?.resume()}
            onRestart={() => controllerRef.current?.restart()}
            onLevels={openLevels}
          />
        )}

        {ui.status === 'level-complete' && (
          <LevelCompleteOverlay
            level={ui.level}
            levelCount={mod.levels}
            timeMs={ui.elapsedMs}
            deaths={ui.deaths}
            bestMs={ui.bestMs}
            noDeath={ui.deaths === 0}
            onNext={() => controllerRef.current?.nextLevel()}
            onReplay={() => controllerRef.current?.restart()}
            onLevels={openLevels}
          />
        )}

        {ui.status === 'game-complete' && (
          <GameCompleteOverlay
            title={mod.title}
            totalDeaths={record.totalDeaths}
            clearedLevels={clearedLevels}
            totalLevels={mod.levels}
            bestLabel={bestMs != null ? formatTime(bestMs) : '—'}
            onReplay={() => controllerRef.current?.begin(1)}
            onLevels={openLevels}
            onShare={share}
            shareLabel={shareLabel}
          />
        )}

        {showLevels && (
          <LevelSelect
            slug={mod.slug}
            levelCount={mod.levels}
            record={record}
            currentLevel={ui.level}
            onSelect={selectLevel}
            onClose={() => {
              setShowLevels(false)
              setConfirmReset(false)
            }}
            onReset={resetGame}
          />
        )}
      </div>

      <div className="game-footerbar">
        <Link href="/games" className="game-back">
          <ArrowLeft size={15} data-icon="inline-start" /> All games
        </Link>
        <div className="game-controls-hint">
          {mod.controls.map((c) => (
            <span key={c.label} className="hint-chip">
              <b>{c.keys}</b> {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
