// Pure helpers of scripts/release.mjs (no file or network access here, so they can be unit tested).

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** "0.10.1" -> { major, minor, patch, pre: [] }; null when it is not a full x.y.z version. */
export function parseSemver(v) {
  const m = SEMVER.exec(String(v).trim().replace(/^[a-z-]*v/i, ''))
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] }
}

/** Semver precedence: numbers compare as numbers (0.9.0 < 0.10.1), a pre-release is older than its release. */
export function compareSemver(a, b) {
  const x = typeof a === 'string' ? parseSemver(a) : a
  const y = typeof b === 'string' ? parseSemver(b) : b
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`)
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    const c = pn && qn ? Math.sign(+p - +q) : pn ? -1 : qn ? 1 : p < q ? -1 : p > q ? 1 : 0
    if (c) return c
  }
  return Math.sign(x.pre.length - y.pre.length)
}

/** Android versionCode: 0.12.1 -> 12001 (minor * 1000 + patch; a major above 0 adds major * 1,000,000). */
export function versionCodeFor(version) {
  const v = parseSemver(version)
  if (!v) throw new Error(`not a version: ${version}`)
  if (v.minor > 999 || v.patch > 999) throw new Error('minor and patch must stay below 1000 for the versionCode formula')
  return v.major * 1_000_000 + v.minor * 1000 + v.patch
}

/** The website card title drops a trailing ".0" patch ("0.27" is Windows 0.27.0), so compare in that form. */
export function cardTitleFor(version) {
  return String(version).replace(/^(\d+\.\d+)\.0$/, '$1')
}

/**
 * Finds the "what's new" card for a version in website/whats-new.html:
 * `<article class="rel rv" id="v0-27-1"><div><h3>0.27.1</h3><small>Windows 0.27.1 · Android 0.12.1</small></div><ul><li>...</li></ul></article>`
 */
export function findNotesCard(html, version) {
  const title = cardTitleFor(version)
  const re = /<article[^>]*class="[^"]*\brel\b[^"]*"[^>]*>([\s\S]*?)<\/article>/g
  for (const m of html.matchAll(re)) {
    const h3 = /<h3>([^<]*)<\/h3>/.exec(m[1])
    if (!h3 || h3[1].trim() !== title) continue
    const small = /<small>([^<]*)<\/small>/.exec(m[1])
    const platforms = decodeEntities(small ? small[1] : '')
    const bullets = [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((b) => htmlToText(b[1]))
    return { title, platforms, bullets }
  }
  return null
}

/** Does the card's platform line mention this Android version ("Android 0.12.1" or "Android 0.12" for 0.12.0)? */
export function cardMentionsAndroid(card, androidVersion) {
  return new RegExp(`Android ${escapeRe(cardTitleFor(androidVersion))}(?![\\d.]*\\d)`).test(card.platforms)
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function decodeEntities(s) {
  return s
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, ' - ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function htmlToText(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

/** Markdown body for a GitHub release, from the notes card. */
export function notesMarkdown(card, { platform = 'windows', version, repo } = {}) {
  const lines = card.bullets.map((b) => `- ${b}`)
  const tail = repo ? `\n\nAll changes: https://github.com/${repo}/commits/${platform === 'android' ? 'android-v' : 'v'}${version}` : ''
  return `${lines.join('\n')}${tail}\n`
}

// ---- file edits (text in, text out) --------------------------------------------------------------------------------

export function bumpPackageJson(text, next) {
  if (!/^\s*"version": "[^"]+"/m.test(text)) throw new Error('package.json has no version field')
  return text.replace(/^(\s*)"version": "[^"]+"/m, `$1"version": "${next}"`)
}

/** package-lock.json carries the version twice: at the top and under packages[""]. */
export function bumpPackageLock(text, next) {
  const lock = JSON.parse(text)
  lock.version = next
  if (lock.packages && lock.packages['']) lock.packages[''].version = next
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  return JSON.stringify(lock, null, 2).replace(/\n/g, nl) + (text.endsWith('\n') ? nl : '')
}

export function bumpVersionProperties(text, name) {
  const code = versionCodeFor(name)
  return text.replace(/^versionName=.*$/m, `versionName=${name}`).replace(/^versionCode=.*$/m, `versionCode=${code}`)
}

