/**
 * Runs `npx @aadi49/preflight <pkg> <version> --from <old>` for every dependency
 * whose locked version changed between a base ref and the working tree.
 *
 * Usage: node scripts/ci/preflight-changed.mjs <base-ref>
 * Writes preflight-report.md (also appended to the job summary) and exits 1 only
 * if preflight reports a certain break.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"

const baseRef = process.argv[2] || "origin/main"

const readJson = (text) => JSON.parse(text)
const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

const pkg = readJson(readFileSync("package.json", "utf8"))
const direct = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])

const lockVersions = (lock) =>
  Object.fromEntries(
    Object.entries(lock.packages ?? {})
      .filter(([path]) => path.startsWith("node_modules/") && path.lastIndexOf("node_modules/") === 0)
      .map(([path, info]) => [path.slice("node_modules/".length), info.version])
  )

let before
try {
  before = lockVersions(readJson(git(["show", `${baseRef}:package-lock.json`])))
} catch {
  console.log("No base lockfile found — nothing to compare.")
  process.exit(0)
}
const after = lockVersions(readJson(readFileSync("package-lock.json", "utf8")))

// Only direct dependencies: those are the ones this repo's source imports.
const changed = [...direct].filter((name) => before[name] && after[name] && before[name] !== after[name])

const lines = ["## Dependency preflight", ""]
let failed = false

if (changed.length === 0) {
  lines.push("No direct dependency versions changed.")
}

for (const name of changed) {
  const from = before[name]
  const to = after[name]
  const run = spawnSync("npx", ["--yes", "@aadi49/preflight", name, to, "--from", from, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })

  let report
  try {
    report = JSON.parse(run.stdout)
  } catch {
    lines.push(`- ⚠️ \`${name}\` ${from} → ${to}: preflight produced no readable output.`)
    continue
  }

  const certain = report.certain?.length ?? 0
  const maybe = report.maybe?.length ?? 0
  if (certain > 0) failed = true

  const icon = certain > 0 ? "❌" : maybe > 0 ? "⚠️" : "✅"
  lines.push(`- ${icon} \`${name}\` ${from} → ${to}: ${certain} certain break(s), ${maybe} possible, ${report.filesMatched ?? 0} file(s) use it`)
}

const markdown = lines.join("\n") + "\n"
writeFileSync("preflight-report.md", markdown)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
console.log(markdown)
process.exit(failed ? 1 : 0)
