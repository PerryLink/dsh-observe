#!/usr/bin/env python3
"""README visuals for dsh-observe (docs/assets/), generated from what this
package actually runs.

Outputs
  docs/assets/dsh-observe-hero-{zh,en}-{light,dark}.webp   1440x576 (Pillow)
  docs/assets/dsh-observe-flow-v5-{light,dark}.svg         1100x660 (hand SVG)

1. Hero — 1440x576, left copy column + a trace waterfall.
   Left: kicker, title, the two-line value sentence, one subtitle, one meta
   line, install footer. Right: the only thing this plugin produces — one
   turn's trace. Seven span rows (turn / step / tool / llm) sit on a time
   axis; the LLM bars carry the token counts; the strip below the rows is
   the metric family the collector emits (spans, tokens, USD cost, context
   pressure). Two captions under the card name the destinations (OTLP
   /v1/traces + /v1/metrics, Langfuse ingestion) and the delivery facts
   (sanitize at capture, queue 256 / 5s, spool 10000 oldest-first).

2. Flow — 1100x660, the real delivery shape: a fork into two independent
   backend pipelines around one bounded spool, not a left-to-right row.
   Left column is the capture spine: session/event → collector (span and
   metric families, deterministic ids) → sanitize (key redaction, builtin
   secret patterns, character budgets), where the record is cleaned BEFORE
   any queue. The spine forks into two lanes: BACKEND·otlp and
   BACKEND·langfuse. Each lane is pipeline (queue 256 / 5000ms,
   maxQueueRecords 2000) → flush·retry (5 attempts, 1000ms x2 capped at
   60000ms) → wire endpoint. Both lanes spill into the bounded
   storage-domain spool between them (10000 records, oldest-first, zod
   re-validation on read), and a dashed return rail on the right drains the
   spool back into both endpoints every 30000ms. The optional remote surface
   (observe/status, observe/setEnabled) sits under the capture spine; the
   bottom band states the flush/retry/drain cadence and the off-by-default
   contract.

Every label is a config key, event, endpoint, span kind or field name from
this repository; the SVG uses command tokens only, so all five README
languages share the same pair. Every string is measured before it is drawn:
a label that would leave its box aborts the run instead of shipping clipped.

Run:  python scripts/gen-readme-assets.py
Needs: Pillow + msyh.ttc / msyhbd.ttc / consola.ttf / consolab.ttf /
       segoeui.ttf / segoeuib.ttf.
"""
from __future__ import annotations

import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_MONO_BOLD = r"C:\Windows\Fonts\consolab.ttf"
FONT_EN = r"C:\Windows\Fonts\segoeui.ttf"
FONT_EN_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO, FONT_MONO_BOLD,
           FONT_EN, FONT_EN_BOLD):
    if not os.path.exists(_p):
        sys.exit(f"FATAL: font missing: {_p}")

FONTS = {
    "cjk": FONT_CJK, "cjk_bold": FONT_CJK_BOLD,
    "mono": FONT_MONO, "mono_bold": FONT_MONO_BOLD,
    "en": FONT_EN, "en_bold": FONT_EN_BOLD,
}

SKIN = {
    "light": dict(bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
                  panel="#f7f4fd", edge="#e4e1ee", text="#141419",
                  sub="#4d5261", faint="#8f94a4", accent="#4B67B4",
                  accent2="#16a34a", track="#e7e2f2", pill="#ece7f9",
                  shadow=(27, 23, 53), shadow_alpha=42, dots="#d9d3ea",
                  glow="#9b8cf0", glow_alpha=34),
    "dark": dict(bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
                 panel="#202939", edge="#2e374b", text="#f0f3f9",
                 sub="#a8b1c4", faint="#8791a4", accent="#8496f5",
                 accent2="#3fb950", track="#2b3549", pill="#242d42",
                 shadow=(0, 0, 0), shadow_alpha=110, dots="#2c3549",
                 glow="#4B67B4", glow_alpha=52),
}

_MEASURE = ImageDraw.Draw(Image.new("RGB", (1, 1)))
_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}
_WIDTHS: dict[tuple[str, int, str], float] = {}