/** F-Droid recipe: the (last) Builds entry and CurrentVersion / CurrentVersionCode follow the Android version. */
export function bumpFdroid(text, name) {
  const code = versionCodeFor(name)
  return text
    .replace(/^(\s*- versionName: ).*$/m, '$1' + name)
    .replace(/^(\s*versionCode: ).*$/m, '$1' + code)
    .replace(/^(\s*commit: ).*$/m, '$1android-v' + name)
    .replace(/^CurrentVersion: .*$/m, 'CurrentVersion: ' + name)
    .replace(/^CurrentVersionCode: .*$/m, 'CurrentVersionCode: ' + code)
}

export function readProperties(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_.]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2]
  }
  return out
}

// ---- consistency check ---------------------------------------------------------------------------------------------

/**
 * Everything that must agree before a release. Returns { errors, warnings }.
 * input: { packageJson, packageLock, properties (text), whatsNewHtml, hasChangelog(code) -> bool, fdroidText?, tag?, androidTag? }
 */
export function checkRelease(input) {
  const errors = []
  const warnings = []
  const pkg = JSON.parse(input.packageJson)
  const lock = JSON.parse(input.packageLock)
  const v = pkg.version
  if (!parseSemver(v)) errors.push(`package.json version "${v}" is not x.y.z`)
  if (lock.version !== v) errors.push(`package-lock.json version ${lock.version} differs from package.json ${v}`)
  if (lock.packages?.['']?.version !== v) errors.push(`package-lock.json packages[""] version ${lock.packages?.['']?.version} differs from package.json ${v}`)
  if (input.tag && input.tag !== `v${v}`) errors.push(`tag ${input.tag} does not match package.json version v${v}`)

  const card = findNotesCard(input.whatsNewHtml, v)
  if (!card) errors.push(`website/whats-new.html has no card titled "${cardTitleFor(v)}" (the release notes for Windows ${v})`)
  else if (!card.bullets.length) errors.push(`the whats-new card ${card.title} has no bullet points`)
  else if (!new RegExp(`Windows ${escapeRe(cardTitleFor(v))}(?![\\d.]*\\d)`).test(card.platforms)) {
    warnings.push(`the whats-new card ${card.title} does not say "Windows ${cardTitleFor(v)}" in its platform line`)
  }

  const props = readProperties(input.properties)
  const av = props.versionName
  if (!parseSemver(av)) errors.push(`android version.properties versionName "${av}" is not x.y.z`)
  else {
    const code = versionCodeFor(av)
    if (Number(props.versionCode) !== code) errors.push(`versionCode ${props.versionCode} does not match versionName ${av} (expected ${code})`)
    if (input.androidTag && input.androidTag !== `android-v${av}`) errors.push(`tag ${input.androidTag} does not match versionName android-v${av}`)
    if (!input.hasChangelog(code)) errors.push(`missing fastlane changelog fastlane/metadata/android/en-US/changelogs/${code}.txt`)
    else if (input.changelogLength?.(code) > 500) errors.push(`fastlane changelog ${code}.txt is over 500 characters (the store limit)`)
    if (input.fdroidText) {
      const t = input.fdroidText
      const code = String(versionCodeFor(av))
      const got = {
        CurrentVersion: /^CurrentVersion:\s*(\S+)/m.exec(t)?.[1],
        CurrentVersionCode: /^CurrentVersionCode:\s*(\S+)/m.exec(t)?.[1],
        'Builds versionName': /^\s*- versionName:\s*(\S+)/m.exec(t)?.[1],
        'Builds versionCode': /^\s*versionCode:\s*(\S+)/m.exec(t)?.[1],
        'Builds commit': /^\s*commit:\s*(\S+)/m.exec(t)?.[1]
      }
      const want = { 'CurrentVersion': av, 'CurrentVersionCode': code, 'Builds versionName': av, 'Builds versionCode': code, 'Builds commit': 'android-v' + av }
      for (const k of Object.keys(want)) if (got[k] !== want[k]) errors.push('fdroid/dev.lyra.android.yml ' + k + ' is ' + got[k] + ', expected ' + want[k] + ' (node scripts/release.mjs prepare --android updates it)')
    }
  }
  return { errors, warnings }
}

// ---- changelog from commits ----------------------------------------------------------------------------------------

const TYPE_ORDER = [
  ['feat', 'New'],
  ['fix', 'Fixed'],
  ['perf', 'Faster'],
  ['refactor', 'Under the hood'],
  ['docs', 'Docs'],
  ['chore', 'Maintenance']
]

