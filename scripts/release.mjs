// One safe command for releases. It never pushes, tags or publishes; it prepares files and prints the exact commands.
//
//   node scripts/release.mjs prepare <windows-version> [--android <android-version>] [--skip-tests] [--dry-run]
//   node scripts/release.mjs check [--tag v0.28.0] [--android-tag android-v0.13.0]
//   node scripts/release.mjs notes [windows|android]          (Markdown release body from website/whats-new.html)
//   node scripts/release.mjs changelog [--from <tag>]         (draft notes from commit subjects)
//   node scripts/release.mjs verify <windows-version> [--android <v>] [--deep]   (after the workflows ran)
//
// See docs/DISTRIBUTION.md ("Releasing").
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bumpPackageJson, bumpPackageLock, bumpVersionProperties, changelogFromSubjects, checkRelease, compareSemver, findNotesCard,
  cardMentionsAndroid, notesMarkdown, parseLatestYml, parseSemver, readProperties, verifyAndroidRelease, verifyWindowsRelease, versionCodeFor
} from './lib/release.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = {
  pkg: join(root, 'package.json'),
  lock: join(root, 'package-lock.json'),
  props: join(root, 'android', 'app', 'version.properties'),
  notes: join(root, 'website', 'whats-new.html'),
  fdroid: join(root, 'fdroid', 'dev.lyra.android.yml'),
  changelogs: join(root, 'fastlane', 'metadata', 'android', 'en-US', 'changelogs')
}
const read = (f) => readFileSync(f, 'utf8')
const args = process.argv.slice(2)
const cmd = args[0]
const flag = (n) => args.includes(`--${n}`)
const opt = (n) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}
const die = (m) => {
  console.error(`release: ${m}`)
  process.exit(1)
}
const repo = (() => {
  const p = JSON.parse(read(P.pkg)).build?.publish?.[0]
  return p ? `${p.owner}/${p.repo}` : 'DhruvHarani1/lyra'
})()

function gatherCheck(extra = {}) {
  return checkRelease({
    packageJson: read(P.pkg),
    packageLock: read(P.lock),
    properties: read(P.props),
    whatsNewHtml: read(P.notes),
    hasChangelog: (code) => existsSync(join(P.changelogs, `${code}.txt`)),
    changelogLength: (code) => read(join(P.changelogs, `${code}.txt`)).trim().length,
    fdroidText: existsSync(P.fdroid) ? read(P.fdroid) : undefined,
    ...extra
  })
}

function report({ errors, warnings }) {
  for (const w of warnings) console.warn(`  warning: ${w}`)
  for (const e of errors) console.error(`  ERROR: ${e}`)
  return errors.length === 0
}

function run(label, command, cmdArgs) {
  console.log(`\n> ${label}`)
  const r = spawnSync(command, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) die(`${label} failed`)
}

