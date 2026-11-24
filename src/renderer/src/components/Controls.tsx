import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/i18n'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { Icon, type IconName } from './Icon'

interface BtnProps {
  icon: IconName
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  size?: number
  filled?: boolean
  className?: string
  title?: string
}

export function IconButton({ icon, label, onClick, active, disabled, size = 18, filled, className = '', title }: BtnProps) {
  const { t } = useTranslation()
  const name = t(label)
  return (
    <button
      type="button"
      className={`ibtn ${active ? 'is-active' : ''} ${className}`}
      aria-label={name}
      aria-pressed={active}
      title={title ? t(title) : name}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={size} filled={filled} />
    </button>
  )
}

/** True when the account can’t remote-control playback (e.g. Spotify Free). */
export function useControlsLocked(): { locked: boolean; reason: string | undefined } {
  const status = usePlayer((s) => s.status)
  const hasTrack = usePlayer((s) => !!s.snapshot?.track)
  if (!hasTrack) return { locked: true, reason: undefined }
  if (status?.controlsLimited) return { locked: true, reason: 'Playback control needs Spotify Premium' }
  return { locked: false, reason: undefined }
}

interface TransportProps {
  size?: 'sm' | 'md' | 'lg'
  extras?: boolean
}

/** What the active music source can do. Windows media controls expose no queue / shuffle / repeat. */
export function useCaps(): { queue: boolean; shuffleRepeat: boolean } {
  const local = usePlayer((s) => s.status?.state === 'local')
  return { queue: !local, shuffleRepeat: !local }
}

export function Transport({ size = 'md', extras: wantExtras = false }: TransportProps) {
  const { t } = useTranslation()
  const caps = useCaps()
  const extras = wantExtras && caps.shuffleRepeat
  const playing = usePlayer((s) => !!s.snapshot?.isPlaying)
  const shuffle = usePlayer((s) => !!s.snapshot?.shuffle)
  const repeat = usePlayer((s) => s.snapshot?.repeat ?? 'off')
  const toggle = usePlayer((s) => s.toggle)
  const command = usePlayer((s) => s.command)
  const { locked, reason } = useControlsLocked()
  const px = size === 'sm' ? 16 : size === 'md' ? 20 : 24
  const main = size === 'sm' ? 30 : size === 'md' ? 44 : 60

  return (
    <div className={`transport transport--${size}`} role="group" aria-label={t('Playback controls')} title={reason && t(reason)}>
      {extras && (
        <IconButton icon="shuffle" label="Shuffle" active={shuffle} disabled={locked} size={px - 2} onClick={() => void command({ type: 'shuffle', on: !shuffle })} />
      )}
      <IconButton icon="prev" label="Previous" disabled={locked} size={px} onClick={() => void command({ type: 'previous' })} />
      <button
        type="button"
        className="playbtn"
        style={{ width: main, height: main }}
        aria-label={playing ? t('Pause') : t('Play')}
        title={reason ? t(reason) : playing ? t('Pause') : t('Play')}
        disabled={locked}
        onClick={toggle}
      >
        <Icon name={playing ? 'pause' : 'play'} size={Math.round(main * 0.46)} />
      </button>
      <IconButton icon="next" label="Next" disabled={locked} size={px} onClick={() => void command({ type: 'next' })} />
      {extras && (
        <IconButton
          icon={repeat === 'track' ? 'repeatOne' : 'repeat'}
          label={t('Repeat: {mode}', { mode: t(repeat === 'off' ? 'off' : repeat === 'track' ? 'this song' : 'all') })}
          active={repeat !== 'off'}
          disabled={locked}
          size={px - 2}
          onClick={() => void command({ type: 'repeat', mode: repeat === 'off' ? 'context' : repeat === 'context' ? 'track' : 'off' })}
        />
      )}
    </div>
  )
}

export function VolumeControl({ wide = false }: { wide?: boolean }) {
  const { t } = useTranslation()
  const isLocal = usePlayer((s) => s.status?.state === 'local')
  const volumeOn = useSettings((s) => s.settings.systemVolume)
  const hidden = isLocal && !volumeOn
  const device = usePlayer((s) => s.snapshot?.device ?? null)
  const setVolume = usePlayer((s) => s.setVolume)
  const remote = device?.volumePercent ?? 0
  const [local, setLocal] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // the level to come back to on unmute: remembered across restarts, never 0
  const prev = useRef(Number(localStorage.getItem('lyra.volume.before-mute')) || 50)
  useEffect(() => () => clearTimeout(timer.current), [])

  const value = local ?? remote
  const supported = !!device?.supportsVolume
  const commit = (v: number): void => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setVolume(v)
      setLocal(null)
    }, 120)
  }
  if (hidden) return null
  const icon: IconName = value === 0 ? 'volumeMute' : value < 45 ? 'volumeLow' : 'volume'

  return (
    <div
      className={`volume ${wide ? 'volume--wide' : ''}`}
      data-nodrag
      // scroll over the volume to change it: 5 % a notch, kept inside 0..100
      onWheel={(e) => {
        if (!supported) return
        const next = Math.min(100, Math.max(0, value + (e.deltaY < 0 ? 5 : -5)))
        if (next === value) return
        setLocal(next)
        commit(next)
      }}
      title={supported ? undefined : device ? t('{name} doesn’t support volume control from here', { name: device.name }) : t('No active device')}
    >
      <button
        type="button"
        className="ibtn"
        aria-label={value === 0 ? t('Unmute') : t('Mute')}
        disabled={!supported}
        onClick={() => {
          if (value > 0) {
            prev.current = value
            try {
              localStorage.setItem('lyra.volume.before-mute', String(value))
            } catch {
              /* storage can be unavailable */
            }
          }
          const v = value > 0 ? 0 : prev.current || 50
          setLocal(v)
          commit(v)
        }}
      >
        <Icon name={icon} size={16} />
      </button>
      <input
        className="range"
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={!supported}
        aria-label={t('Volume')}
        aria-valuetext={`${value}%`}
        style={{ ['--fill' as string]: `${value}%` }}
        onChange={(e) => {
          const v = Number(e.target.value)
          setLocal(v)
          commit(v)
        }}
      />
    </div>
  )
}