/** Turns `git log --pretty=%s` subjects into a Markdown draft grouped by conventional-commit type (draft for the human notes). */
export function changelogFromSubjects(subjects) {
  const groups = new Map()
  for (const s of subjects) {
    const m = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/.exec(s.trim())
    if (!m) continue
    if (/^(chore\(release\)|Merge )/.test(s)) continue
    const type = TYPE_ORDER.some(([t]) => t === m[1]) ? m[1] : 'chore'
    if (!groups.has(type)) groups.set(type, [])
    groups.get(type).push(m[2] ? `**${m[2]}:** ${m[3]}` : m[3])
  }
  const out = []
  for (const [t, title] of TYPE_ORDER) {
    const items = groups.get(t)
    if (items) out.push(`### ${title}`, ...items.map((i) => `- ${i}`), '')
  }
  return out.join('\n').trim() + '\n'
}

// ---- post-release verification -------------------------------------------------------------------------------------

/** Minimal reader for electron-builder's latest.yml (version, path, sha512, files[]). */
export function parseLatestYml(text) {
  const out = { files: [] }
  let cur = null
  for (const raw of text.split(/\r?\n/)) {
    const top = /^(\w+):\s*(.*)$/.exec(raw)
    if (top) {
      cur = null
      if (top[1] !== 'files') out[top[1]] = top[2].replace(/^['"]|['"]$/g, '')
      continue
    }
    const item = /^\s+-\s+url:\s*(.+)$/.exec(raw)
    if (item) {
      cur = { url: item[1].trim().replace(/^['"]|['"]$/g, '') }
      out.files.push(cur)
      continue
    }
    const kv = /^\s+(\w+):\s*(.+)$/.exec(raw)
    if (kv && cur) cur[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

/**
 * release: GitHub API release object ({ tag_name, prerelease, draft, assets: [{ name, size, digest }] }).
 * latest: the parsed latest.yml. Returns a list of problems (empty = good).
 */
export function verifyWindowsRelease(release, latest, version) {
  const p = []
  const names = new Set(release.assets.map((a) => a.name))
  const exe = `Lyra-Setup-${version}.exe`
  if (release.draft) p.push('release is still a draft')
  if (release.prerelease && !parseSemver(version)?.pre.length) p.push('release is marked pre-release but the version has no pre-release part')
  for (const n of [exe, `${exe}.blockmap`, 'latest.yml']) if (!names.has(n)) p.push(`asset missing: ${n}`)
  if (latest) {
    if (latest.version !== version) p.push(`latest.yml says version ${latest.version}, expected ${version}`)
    const f = latest.files.find((x) => x.url === exe)
    if (!f) p.push(`latest.yml has no file entry for ${exe}`)
    else {
      if (!f.sha512) p.push('latest.yml entry has no sha512')
      const asset = release.assets.find((a) => a.name === exe)
      if (asset && f.size && Number(f.size) !== asset.size) p.push(`latest.yml size ${f.size} differs from the uploaded ${exe} (${asset.size})`)
    }
    if (latest.path && latest.path !== exe) p.push(`latest.yml path ${latest.path} is not ${exe}`)
  }
  return p
}

export function verifyAndroidRelease(release, version, sha256FileText) {
  const p = []
  const apk = `Lyra-Android-${version}.apk`
  const names = new Set(release.assets.map((a) => a.name))
  if (release.draft) p.push('release is still a draft')
  if (!names.has(apk)) p.push(`asset missing: ${apk}`)
  if (!names.has(`${apk}.sha256`)) p.push(`asset missing: ${apk}.sha256`)
  if (release.prerelease && !parseSemver(version)?.pre.length) p.push('release is marked pre-release but the version has no pre-release part')
  const a = release.assets.find((x) => x.name === apk)
  if (a?.digest && sha256FileText) {
    const m = /\b([0-9a-fA-F]{64})\b/.exec(sha256FileText)
    const d = /^sha256:([0-9a-f]{64})$/i.exec(a.digest)
    if (!m) p.push('the .sha256 file holds no SHA-256')
    else if (d && d[1].toLowerCase() !== m[1].toLowerCase()) p.push('the .sha256 file does not match the uploaded APK (GitHub digest differs)')
  }
  return p
}
