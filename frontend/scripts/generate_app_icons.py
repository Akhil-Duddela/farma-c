#!/usr/bin/env python3
"""Generate Farm-C AI favicon + app icons (Pillow). Run from repo: python3 frontend/scripts/generate_app_icons.py"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Brand / farm + poultry theme
BG = (47, 93, 58, 255)  # --fc-forest
SUN = (244, 196, 48, 255)
CHICKEN_BODY = (240, 160, 32, 255)
CHICKEN_HIGHLIGHT = (255, 218, 99, 255)
BEAK = (232, 106, 26, 255)
COMB = (194, 59, 59, 255)
EYE = (31, 42, 36, 255)
GRASS = (74, 122, 82, 200)


def draw_icon(size: int) -> Image.Image:
    s = max(16, size)
    r = int(s * 0.19)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=BG)

    # Sun (poultry / farm warmth)
    sun_r = max(2, s // 14)
    draw.ellipse(
        [s - sun_r * 3 - 2, sun_r // 2, s - 2, sun_r * 2 + sun_r // 2 + 2],
        fill=SUN,
    )

    cx, cy = s // 2, int(s * 0.58)
    rx, ry = int(s * 0.22), int(s * 0.19)
    draw.ellipse(
        [cx - rx, cy - ry, cx + rx, cy + ry],
        fill=CHICKEN_BODY,
    )
    if s >= 32:
        draw.ellipse(
            [cx - int(rx * 0.85), cy - int(ry * 0.9), cx + int(rx * 0.85), cy + int(ry * 0.78)],
            fill=CHICKEN_HIGHLIGHT,
        )

    hr = max(2, int(s * 0.14))
    hy = int(s * 0.34)
    draw.ellipse(
        [cx - hr, hy - hr, cx + hr, hy + hr],
        fill=CHICKEN_HIGHLIGHT,
    )

    if s >= 32:
        comb = [
            (cx - hr, hy - int(hr * 0.75)),
            (cx - int(hr * 0.15), hy - int(hr * 1.25)),
            (cx + int(hr * 0.25), hy - int(hr * 0.9)),
            (cx + int(hr * 0.5), hy - int(hr * 1.2)),
            (cx + hr, hy - int(hr * 0.65)),
        ]
        draw.polygon(comb, fill=COMB)

    beak = [
        (cx + int(hr * 0.35), hy - int(hr * 0.05)),
        (cx + int(hr * 1.35), hy + int(hr * 0.15)),
        (cx + int(hr * 0.35), hy + int(hr * 0.45)),
    ]
    draw.polygon(beak, fill=BEAK)

    if s >= 24:
        er = max(1, s // 50)
        ex, ey = cx - int(hr * 0.35), hy - int(hr * 0.08)
        draw.ellipse([ex - er * 2, ey - er * 2, ex + er * 2, ey + er * 2], fill=EYE)
    if s >= 48:
        ex, ey = cx - int(hr * 0.32), hy - int(hr * 0.1)
        er2 = max(1, s // 120)
        draw.ellipse(
            [ex - er2, ey - er2, ex + er2, ey + er2],
            fill=(255, 255, 255, 255),
        )

    gy = int(s * 0.82)
    gh = max(1, s // 42)
    draw.rounded_rectangle(
        [s // 8, gy, s - s // 8, gy + gh],
        radius=max(1, gh // 2),
        fill=GRASS,
    )
    return img


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    icons = root / "src" / "assets" / "icons"
    icons.mkdir(parents=True, exist_ok=True)

    for name, sz in (
        ("favicon-16x16.png", 16),
        ("favicon-32x32.png", 32),
        ("apple-touch-icon.png", 180),
        ("android-chrome-192x192.png", 192),
        ("android-chrome-512x512.png", 512),
    ):
        draw_icon(sz).save(icons / name, "PNG", optimize=True)

    im16 = draw_icon(16)
    im32 = draw_icon(32)
    ico = root / "src" / "favicon.ico"
    im16.save(ico, format="ICO", sizes=[(16, 16), (32, 32)], append_images=[im32])
    im16.save(icons / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)], append_images=[im32])
    print("Wrote:", icons, "and", ico)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
