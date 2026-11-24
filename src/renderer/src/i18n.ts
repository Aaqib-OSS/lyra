import { useEffect, useState } from 'react'
import { gu } from './locales/gu'
import { hi } from './locales/hi'

/**
 * UI translation. The key is the English sentence itself: t('Share a lyric card').
 *  - English needs no dictionary; a key missing from another language falls back to English.
 *  - Values: t('Cleared {n} saved lookups', { n: 3 }).
 *  - Plurals: tp('{n} line', '{n} lines', count) picks by the language's plural rule.
 *  - Numbers, dates and durations go through formatNumber / formatDate / formatDuration (Intl, per language).
 *  - `npm run check:i18n` lists keys a language lacks and user-visible strings still hard-coded in English.
 * Lyrics are never translated here; only the app's own words.
 */
export type Language = 'en' | 'hi' | 'gu'

export const LANGUAGES: { id: Language; name: string; english: string; dir: 'ltr' | 'rtl'; locale: string }[] = [
  { id: 'en', name: 'English', english: 'English', dir: 'ltr', locale: 'en' },
  { id: 'hi', name: 'हिन्दी', english: 'Hindi', dir: 'ltr', locale: 'hi-IN' },
  { id: 'gu', name: 'ગુજરાતી', english: 'Gujarati', dir: 'ltr', locale: 'gu-IN' }
]

const STORAGE_KEY = 'lyra.language'

const translations: Record<Language, Record<string, string>> = { en: {}, hi, gu }

function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && v in translations
}

function readLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
    const system = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase()
    return isLanguage(system) ? system : 'en'
  } catch {
    return 'en'
  }
}

let currentLanguage = readLanguage()
const listeners = new Set<() => void>()

/** Keep <html lang> and dir right so screen readers pick the voice and the layout mirrors for RTL languages. */
function applyDocument(): void {
  if (typeof document === 'undefined') return
  const info = LANGUAGES.find((l) => l.id === currentLanguage)!
  document.documentElement.lang = currentLanguage
  document.documentElement.dir = info.dir
}
applyDocument()

export function getLanguage(): Language {
  return currentLanguage
}

export function setLanguage(language: Language): void {
  currentLanguage = isLanguage(language) ? language : 'en'
  try {
    localStorage.setItem(STORAGE_KEY, currentLanguage)
  } catch {
    // The selection still applies for this session when storage is unavailable.
  }
  applyDocument()
  listeners.forEach((listener) => listener())
}

type Values = Record<string, string | number>

function fill(text: string, values?: Values): string {
  if (!values) return text
  return Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, typeof value === 'number' ? formatNumber(value) : value), text)
}

export function translate(key: string, values?: Values): string {
  return fill(translations[currentLanguage][key] ?? key, values)
}

/** Plural by the current language's rule. `n` is also available as {n}. */
export function translatePlural(one: string, other: string, n: number, values?: Values): string {
  const rule = new Intl.PluralRules(localeOf()).select(n)
  return translate(rule === 'one' ? one : other, { n, ...values })
}

function localeOf(): string {
  return LANGUAGES.find((l) => l.id === currentLanguage)?.locale ?? 'en'
}

export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(localeOf(), options).format(n)
  } catch {
    return String(n)
  }
}

export function formatDate(date: Date | number, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  try {
    return new Intl.DateTimeFormat(localeOf(), options).format(date)
  } catch {
    return new Date(date).toDateString()
  }
}

/** 3:07 for a song length; always Latin digits and a colon so it lines up with the progress bar. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function useTranslation(): {
  language: Language
  setLanguage: typeof setLanguage
  t: typeof translate
  tp: typeof translatePlural
  formatNumber: typeof formatNumber
  formatDate: typeof formatDate
} {
  const [language, setCurrentLanguage] = useState<Language>(currentLanguage)

  useEffect(() => {
    const update = (): void => setCurrentLanguage(currentLanguage)
    listeners.add(update)
    update() // the language may have changed between render and effect
    return () => {
      listeners.delete(update)
    }
  }, [])

  return { language, setLanguage, t: translate, tp: translatePlural, formatNumber, formatDate }
}
