from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]


def make_card(path, title, color, accent):
    image = Image.new("RGB", (360, 500), color)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((18, 18, 342, 482), radius=22, outline=accent, width=5)
    draw.ellipse((254, 36, 316, 98), outline=accent, width=4)
    draw.line((48, 385, 312, 92), fill=accent, width=3)
    draw.text((42, 416), title, fill=(246, 240, 231))
    image.save(path, quality=92)


examples = {
    "vtech": [
        ("card-01.png", "VTECH 01", (20, 76, 126), (235, 196, 119)),
        ("card-02.png", "VTECH 02", (42, 96, 138), (166, 190, 218)),
    ],
    "gameloft": [
        ("card-01.png", "GAME 01", (24, 67, 118), (235, 196, 119)),
        ("card-02.png", "GAME 02", (76, 80, 137), (166, 190, 218)),
        ("card-03.png", "GAME 03", (106, 73, 126), (235, 196, 119)),
    ],
}

for company, cards in examples.items():
    folder = ROOT / "content" / "experiences" / company / "cards"
    folder.mkdir(parents=True, exist_ok=True)
    for filename, title, color, accent in cards:
        make_card(folder / filename, title, color, accent)
