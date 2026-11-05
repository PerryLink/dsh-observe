#!/usr/bin/env python3
"""Generate README image assets for dsh-observe (docs/assets/).

Outputs (idempotent overwrite):
  dsh-observe-flow-light.svg / dsh-observe-flow-dark.svg
      Hero pipeline diagram. Two hand-written SVG files (vector — never
      rasterized to webp). Text inside is command-surface tokens only
      (session/event, collector, sanitize, pipeline, batch.maxBufferRecords,
      /v1/traces, ...), so all five README languages share the same pair.

No evidence chart is generated: this repository carries no benchmark or
measured data set in-tree, so there is no bar chart to draw. The old
single-theme docs/assets/dsh-observe-flow.svg, dsh-observe-hero.png and
dsh-observe-demo.{png,gif} stay in place so existing external links never
404; the READMEs reference only the new light/dark pair.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow (pip install pillow) — the family image toolchain; the SVG
           below is written directly because Pillow cannot rasterise SVG.
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont  # noqa: F401  (Pillow is the documented toolchain)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# --- palette: PerryLink family (accent) + GitHub page backgrounds ----------
FAMILY = "#4B67B4"   # family accent (badges labelColor family uses #2B3245)
GREEN = {"light": "#16a34a", "dark": "#3fb950"}
SKIN = {
    "light": dict(bg="#ffffff", box="#f6f8fa", border="#d0d7de",
                  text="#1f2328", sub="#57606a", track="#eaeef2"),
    "dark": dict(bg="#0d1117", box="#161b22", border="#30363d",
                 text="#f0f6fc", sub="#8b949e", track="#21262d"),
}

# --- CJK font probe: Chinese must never render as tofu boxes ----------------
# The SVG below uses command tokens only (ASCII), but the family template
# requires a loud font probe so a future localized variant cannot silently
# render tofu; abort if no CJK font is installed.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",      # Microsoft YaHei
    r"C:\Windows\Fonts\simhei.ttf",    # SimHei
    r"C:\Windows\Fonts\Deng.ttf",      # DengXian
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if FONT_PATH is None:
    sys.exit("FATAL: no CJK font found (looked for msyh.ttc, simhei.ttf, "
             "Deng.ttf, Noto Sans CJK, PingFang). Refusing to render Chinese "
             "as tofu boxes; install one of the probed fonts and re-run.")

WEBP_QUALITY = 90  # shared with the family image pipeline (evidence charts)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


# ---------------------------------------------------------------------------
# Hero pipeline SVG (light + dark): one row of stations, spool underneath.
# Labels are event/config/endpoint tokens only — no natural-language prose.
# ---------------------------------------------------------------------------
STATIONS = [
    ("session/event", "turn · step · tool · llm"),
    ("collector", "spans · metrics · pricing"),
    ("sanitize", "redactKeys · truncate*"),
    ("pipeline", "otlp · langfuse · retry"),
]

SUBTITLE = "session/event · spans · metrics · otlp · langfuse"
SPOOL = ("spool · batch.maxBufferRecords 10000 · oldest-first · "
         "re-validated")
SINKS = "otlp.endpoint → /v1/traces · /v1/metrics · langfuse → ingestion"
FOOTNOTE = "enabled: false · sanitize → queue → flush → spool · retry.maxAttempts 5"


def flow_svg(skin: str) -> str:
    """Render one theme of the hero pipeline diagram as an SVG document."""
    s = SKIN[skin]
    w, h = 1200, 420
    nw, nh, gap = 240, 96, 40
    x0, y0 = 60, 140
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" '
        f'aria-label="dsh-observe pipeline: session/event to collector to '
        f'sanitize to otlp/langfuse pipeline, with a bounded durable spool">',
        '<title>dsh-observe pipeline</title>',
        f'<rect width="{w}" height="{h}" rx="18" fill="{s["bg"]}"/>',
        f'<text x="60" y="58" fill="{s["text"]}" '
        f'font-family="ui-sans-serif,system-ui,sans-serif" font-size="30" '
        f'font-weight="700">dsh-observe</text>',
        f'<text x="60" y="88" fill="{s["sub"]}" '
        f'font-family="ui-monospace,monospace" font-size="15">{SUBTITLE}</text>',
        f'<line x1="60" y1="108" x2="1140" y2="108" stroke="{s["border"]}"/>',
    ]

    for i, (label, sub) in enumerate(STATIONS):
        x = x0 + i * (nw + gap)
        accent = (FAMILY if i in (1, 2)
                  else (GREEN[skin] if i == 3 else s["border"]))
        parts.append(
            f'<rect x="{x}" y="{y0}" width="{nw}" height="{nh}" rx="14" '
            f'fill="{s["box"]}" stroke="{accent}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 42}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="17" font-weight="700">{label}</text>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 72}" fill="{s["sub"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="12">{sub}</text>')
        if i < len(STATIONS) - 1:
            ax = x + nw + 6
            ay = y0 + nh // 2
            parts.append(
                f'<path d="M{ax} {ay}h{gap - 12}" stroke="{s["sub"]}" '
                f'stroke-width="3"/>')
            parts.append(
                f'<path d="M{ax + gap - 14} {ay - 7}l10 7-10 7" fill="none" '
                f'stroke="{s["sub"]}" stroke-width="3" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')

    # durable offline buffer strip under the pipeline (retry exhaustion lands here)
    bx, bw, by, bh = x0, nw * 4 + gap * 3, 272, 48
    for i in (2, 3):
        cx = x0 + i * (nw + gap) + nw // 2
        parts.append(
            f'<path d="M{cx} {y0 + nh}v{by - y0 - nh}" stroke="{FAMILY}" '
            f'stroke-width="2" stroke-dasharray="5 5"/>')
    parts.append(
        f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="10" '
        f'fill="{s["track"]}" stroke="{FAMILY}" stroke-width="2"/>')
    parts.append(
        f'<text x="{bx + bw // 2}" y="{by + 30}" fill="{s["text"]}" '
        f'text-anchor="middle" font-family="ui-monospace,monospace" '
        f'font-size="13">{SPOOL}</text>')
    parts.append(
        f'<text x="60" y="352" fill="{s["sub"]}" '
        f'font-family="ui-monospace,monospace" font-size="13">{SINKS}</text>')
    parts.append(
        f'<text x="60" y="380" fill="{s["sub"]}" '
        f'font-family="ui-monospace,monospace" font-size="13">{FOOTNOTE}</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin in ("light", "dark"):
        path = os.path.join(OUT, f"dsh-observe-flow-{skin}.svg")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
        print(f"wrote {os.path.relpath(path, ROOT)}")
    print("wrote 2 SVG flow assets to docs/assets/")


if __name__ == "__main__":
    main()