def hx(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def tint(color: str, alpha: int) -> tuple[int, int, int, int]:
    return (*hx(color), max(0, min(255, alpha)))


def font(size: int, kind: str) -> ImageFont.FreeTypeFont:
    key = (kind, size)
    if key not in _CACHE:
        _CACHE[key] = ImageFont.truetype(FONTS[kind], size)
    return _CACHE[key]


def tw(text: str, size: int, kind: str) -> float:
    key = (text, size, kind)
    if key not in _WIDTHS:
        _WIDTHS[key] = _MEASURE.textlength(text, font=font(size, kind))
    return _WIDTHS[key]


def must_fit(text: str, size: int, kind: str, maxw: float, where: str) -> None:
    width = tw(text, size, kind)
    if width > maxw:
        sys.exit(f"FATAL: {where}: {text!r} needs {width:.0f}px at {size}px, "
                 f"the box allows {maxw:.0f}px. Shorten it or widen the box.")


def fit_size(text: str, kind: str, size: int, maxw: float, floor: int) -> int:
    while size > floor and tw(text, size, kind) > maxw:
        size -= 1
    return size


def check_display(size: int, floor_at_880: float, label: str) -> None:
    shown = size * 880 / 1440
    if shown < floor_at_880:
        sys.exit(f"FATAL: {label} is {shown:.1f}px at 880px wide, "
                 f"the floor is {floor_at_880}px")


# ---------------------------------------------------------------------------
# Hero (1440x576, drawn at 2x and downsampled)
# ---------------------------------------------------------------------------
W, H = 1440, 576
S = 2

COPY = {
    "zh": dict(
        kicker="DSH 插件 · 可观测性导出",
        kicker_kind="cjk_bold", kicker_size=15,
        value1="会话 → 标准 OTLP trace + Langfuse 观测；",
        value2="发出去之前先脱敏，默认什么都不发。",
        value_kind="cjk_bold", value_size=30,
        subtitle="turn / step / 工具调用 / LLM span · token 与成本",
        sub_kind="cjk", sub_size=25,
        footer="dsh plugin --profile web add dsh-observe",
    ),
    "en": dict(
        kicker="DSH PLUGIN · OBSERVABILITY",
        kicker_kind="en_bold", kicker_size=14,
        value1="Every session → OTLP trace + Langfuse spans;",
        value2="sanitized before send — off by default.",
        value_kind="en_bold", value_size=29,
        subtitle="turn / step / tool / LLM spans · tokens & USD cost",
        sub_kind="en", sub_size=25,
        footer="dsh plugin --profile web add dsh-observe",
    ),
}
META = "v0.2.27 · DSH 0.2.x · Node ^22.19 · Apache-2.0"

ROWS = [
    # kind, name, bar start, bar end (px of 328), duration, inline tokens
    ("TURN", "turn 3", 0, 328, "4.82s", None),
    ("STEP", "step 1", 2, 212, "3.09s", None),
    ("TOOL", "read_file", 6, 28, "318ms", None),
    ("LLM", "deepseek-chat", 34, 130, "1.41s", "812→244"),
    ("STEP", "step 2", 218, 322, "1.53s", None),
    ("TOOL", "edit_file", 224, 238, "196ms", None),
    ("LLM", "deepseek-chat", 244, 319, "1.09s", "1.9k→366"),
]


class Hero:
    """Design-space (1440x576) painter on a 2x canvas."""

    def __init__(self, lang: str, skin: str) -> None:
        self.lang = lang
        self.s = SKIN[skin]
        self.canvas = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.canvas)

    # -- primitives ------------------------------------------------------
    def gradient(self) -> None:
        top, bottom = hx(self.s["bg_from"]), hx(self.s["bg_to"])
        base = Image.new("RGB", (W * S, H * S))
        pen = ImageDraw.Draw(base)
        for y in range(H * S):
            t = y / (H * S - 1)
            pen.line([(0, y), (W * S, y)],
                     fill=tuple(round(a + (b - a) * t)
                                for a, b in zip(top, bottom)))
        self.canvas.alpha_composite(base.convert("RGBA"))

    def glow(self, cx: float, cy: float, rx: float, ry: float) -> None:
        layer = Image.new("RGBA", self.canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse(
            [(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S],
            fill=tint(self.s["glow"], self.s["glow_alpha"]))
        layer = layer.filter(ImageFilter.GaussianBlur(120 * S))
        self.canvas.alpha_composite(layer)

    def dots(self, x: float, y: float, w: float, h: float,
             step: float = 30) -> None:
        layer = Image.new("RGBA", self.canvas.size, (0, 0, 0, 0))
        pen = ImageDraw.Draw(layer)
        color = tint(self.s["dots"], 70)
        gy = y
        while gy < y + h:
            gx = x
            while gx < x + w:
                pen.ellipse([(gx - 1.2) * S, (gy - 1.2) * S,
                             (gx + 1.2) * S, (gy + 1.2) * S], fill=color)
                gx += step
            gy += step
        self.canvas.alpha_composite(layer)

    def text(self, x: float, y: float, label: str, size: int, kind: str,
             color: str, anchor: str = "ls", alpha: int = 255) -> None:
        self.d.text((x * S, y * S), label, font=font(size * S, kind),
                    fill=tint(color, alpha), anchor=anchor)

    @staticmethod
    def _paint(value):
        if value is None:
            return None
        return value if isinstance(value, tuple) else tint(value, 255)

    def rect(self, x: float, y: float, w: float, h: float, r: float,
             fill=None, edge=None, width: float = 1) -> None:
        self.d.rounded_rectangle(
            [x * S, y * S, (x + w) * S, (y + h) * S], radius=r * S,
            fill=self._paint(fill), outline=self._paint(edge),
            width=max(1, round(width * S)) if edge else 1)

    def card(self, x: float, y: float, w: float, h: float, r: float,
             fill: str, edge: str, dy: float = 10, blur: float = 18) -> None:
        shadow = Image.new("RGBA", self.canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            [x * S, (y + dy) * S, (x + w) * S, (y + h + dy) * S],
            radius=r * S, fill=(*self.s["shadow"], self.s["shadow_alpha"]))
        shadow = shadow.filter(ImageFilter.GaussianBlur(blur * S))
        self.canvas.alpha_composite(shadow)
        self.rect(x, y, w, h, r, fill=fill, edge=edge)

    def rule(self, x1: float, y1: float, x2: float, y2: float,
             color: str, alpha: int = 255) -> None:
        self.d.line([x1 * S, y1 * S, x2 * S, y2 * S],
                    fill=tint(color, alpha), width=S)

    # -- copy column -----------------------------------------------------
    def copy_column(self, lang: str) -> None:
        c = COPY[lang]
        s = self.s
        x = 88

        kicker_size = c["kicker_size"]
        kicker_w = tw(c["kicker"], kicker_size, c["kicker_kind"])
        must_fit(c["kicker"], kicker_size, c["kicker_kind"], 430, "kicker")
        pill_w = kicker_w + 62
        self.rect(x, 70, pill_w, 36, 18, fill=s["pill"],
                  edge=s["edge"], width=1)
        self.d.ellipse([(x + 17) * S, (70 + 15) * S,
                        (x + 24) * S, (70 + 22) * S],
                       fill=tint(s["accent"], 255))
        self.text(x + 33, 94, c["kicker"], kicker_size, c["kicker_kind"],
                  s["accent"])

        title = "dsh-observe"
        title_size = 84
        must_fit(title, title_size, "en_bold", 620, "hero title")
        check_display(title_size, 48, "hero title")
        self.text(x, 214, title, title_size, "en_bold", s["text"])

        value_size = fit_size(c["value1"], c["value_kind"], c["value_size"],
                              620, 26)
        must_fit(c["value1"], value_size, c["value_kind"], 620, "value line 1")
        must_fit(c["value2"], value_size, c["value_kind"], 620, "value line 2")
        self.text(x, 290, c["value1"], value_size, c["value_kind"], s["text"])
        self.text(x, 336, c["value2"], value_size, c["value_kind"], s["text"])

        must_fit(c["subtitle"], c["sub_size"], c["sub_kind"], 620, "subtitle")
        check_display(c["sub_size"], 15, "hero subtitle")
        self.text(x, 388, c["subtitle"], c["sub_size"], c["sub_kind"],
                  s["sub"])

        must_fit(META, 20, "mono", 620, "meta line")
        check_display(20, 12, "hero meta")
        self.text(x, 430, META, 20, "mono", s["faint"])

        self.rule(88, 470, 720, 470, s["edge"])
        must_fit(c["footer"], 18, "mono", 430, "footer")
        self.text(x, 502, c["footer"], 18, "mono", s["sub"])
        self.text(720, 502, "Apache-2.0", 18, "mono", s["faint"],
                  anchor="rs")

    # -- trace card ------------------------------------------------------
    def trace_card(self) -> None:
        s = self.s
        x, y, w, h = 772, 72, 580, 428
        self.card(x, y, w, h, 22, s["card"], s["edge"])

        must_fit("trace 9f2a…c41d", 18, "mono_bold", 320, "trace title")
        self.text(796, 112, "trace 9f2a…c41d", 18, "mono_bold", s["text"])

        pill_label = "ok · 7 spans"
        pill_w = tw(pill_label, 11.5, "mono_bold") + 30
        px = 1328 - pill_w
        self.rect(px, 96, pill_w, 24, 12, fill=tint(s["accent2"], 30),
                  edge=tint(s["accent2"], 90), width=1)
        self.d.ellipse([(px + 11) * S, 107 * S, (px + 16) * S, 112 * S],
                       fill=tint(s["accent2"], 255))
        self.text(px + 21, 113, pill_label, 11.5, "mono_bold", s["accent2"])

        sub = "session 7f3c… · turn 3 · service.name deepseek-harness"
        must_fit(sub, 12, "mono", 500, "trace subtitle")
        self.text(796, 136, sub, 12, "mono", s["faint"])
        self.rule(796, 152, 1328, 152, s["edge"])

        bar_x, bar_w, bar_data = 972, 300, 328

        def bx(value: float) -> float:
            return bar_x + value * bar_w / bar_data

        for index, (kind, name, start, end, duration, tokens) in enumerate(ROWS):
            cy = 164 + 35 * index + 17.5
            chip_fill = (tint(s["accent"], 30) if kind != "TOOL"
                         else tint(s["faint"], 34))
            chip_text = s["accent"] if kind != "TOOL" else s["sub"]
            self.rect(796, cy - 10, 46, 20, 10, fill=chip_fill)
            self.text(819, cy + 4, kind, 10.5, "mono_bold", chip_text,
                      anchor="ms")
            must_fit(name, 14, "mono", 114, f"row {index} name")
            self.text(852, cy + 5, name, 14, "mono", s["text"])

            self.rect(bar_x, cy - 6, bar_w, 12, 6, fill=s["track"])
            if kind == "TURN":
                color = tint(s["accent"], 255)
            elif kind == "STEP":
                color = tint(s["accent"], 140)
            elif kind == "LLM":
                color = tint(s["accent"], 205)
            else:
                color = tint(s["faint"], 150)
            self.rect(bx(start), cy - 6, bx(end) - bx(start), 12, 6,
                      fill=color)
            if tokens is not None:
                must_fit(tokens, 10, "mono_bold", bx(end) - bx(start) - 12,
                         f"row {index} token label")
                self.text(bx(start) + 8, cy + 3.5, tokens, 10, "mono_bold",
                          "#ffffff")
            must_fit(duration, 12, "mono", 60, f"row {index} duration")
            self.text(1328, cy + 4, duration, 12, "mono", s["faint"],
                      anchor="rs")

        self.rule(796, 420, 1328, 420, s["edge"])

        cells = [("SPANS", "7"), ("TOKENS", "2.7k → 610"),
                 ("COST", "$0.0043"), ("CTX", "61%")]
        for index, (label, value) in enumerate(cells):
            cx = 796 + index * 133
            self.text(cx, 444, label, 10.5, "mono_bold", s["faint"])
            must_fit(value, 15, "mono_bold", 118, f"metric {label}")
            self.text(cx, 468, value, 15, "mono_bold", s["text"])
            if index > 0:
                self.rule(cx - 12, 432, cx - 12, 476, s["edge"])

        out1 = "→ OTLP /v1/traces + /v1/metrics    ·    → Langfuse ingestion"
        must_fit(out1, 12.5, "mono", 576, "destination caption")
        self.text(772, 524, out1, 12.5, "mono", s["accent"])
        out2 = "sanitized at capture · queue 256 / 5s · spool 10000 oldest-first"
        must_fit(out2, 11.5, "mono", 576, "delivery caption")
        self.text(772, 550, out2, 11.5, "mono", s["faint"])

    def render(self) -> Image.Image:
        self.gradient()
        self.glow(1180, 210, 380, 260)
        self.glow(860, 520, 320, 180)
        self.dots(760, 60, 640, 520)
        self.copy_column(self.lang)
        self.trace_card()
        return self.canvas.resize((W, H), Image.LANCZOS)


def hero(lang: str, skin: str) -> Image.Image:
    return Hero(lang, skin).render()


# ---------------------------------------------------------------------------
# Flow SVG (1100x660) — dual-lane fork around a bounded spool
# ---------------------------------------------------------------------------
SVG_MONO = "Consolas, ui-monospace, SFMono-Regular, Menlo, monospace"
SVG_SANS = ("Segoe UI, Microsoft YaHei, ui-sans-serif, system-ui, "
            "sans-serif")


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg_text(x: float, y: float, label: str, size: float, kind: str,
             color: str, weight: str | None = None,
             anchor: str | None = None, spacing: float | None = None,
             transform: str | None = None) -> str:
    family = SVG_MONO if kind.startswith("mono") else SVG_SANS
    attrs = [f'x="{x}"', f'y="{y}"', f'fill="{color}"',
             f'font-family="{family}"', f'font-size="{size}"']
    if weight:
        attrs.append(f'font-weight="{weight}"')
    if anchor:
        attrs.append(f'text-anchor="{anchor}"')
    if spacing:
        attrs.append(f'letter-spacing="{spacing}"')
    if transform:
        attrs.append(f'transform="{transform}"')
    return f'<text {" ".join(attrs)}>{esc(label)}</text>'


def check_svg(label: str, size: float, kind: str, maxw: float,
              where: str) -> None:
    must_fit(label, int(math.ceil(size)),
             "mono" if kind.startswith("mono") else "en", maxw, where)


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    accent, text, sub, faint = s["accent"], s["text"], s["sub"], s["faint"]
    edge, card, panel = s["edge"], s["card"], s["panel"]
    p: list[str] = []

    def add(line: str) -> None:
        p.append(line)

    def card_box(x: float, y: float, w: float, h: float, rx: float = 18,
                 fill: str | None = None, stroke: str | None = None,
                 dashed: bool = False) -> None:
        dash = ' stroke-dasharray="5 5"' if dashed else ""
        add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{fill or card}" stroke="{stroke or edge}" '
            f'stroke-width="1"{dash} filter="url(#soft)"/>')

    def arrow(x1: float, y1: float, x2: float, y2: float,
              dashed: bool = False) -> None:
        dash = ' stroke-dasharray="5 5"' if dashed else ""
        add(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" '
            f'stroke="{accent}" stroke-width="1.8"{dash} '
            f'marker-end="url(#arr)"/>')

    add('<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="660" '
        'viewBox="0 0 1100 660" role="img" aria-labelledby="t d">')
    add('<title id="t">dsh-observe delivery shape: the session/event capture '
        'spine forks into two independent backend pipelines — otlp and '
        'langfuse — that each queue, flush with retry, and post to their own '
        'endpoint, around one bounded storage-domain spool that both spill '
        'into and that drains back into both endpoints on a timer</title>')
    add('<desc id="d">Left column, capture: session/event boundary events feed '
        'the collector (turn, step, tool and llm spans; observe.tokens, '
        'observe.cost and observe.context_tokens metrics; deterministic '
        'sha256 ids), then sanitize (key redaction, five builtin secret '
        'patterns, prompt/completion 4000, tool 2000/2000, attributes 512) '
        'runs at capture, before any queue. The record then forks into two '
        'lanes. Each lane is a pipeline (queue 256 records or 5000ms, '
        'maxQueueRecords 2000) into flush and retry (maxAttempts 5, 1000ms x2 '
        'capped at 60000ms, deterministic backoff) into its wire endpoint: '
        'OTLP POST /v1/traces and /v1/metrics with service.name '
        'deepseek-harness, or Langfuse POST /api/public/ingestion with '
        'trace-create, span-create and generation-create under Basic auth. '
        'Retry-exhausted batches and queue overflow spill into the bounded '
        'storage-domain spool between the lanes (maxBufferRecords 10000, '
        'oldest-first eviction, zod re-validation on read, survives restart); '
        'a dashed return rail on the right drains it back into both endpoints '
        'every 30000ms. Bottom left is the optional remote surface, '
        'observe/status and observe/setEnabled. The bottom band states the '
        'flush, retry and drain cadence and the off-by-default contract.'
        '</desc>')
    add('<defs>')
    add(f'<linearGradient id="bg" x1="0" y1="0" x2="0.32" y2="1">'
        f'<stop offset="0" stop-color="{s["bg_from"]}"/>'
        f'<stop offset="1" stop-color="{s["bg_to"]}"/></linearGradient>')
    add(f'<filter id="soft" x="-30%" y="-30%" width="160%" height="180%">'
        f'<feDropShadow dx="0" dy="8" stdDeviation="11" '
        f'flood-color="{("#1b1735" if skin == "light" else "#000000")}" '
        f'flood-opacity="{".10" if skin == "light" else ".45"}"/></filter>')
    add(f'<pattern id="dots" width="26" height="26" '
        f'patternUnits="userSpaceOnUse"><circle cx="1.4" cy="1.4" r="1.4" '
        f'fill="{s["dots"]}"/></pattern>')
    add(f'<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" '
        f'markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" '
        f'orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" '
        f'fill="{accent}"/></marker>')
    add('</defs>')
    add('<rect width="1100" height="660" fill="url(#bg)"/>')
    add('<rect width="1100" height="660" fill="url(#dots)" opacity=".45"/>')

    # ---- header --------------------------------------------------------
    add(svg_text(44, 58, "dsh-observe", 30, "mono", text, "700"))
    subtitle = ("session/event → collector → sanitize → 2 pipelines · "
                "bounded spool · deterministic ids")
    check_svg(subtitle, 13.5, "sans", 690, "flow subtitle")
    add(svg_text(44, 86, subtitle, 13.5, "sans", sub))
    add(svg_text(1056, 56, "v0.2.27 · OTLP/HTTP + Langfuse", 12, "mono",
                 faint, anchor="end"))
    add(svg_text(1056, 84, "solid = sync · dashed = async / optional",
                 11.5, "sans", faint, anchor="end"))
    add(f'<line x1="40" y1="100" x2="1060" y2="100" stroke="{edge}" '
        f'stroke-width="2"/>')

    # ---- capture spine (left column) -----------------------------------
    add(svg_text(60, 126, "CAPTURE", 11, "mono", faint, "700",
                 spacing=1.4))
    card_box(44, 134, 248, 64, 16)
    add(svg_text(60, 162, "session/event", 15, "mono", text, "700"))
    check_svg("turn/step/tool/llm boundaries", 12, "sans", 216, "source sub")
    add(svg_text(60, 182, "turn/step/tool/llm boundaries", 13, "sans", sub))
    arrow(168, 198, 168, 210)

    card_box(44, 212, 248, 138, 18)
    add(svg_text(60, 240, "collector", 16, "mono", text, "700"))
    for i, line in enumerate((
            "span: turn · step · tool · llm",
            "metric: observe.tokens · cost",
            "observe.context_tokens (gauge)")):
        check_svg(line, 13, "sans", 216, f"collector line {i}")
        add(svg_text(60, 266 + i * 22, line, 13, "sans", sub))
    check_svg("ids = sha256(session, turn, part)", 11, "mono", 216,
              "collector note")
    add(svg_text(60, 338, "ids = sha256(session, turn, part)", 11, "mono",
                 faint))
    arrow(168, 350, 168, 362)

    card_box(44, 364, 248, 138, 18)
    add(svg_text(60, 392, "sanitize", 16, "mono", text, "700"))
    for i, line in enumerate((
            "redactKeys + 5 builtin patterns",
            "prompt 4000 · completion 4000",
            "tool 2000/2000 · attr 512")):
        check_svg(line, 13, "sans", 216, f"sanitize line {i}")
        add(svg_text(60, 418 + i * 22, line, 13, "sans", sub))
    check_svg("before any queue · [REDACTED]", 11, "mono", 216,
              "sanitize note")
    add(svg_text(60, 490, "before any queue · [REDACTED]", 11, "mono",
                 faint))

    # fork: sanitize -> both lanes
    add(f'<path d="M292 433 H312 V208 H320" fill="none" stroke="{accent}" '
        f'stroke-width="1.8" marker-end="url(#arr)"/>')
    add(f'<path d="M312 433 V484 H320" fill="none" stroke="{accent}" '
        f'stroke-width="1.8" marker-end="url(#arr)"/>')

    # ---- lane A (otlp) -------------------------------------------------
    add(svg_text(320, 128, "BACKEND · otlp", 11, "mono", accent, "700",
                 spacing=1.4))
    card_box(320, 140, 192, 136)
    add(svg_text(336, 170, 'pipeline "otlp"', 15, "mono", text, "700"))
    add(svg_text(336, 196, "queue 256 / 5000ms", 13, "sans", sub))
    add(svg_text(336, 218, "maxQueueRecords 2000", 13, "sans", sub))
    add(svg_text(336, 246, "push is synchronous", 11, "mono", faint))

    card_box(536, 140, 224, 136)
    add(svg_text(552, 170, "flush · retry", 15, "mono", text, "700"))
    add(svg_text(552, 196, "maxAttempts 5", 13, "sans", sub))
    add(svg_text(552, 218, "1000ms × 2 → 60000ms", 13, "sans", sub))
    add(svg_text(552, 246, "deterministic backoff", 11, "mono", faint))
    add(f'<path d="M735 175 A9 9 0 1 1 742 168" fill="none" stroke="{accent}" '
        f'stroke-width="1.6" stroke-linecap="round" marker-end="url(#arr)"/>')

    card_box(784, 140, 272, 136)
    add(svg_text(800, 170, "POST /v1/traces", 14, "mono", text, "700"))
    add(svg_text(800, 196, "POST /v1/metrics", 13, "sans", sub))
    add(svg_text(800, 218, "service.name deepseek-harness", 13, "sans", sub))
    add(svg_text(800, 246, "JSON · cumulative sums", 11, "mono", faint))

    arrow(512, 208, 532, 208)
    arrow(760, 208, 780, 208)

    # ---- lane B (langfuse) ---------------------------------------------
    add(svg_text(320, 404, "BACKEND · langfuse", 11, "mono", accent, "700",
                 spacing=1.4))
    card_box(320, 416, 192, 136)
    add(svg_text(336, 446, 'pipeline "langfuse"', 13.5, "mono", text, "700"))
    add(svg_text(336, 472, "queue 256 / 5000ms", 13, "sans", sub))
    add(svg_text(336, 494, "maxQueueRecords 2000", 13, "sans", sub))
    add(svg_text(336, 522, "push is synchronous", 11, "mono", faint))

    card_box(536, 416, 224, 136)
    add(svg_text(552, 446, "flush · retry", 15, "mono", text, "700"))
    add(svg_text(552, 472, "maxAttempts 5", 13, "sans", sub))
    add(svg_text(552, 494, "1000ms × 2 → 60000ms", 13, "sans", sub))
    add(svg_text(552, 522, "deterministic backoff", 11, "mono", faint))
    add(f'<path d="M735 451 A9 9 0 1 1 742 444" fill="none" stroke="{accent}" '
        f'stroke-width="1.6" stroke-linecap="round" marker-end="url(#arr)"/>')

    card_box(784, 416, 272, 136)
    add(svg_text(800, 446, "POST /api/public/ingestion", 14, "mono", text,
                 "700"))
    add(svg_text(800, 472, "trace-create · span-create", 13, "sans", sub))
    add(svg_text(800, 494, "generation-create · Basic auth", 13, "sans", sub))
    add(svg_text(800, 522, "one ingestion POST per batch", 11, "mono", faint))

    arrow(512, 484, 532, 484)
    arrow(760, 484, 780, 484)

    # ---- bounded spool between the lanes -------------------------------
    card_box(320, 300, 736, 88, 18, fill=panel, stroke=accent)
    add(svg_text(336, 328, 'spool · storage-domain "observe"', 15, "mono",
                 text, "700"))
    add(svg_text(336, 354, "maxBufferRecords 10000 · oldest-first eviction",
                 13, "sans", sub))
    add(svg_text(336, 376, "zod re-validate on read · survives restart", 13,
                 "sans", sub))
    add(f'<rect x="966" y="312" width="72" height="24" rx="12" '
        f'fill="{accent}" opacity=".14"/>')
    add(svg_text(1002, 328, "bounded", 11, "mono", accent, "700",
                 anchor="middle"))
    add(svg_text(1040, 376, "storage:write", 11, "mono", faint,
                 anchor="end"))

    # spill from lane A down, overflow from lane B up
    arrow(612, 276, 612, 296, dashed=True)
    arrow(652, 276, 652, 296, dashed=True)
    check_svg("retry exhausted", 11, "sans", 92, "spill label")
    add(svg_text(672, 294, "retry exhausted", 11, "sans", sub))
    arrow(612, 416, 612, 392, dashed=True)
    arrow(652, 416, 652, 392, dashed=True)
    check_svg("queue full", 11, "sans", 92, "overflow label")
    add(svg_text(672, 412, "queue full", 11, "sans", sub))

    # drain return rail: spool -> both endpoints
    add(f'<path d="M1056 344 H1080 V484 H1058" fill="none" stroke="{accent}" '
        f'stroke-width="1.6" stroke-dasharray="5 5" marker-end="url(#arr)"/>')
    add(f'<path d="M1080 344 V208 H1058" fill="none" stroke="{accent}" '
        f'stroke-width="1.6" stroke-dasharray="5 5" '
        f'marker-end="url(#arr)"/>')
    add(svg_text(1052, 406, "drainSpool · 30000ms", 11, "mono", faint,
                 anchor="end"))

    # ---- optional remote surface (bottom left) -------------------------
    card_box(44, 514, 248, 84, 16, fill=panel, dashed=True)
    add(svg_text(60, 536, "OPTIONAL REMOTE", 11, "mono", faint, "700",
                 spacing=1.4))
    add(svg_text(60, 560, "observe/status", 13, "mono", accent, "700"))
    add(svg_text(60, 582, "observe/setEnabled", 13, "mono", accent, "700"))

    # ---- bottom band ---------------------------------------------------
    band1 = ("flush: 256 records or 5000ms · retry: 5 attempts, 1s × 2 "
             "capped at 60s · drain: 30000ms · metrics skip retry")
    check_svg(band1, 11.5, "mono", 1012, "bottom band 1")
    add(svg_text(44, 626, band1, 11.5, "mono", sub))
    band2 = ("off by default: enabled: true + at least one backend · no model "
             "tools · no commands · only session/event, session/flush, "
             "session/disposed")
    check_svg(band2, 11.5, "mono", 1012, "bottom band 2")
    add(svg_text(44, 648, band2, 11.5, "mono", faint))

    add('</svg>')
    return "\n".join(p) + "\n"


# ---------------------------------------------------------------------------
def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for lang in ("zh", "en"):
        for skin in ("light", "dark"):
            path = os.path.join(OUT, f"dsh-observe-hero-{lang}-{skin}.webp")
            hero(lang, skin).save(path, "WEBP", quality=92, method=6)
            print(f"wrote {os.path.relpath(path, ROOT)}")
    for skin in ("light", "dark"):
        path = os.path.join(OUT, f"dsh-observe-flow-v5-{skin}.svg")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
        print(f"wrote {os.path.relpath(path, ROOT)}")
    print("wrote 4 hero WEBP + 2 flow-v5 SVG files to docs/assets/")


if __name__ == "__main__":
    main()
