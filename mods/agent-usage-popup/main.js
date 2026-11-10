import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, shared } from "herdr";

// Opened from the status bar's usage item; it fetches, this only shows what it shared.
// The bar already shows the 5-hour windows, so this lists the longer ones (weekly, monthly).
const USAGE = "agent-usage";

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

function until(iso) {
  if (!iso) return "";
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (!(m > 0)) return "resets soon";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return `resets in ${d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`}`;
}

function tone(t, used) {
  return used >= 90 ? t.blocked : used >= 70 ? t.ansi3 : t.accent;
}

export default class AgentUsagePopup extends View {
  window(t, w, key) {
    const used = Math.max(0, Math.min(100, w.used));
    return v_flex().gap(3)
      .child(h_flex().justify_between().text_size(11.5)
        .child(div().text_color(t.muted).child(w.label))
        .child(div().text_color(t.foreground).child(`${Math.round(w.used)}% used`)))
      .child(div().id(key).h(4).w_full().rounded(2).bg(t.raised)
        .child(div().h_full().w(`${used}%`).rounded(2).bg(tone(t, w.used))))
      .when(Boolean(w.resetsAt), (el) => el.child(div().text_size(10.5).text_color(t.dim).child(until(w.resetsAt))));
  }

  render() {
    const t = theme();
    const data = shared(USAGE);
    return v_flex().id("root").size_full().overflow_y_scrollbar().p(12).gap(12).bg(t.popover).text_size(12).text_color(t.foreground)
      .child(h_flex().justify_between().items_center()
        .child(div().font_semibold().child("Weekly usage"))
        .child(div().text_size(10.5).text_color(t.dim).child(data ? `updated ${ago(data.updatedAt)}` : "loading…")))
      .children((data?.providers ?? []).map((p) => v_flex().gap(6)
        .child(h_flex().gap(6).items_center()
          .when(Boolean(p.icon), (el) => el.child(p.tint ? svg(p.icon).size(14).text_color(t.muted) : image(p.icon).size(14)))
          .child(div().font_semibold().text_color(t.muted).child(p.name)))
        .when(Boolean(p.error), (el) => el.child(div().text_size(11).text_color(t.blocked).child(p.error)))
        .when(!p.error && p.windows.length === 0, (el) => el.child(div().text_size(11).text_color(t.dim).child("No limits reported")))
        .children(p.windows.filter((w) => w.kind !== "5h").map((w, i) => this.window(t, w, `${p.id}-${i}`)))));
  }
}
