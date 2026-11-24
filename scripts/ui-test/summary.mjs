// Markdown for the GitHub job summary (appended to $GITHUB_STEP_SUMMARY by ci.yml); safe to run anywhere.
//   node scripts/ui-test/summary.mjs ui        screens checked / failing / flaky, from ui-test-out/**/report.json
//   node scripts/ui-test/summary.mjs coverage  the Vitest coverage totals, from coverage/coverage-summary.json
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './lib.mjs'

const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])) : [])
const what = process.argv[2]

if (what === 'ui') {
  const reports = walk(join(root, 'ui-test-out')).filter((f) => f.endsWith('report.json') && !f.includes('electron'))
  if (!reports.length) process.exit(0)
  const rows = reports.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))
  const bad = rows.filter((r) => r.fails?.length)
  const flaky = rows.filter((r) => r.flaky)
  console.log(`### UI screens\n\n${rows.length} checked, ${bad.length} failing, ${flaky.length} flaky (failed once, passed on retry)\n`)
  for (const r of bad) console.log(`- FAIL \`${r.vibe}\` @ \`${r.device}\`: ${r.fails.join('; ')}`)
  for (const r of flaky) console.log(`- flaky \`${r.vibe}\` @ \`${r.device}\`: ${r.flaky.join('; ')}`)
} else if (what === 'coverage') {
  const f = join(root, 'coverage', 'coverage-summary.json')
  if (!existsSync(f)) process.exit(0)
  const t = JSON.parse(readFileSync(f, 'utf8')).total
  console.log('### Unit test coverage (informational, no threshold)\n\n| lines | statements | functions | branches |\n|---|---|---|---|')
  console.log(`| ${t.lines.pct}% | ${t.statements.pct}% | ${t.functions.pct}% | ${t.branches.pct}% |`)
} else {
  console.error('usage: summary.mjs ui|coverage')
  process.exit(2)
}
