import { exec, home, readTextFile } from "herdr";

// Each provider answers { id, name, icon, tint?, windows: [{ label, used, resetsAt }], error }.
// `used` is a percentage 0-100; `resetsAt` an ISO time or null.
// `icon` is a path under ~/.config/herdr-app; `tint` means it takes the text color (svg) rather than its own (image).
// `bar: false` leaves the provider out of the status bar; the popup still lists it.

async function claude() {
  const base = { id: "claude", name: "Claude", icon: "icons/claude.svg", windows: [] };
  // Written by ~/.claude/statusline-usage.mjs (in this mod's repo) from what Claude Code reports to its status line:
  // no API call, so no 429 (the usage endpoint is rate limited per account).
  const saved = JSON.parse((await readTextFile(`${home()}/.claude/herdr-rate-limits.json`)) ?? "null");
  if (saved?.rate_limits) {
    const now = Date.now() / 1000;
    const win = (label, w) => w && {
      label,
      used: w.resets_at && w.resets_at < now ? 0 : w.used_percentage ?? 0,
      resetsAt: w.resets_at && w.resets_at >= now ? new Date(w.resets_at * 1000).toISOString() : null,
    };
    return { ...base, windows: [win("5-hour", saved.rate_limits.five_hour), win("Weekly", saved.rate_limits.seven_day)].filter(Boolean) };
  }
  const creds = JSON.parse((await readTextFile(`${home()}/.claude/.credentials.json`)) ?? "{}");
  const token = creds.claudeAiOauth?.accessToken;
  if (!token) return { ...base, error: "Not signed in to Claude Code" };
  const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
  });
  // Claude Code refreshes its own token; until it runs again the stored one may be stale.
  if (r.status === 401) return { ...base, error: "Token expired: run Claude Code once to refresh it" };
  if (!r.ok) return { ...base, error: `HTTP ${r.status}` };
  const d = await r.json();
  const win = (label, w) => w && { label, used: w.utilization ?? 0, resetsAt: w.resets_at ?? null };
  return { ...base, windows: [
    win("5-hour", d.five_hour),
    win("Weekly", d.seven_day),
    win("Weekly Opus", d.seven_day_opus),
    win("Weekly Sonnet", d.seven_day_sonnet),
  ].filter(Boolean) };
}

async function antigravity() {
  const base = { id: "antigravity", name: "Antigravity", icon: "icons/antigravity.svg", windows: [] };
  // `-p /usage` is a built-in command: it answers from the quota service without an agent turn.
  const r = await exec("agy", ["-p", "/usage", "--output-format", "json", "--print-timeout", "20s"], { timeout: 40000 });
  let d;
  try { d = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { return { ...base, error: (r.stderr || r.stdout).trim().slice(0, 160) || "agy gave no answer" }; }
  const groups = d.command?.data?.groups;
  if (!groups) return { ...base, error: d.error ?? "agy reported no quota" };
  const short = (g) => g.replace(/ models?$/i, "");
  return { ...base, windows: groups.flatMap((g) => g.buckets.map((b) => ({
    label: `${short(g.name)} · ${b.window === "5h" ? "5-hour" : "Weekly"}`,
    used: Math.round((1 - b.remaining_fraction) * 1000) / 10,
    resetsAt: b.reset_time ?? null,
  }))) };
}

async function copilot() {
  const base = { id: "copilot", name: "Copilot", icon: "icons/copilot.svg", tint: true, bar: false, windows: [] };
  const t = await exec("gh", ["auth", "token"]);
  const token = t.stdout.trim();
  if (t.code !== 0 || !token) return { ...base, error: "Not signed in to gh" };
  const r = await fetch("https://api.github.com/copilot_internal/user", {
    headers: { Authorization: `token ${token}`, "X-GitHub-Api-Version": "2025-04-01", "User-Agent": "herdr-agent-usage" },
  });
  if (!r.ok) return { ...base, error: `HTTP ${r.status}` };
  const d = await r.json();
  const q = d.quota_snapshots ?? {};
  const reset = d.quota_reset_date ?? null;
  const win = (label, s) => s && !s.unlimited && s.entitlement > 0 && { label, used: Math.round((100 - s.percent_remaining) * 10) / 10, resetsAt: reset };
  return { ...base, windows: [
    win("Premium requests", q.premium_interactions),
    win("Chat", q.chat),
    win("Completions", q.completions),
  ].filter(Boolean) };
}

const PROVIDERS = [claude, antigravity, copilot];

export async function fetchUsage() {
  const results = await Promise.all(PROVIDERS.map(async (p) => {
    try { return await p(); } catch (e) { return { id: p.name, name: p.name, windows: [], error: String(e?.message ?? e) }; }
  }));
  return { updatedAt: Date.now(), providers: results };
}

// The tightest window: what the status bar shows for a provider.
export function peak(p) {
  return p.windows.reduce((m, w) => Math.max(m, w.used), -1);
}

export function tone(t, used) {
  return used >= 90 ? t.blocked : used >= 70 ? t.ansi3 : t.muted;
}
