// Pull request template check (the `pr-template` job of ci.yml): the description must keep the sections of
// .github/pull_request_template.md and say something under "What does this change?" and "How did you test it?".
// Unticked checklist boxes are only a warning (a box can honestly not apply); the author decides.
//   PR_BODY="$(cat description.md)" node scripts/check-pr.mjs
const body = (process.env.PR_BODY ?? '').replace(/\r\n/g, '\n')
const problems = []

/** Text of a "## Heading" section without HTML comments, or null when the heading is missing. */
const section = (title) => {
  const m = new RegExp(`^##\\s+${title}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im').exec(body)
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : null
}

for (const title of ['What does this change\\?', 'How did you test it\\?']) {
  const s = section(title)
  const name = title.replace(/\\/g, '')
  if (s === null) problems.push(`the section "${name}" is missing: keep the headings of the pull request template`)
  else if (s.length < 10) problems.push(`the section "${name}" is empty: say what changed / how you tested it (a sentence is enough)`)
}
if (!/^##\s+Checklist\s*$/im.test(body)) problems.push('the "Checklist" section is missing')
for (const m of body.matchAll(/^- \[ \] (.+)$/gm)) console.log(`::warning::checklist item not ticked: ${m[1]}`)

if (problems.length) {
  for (const p of problems) console.log(`::error::${p}`)
  process.exit(1)
}
console.log('pull request description follows the template')
