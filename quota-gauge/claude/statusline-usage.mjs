// Claude Code status line: saves the rate_limits Claude Code reports to
// ~/.claude/herdr-rate-limits.json (read by herdr's status bar usage mod),
// then runs the status line you had before, if any, with the same input:
//   "statusLine": { "type": "command", "command": "node ~/.claude/statusline-usage.mjs [previous command...]" }
import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OUT = join(homedir(), ".claude", "herdr-rate-limits.json");
const previousCommand = process.argv.slice(2).join(" ");

const input = readFileSync(0, "utf8");

try {
  const limits = JSON.parse(input).rate_limits;
  if (limits) {
    let previous = null;
    try { previous = JSON.parse(readFileSync(OUT, "utf8")).rate_limits; } catch {}
    // Only write when the numbers move; the status line runs often.
    if (JSON.stringify(previous) !== JSON.stringify(limits)) {
      writeFileSync(`${OUT}.tmp`, JSON.stringify({ updatedAt: Date.now(), rate_limits: limits }));
      renameSync(`${OUT}.tmp`, OUT);
    }
  }
} catch {}

if (previousCommand) {
  const r = spawnSync(previousCommand, { input, shell: true, env: process.env, windowsHide: true });
  if (r.stdout) process.stdout.write(r.stdout);
}
