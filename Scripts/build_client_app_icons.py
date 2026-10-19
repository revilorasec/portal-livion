"""Build square PWA icons from the unchanged V.Tal wordmark."""

from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
source = Image.open(root / "assets/client-logos/vtal.png").convert("RGBA")
out = root / "assets/app-icons"

for size in (64, 180, 192, 512):
    canvas = Image.new("RGBA", (size, size), "#ffffff")
    draw = ImageDraw.Draw(canvas)
    margin = round(size * 0.045)
    draw.rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=round(size * 0.19),
        fill="#f8f9fc",
        outline="#dfe5ee",
        width=max(1, round(size * 0.01)),
    )
    logo = source.copy()
    logo.thumbnail((round(size * 0.76), round(size * 0.76)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    canvas.convert("RGB").save(out / f"vtal-{size}.png", optimize=True)