function lastReleaseTag(prefix) {
  try {
    const tags = execFileSync('git', ['tag', '--list', `${prefix}*`, '--sort=-v:refname'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
    return tags.find((t) => parseSemver(t.slice(prefix.length)) && !t.slice(prefix.length).includes('-'))
  } catch {
    return undefined
  }
}

async function main() {
  if (cmd === 'check') {
    const ok = report(gatherCheck({ tag: opt('tag'), androidTag: opt('android-tag') }))
    if (!ok) die('the release metadata is not consistent')
    console.log('release metadata is consistent')
    return
  }

  if (cmd === 'notes') {
    const platform = args[1] === 'android' ? 'android' : 'windows'
    const version = platform === 'android' ? readProperties(read(P.props)).versionName : JSON.parse(read(P.pkg)).version
    if (platform === 'android') {
      // the Android body is the store changelog for this versionCode (card titles carry the Windows version)
      const f = join(P.changelogs, `${versionCodeFor(version)}.txt`)
      if (!existsSync(f)) die(`no fastlane changelog for Android ${version}`)
      process.stdout.write(`${read(f).trim()}\n\nAll changes: https://github.com/${repo}/commits/android-v${version}\n`)
      return
    }
    const card = findNotesCard(read(P.notes), version)
    if (!card) die(`no whats-new card for ${version}`)
    process.stdout.write(notesMarkdown(card, { platform, version, repo }))
    return
  }

  if (cmd === 'changelog') {
    const from = opt('from') ?? lastReleaseTag('v')
    const range = from ? [`${from}..HEAD`] : ['-n', '60']
    const out = execFileSync('git', ['log', '--pretty=%s', ...range], { cwd: root, encoding: 'utf8' })
    console.log(from ? `# Draft since ${from} (edit into website/whats-new.html, plain user-facing language)\n` : '# Draft (no tag found locally, last 60 commits)\n')
    process.stdout.write(changelogFromSubjects(out.split('\n').filter(Boolean)))
    return
  }

  if (cmd === 'prepare') {
    const next = args[1]
    if (!next || !parseSemver(next)) die('usage: release.mjs prepare <x.y.z> [--android <x.y.z>] [--skip-tests] [--dry-run]')
    const androidNext = opt('android')
    if (androidNext && !parseSemver(androidNext)) die(`--android "${androidNext}" is not x.y.z`)
    const cur = JSON.parse(read(P.pkg)).version
    const curAndroid = readProperties(read(P.props)).versionName
    if (compareSemver(next, cur) <= 0) die(`${next} is not higher than the current Windows version ${cur}`)
    if (androidNext && compareSemver(androidNext, curAndroid) <= 0) die(`${androidNext} is not higher than the current Android version ${curAndroid}`)
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
    if (dirty && !flag('dry-run')) die('the working tree has uncommitted changes; commit or stash them first')

    // 1. the notes must exist BEFORE anything is changed
    const missing = []
    const card = findNotesCard(read(P.notes), next)
    if (!card) missing.push(`website/whats-new.html needs an <article class="rel rv" id="v${next.replace(/\./g, '-')}"> card titled "${next.replace(/^(\d+\.\d+)\.0$/, '$1')}" (run: node scripts/release.mjs changelog)`)
    else if (androidNext && !cardMentionsAndroid(card, androidNext)) missing.push(`the whats-new card should say "Android ${androidNext.replace(/^(\d+\.\d+)\.0$/, '$1')}" in its <small> line`)
    if (androidNext && !existsSync(join(P.changelogs, `${versionCodeFor(androidNext)}.txt`))) {
      missing.push(`fastlane/metadata/android/en-US/changelogs/${versionCodeFor(androidNext)}.txt is missing (plain text, at most 500 characters)`)
    }
    if (missing.length) {
      console.error('Write the release notes first:')
      for (const m of missing) console.error(`  - ${m}`)
      process.exit(1)
    }

    if (flag('dry-run')) {
      console.log(`dry run: would bump Windows ${cur} -> ${next}${androidNext ? ` and Android ${curAndroid} -> ${androidNext} (versionCode ${versionCodeFor(androidNext)})` : ''}`)
    } else {
      writeFileSync(P.pkg, bumpPackageJson(read(P.pkg), next))
      writeFileSync(P.lock, bumpPackageLock(read(P.lock), next))
      if (androidNext) writeFileSync(P.props, bumpVersionProperties(read(P.props), androidNext))
      console.log(`bumped package.json and package-lock.json to ${next}${androidNext ? `, version.properties to ${androidNext}` : ''}`)
    }

    const ok = report(gatherCheck())
    if (!ok) die('the metadata check failed after the bump (nothing was committed)')

    if (!flag('skip-tests') && !flag('dry-run')) {
      run('typecheck', 'npm', ['run', 'typecheck'])
      run('unit tests', 'npm', ['test'])
    }

    console.log(`
Ready. Nothing was committed, pushed or published. Next, by hand:

  git checkout -b release/${next}
  git add package.json package-lock.json${androidNext ? ' android/app/version.properties' : ''} website fastlane
  git commit -m "chore(release): Windows ${next}${androidNext ? ` and Android ${androidNext}` : ''}"
  git push -u origin release/${next}
  gh pr create --fill --base main
  gh pr checks --watch            # wait for CI (check, ui, CodeQL) to be green
  gh pr merge --squash

Then publish from main (the workflows refuse unless CI is green for that exact commit):

  gh workflow run release.yml --ref main -f publish=true${androidNext ? `\n  gh workflow run android.yml --ref main -f publish=true` : ''}
  gh run watch

Then verify what was published:

  node scripts/release.mjs verify ${next}${androidNext ? ` --android ${androidNext}` : ''} --deep
`)
    return
  }

  if (cmd === 'verify') {
    const version = args[1] && !args[1].startsWith('--') ? args[1] : JSON.parse(read(P.pkg)).version
    const androidV = opt('android')
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'lyra-release-verify' }
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN}`
    const getJson = async (url) => {
      const r = await fetch(url, { headers })
      if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
      return r.json()
    }
    const getBuffer = async (url) => {
      if (!url.startsWith('https://')) throw new Error(`refusing a non-HTTPS URL: ${url}`)
      const r = await fetch(url, { headers: { 'user-agent': headers['user-agent'] }, redirect: 'follow' })
      if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    }
    const withRetry = async (fn) => {
      let last
      for (let i = 0; i < 4; i++) {
        try {
          return await fn()
        } catch (e) {
          last = e
          await new Promise((r) => setTimeout(r, 4000 * (i + 1)))
        }
      }
      throw last
    }
    const problems = []

    if (!flag('android-only')) {
      const rel = await withRetry(() => getJson(`https://api.github.com/repos/${repo}/releases/tags/v${version}`))
      const ly = rel.assets.find((a) => a.name === 'latest.yml')
      const latest = ly ? parseLatestYml((await getBuffer(ly.browser_download_url)).toString('utf8')) : null
      problems.push(...verifyWindowsRelease(rel, latest, version).map((m) => `Windows: ${m}`))
      if (flag('deep') && latest) {
        const exe = rel.assets.find((a) => a.name === `Lyra-Setup-${version}.exe`)
        const entry = latest.files.find((f) => f.url === `Lyra-Setup-${version}.exe`)
        if (exe && entry?.sha512) {
          console.log(`downloading ${exe.name} (${(exe.size / 1048576).toFixed(0)} MB) to check its sha512 ...`)
          const got = createHash('sha512').update(await getBuffer(exe.browser_download_url)).digest('base64')
          if (got !== entry.sha512) problems.push('Windows: the sha512 of the uploaded installer does not match latest.yml (the updater would reject it)')
        }
      }
      const latestRel = await getJson(`https://api.github.com/repos/${repo}/releases/latest`).catch(() => null)
      if (latestRel && !/^v/.test(latestRel.tag_name)) problems.push(`"latest" release is ${latestRel.tag_name}; the Windows updater needs it to be the v* release (publish Android with --latest=false)`)
    }

    if (androidV) {
      const arel = await withRetry(() => getJson(`https://api.github.com/repos/${repo}/releases/tags/android-v${androidV}`))
      const sha = arel.assets.find((a) => a.name === `Lyra-Android-${androidV}.apk.sha256`)
      const text = sha ? (await getBuffer(sha.browser_download_url)).toString('utf8') : null
      problems.push(...verifyAndroidRelease(arel, androidV, text).map((m) => `Android: ${m}`))
    }

    if (problems.length) {
      for (const m of problems) console.error(`  PROBLEM: ${m}`)
      die('the published release is not right')
    }
    console.log(`${flag('android-only') ? '' : 'v' + version}${androidV ? ` and android-v${androidV}` : ''}: assets present, latest.yml matches${flag('deep') ? ', installer sha512 matches' : ''}`)
    return
  }

  die('commands: prepare, check, notes, changelog, verify (see the top of scripts/release.mjs)')
}

main().catch((e) => die(e.message))
