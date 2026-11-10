import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, shared, setShared, openOverlay } from "herdr";
import { fetchUsage, peak, tone } from "./usage.js";

// Shared so the popup can read it and the last numbers show at once after a restart.
const USAGE = "agent-usage";
// Claude is read from a local file; agy and GitHub are fine with one call a minute.
const POLL_MS = 60 * 1000;

// A failed fetch (a 429, offline) keeps the provider's last numbers, marked with the error.
function keepLast(prev, next) {
  return { ...next, providers: next.providers.map((p) => {
    const old = prev?.providers?.find((o) => o.id === p.id);
    if (!p.error || p.windows.length || !old?.windows?.length) return p;
    return { ...p, windows: old.windows, error: `Couldn't refresh (${p.error}), showing last numbers` };
  }) };
}

// Usage saved before logos existed has no icon: fall back to the name.
function logo(t, p, size) {
  if (!p.icon) return div().text_color(t.dim).child(p.name);
  return p.tint ? svg(p.icon).size(size).text_color(t.muted) : image(p.icon).size(size);
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.loading = false;
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try { setShared(USAGE, keepLast(shared(USAGE), await fetchUsage())); } finally { this.loading = false; cx.notify(); }
    });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  usage(t) {
    const data = shared(USAGE);
    const items = (data?.providers ?? []).filter((p) => p.bar !== false).map((p) => {
      const used = peak(p, "5h");
      return h_flex().gap(4).items_center()
        .child(logo(t, p, 13))
        .child(div().text_color(p.error || used < 0 ? t.dim : tone(t, used)).child(used < 0 ? "–" : `${Math.round(used)}%`));
    });
    return h_flex().id("usage").gap(10).items_center().px(6).rounded(4).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        this.refresh(cx);
        openOverlay({ mod: "agent-usage-popup", kind: "popup", width: 320, height: 440 });
      })
      .child(svg("mods/workspace-status-usage/gauge.svg").size(13).when(this.loading, (el) => el.text_color(t.working)))
      .when(items.length === 0, (el) => el.child(div().text_color(t.dim).child("usage…")))
      .children(items);
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(this.usage(t))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
