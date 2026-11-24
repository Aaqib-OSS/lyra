import { useCallback, useEffect, useState } from 'react'
import type { AndroidSelfCheck, AndroidSelfCheckItem } from '@shared/ipc'
import { useUi } from '@/store/ui'

const MARK: Record<AndroidSelfCheckItem['level'], { glyph: string; word: string }> = {
  ok: { glyph: '✓', word: 'OK' },
  info: { glyph: 'i', word: 'Note' },
  warn: { glyph: '!', word: 'Check' },
  bad: { glyph: '✕', word: 'Fix' }
}

/**
 * Android only: "Why isn't it working?". Lists what Lyra needs (notification access, notifications, battery rules ...),
 * says which is wrong and opens the right Android screen. It re-checks when you come back from Android's settings.
 * Status is shown by a word and a symbol as well as colour.
 */
export function AndroidCheck({ compact = false }: { compact?: boolean }) {
  const toast = useUi((s) => s.toast)
  const [res, setRes] = useState<AndroidSelfCheck | null>(null)
  const [failed, setFailed] = useState(false)

  const run = useCallback(async (): Promise<void> => {
    try {
      setRes((await window.lyra.android?.selfCheck()) ?? null)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void run()
    const back = (): void => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('focus', back)
    }
  }, [run])

  const copy = async (): Promise<void> => {
    if (!res) return
    const ok = await window.lyra.app.copy(res.report).catch(() => false)
    toast(ok ? 'Copied. It has no songs, accounts or app list.' : 'Couldn’t copy.', ok ? undefined : 'error')
  }

  if (failed) return <p className="screen__sub">The check could not run. Update Lyra and try again.</p>
  if (!res) return <p className="screen__sub" aria-busy="true">Checking…</p>

  const shown = compact ? res.checks.filter((c) => c.level !== 'ok') : res.checks
  return (
    <div className="androidcheck" style={{ display: 'grid', gap: 10, textAlign: 'left' }}>
      <p role="status" style={{ margin: 0, fontWeight: 600 }}>
        {res.problems === 0 ? 'Everything Lyra needs is in place.' : res.problems === 1 ? '1 thing to look at' : `${res.problems} things to look at`}
      </p>
      {shown.map((c) => (
        <div key={c.id} style={{ display: 'grid', gap: 4, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span aria-hidden style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{MARK[c.level].glyph}</span>
            <strong>
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{MARK[c.level].word}: </span>
              {c.title}
            </strong>
          </div>
          <span style={{ color: 'var(--fg-2)', fontSize: 13, lineHeight: 1.4 }}>{c.detail}</span>
          {c.fix && (
            <div>
              <button type="button" className="pill" style={{ minHeight: 44 }} onClick={() => void window.lyra.android?.selfCheckFix(c.fix as string)}>
                {c.fixLabel ?? 'Open'}
              </button>
            </div>
          )}
        </div>
      ))}
      {res.oem && (
        <details>
          <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Keep Lyra alive on {res.oem.name}</summary>
          <p style={{ margin: '0 0 6px', color: 'var(--fg-2)', fontSize: 13 }}>
            Your phone’s maker closes background apps more than stock Android. The menu names change between versions, so look for the closest match.
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--fg-2)', fontSize: 13, lineHeight: 1.5 }}>
            {res.oem.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="pill" style={{ minHeight: 44 }} onClick={() => void run()}>
          Check again
        </button>
        <button type="button" className="pill" style={{ minHeight: 44 }} onClick={() => void copy()}>
          Copy report
        </button>
      </div>
    </div>
  )
}
