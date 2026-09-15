from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "logos"
OUT = SRC / "web"
COLOR = (166, 179, 196)


def alpha_from_white(pixel, minimum=175):
    r, g, b, a = pixel
    if a == 0:
        return 0
    if min(r, g, b) < minimum:
        return 0
    if max(r, g, b) - min(r, g, b) > 64:
        return 0
    return max(0, min(255, int((min(r, g, b) - minimum) / (255 - minimum) * 255)))


def alpha_from_dark(pixel, maximum=138):
    r, g, b, a = pixel
    if a == 0:
        return 0
    if max(r, g, b) > maximum:
        return 0
    return max(0, min(255, int((maximum - max(r, g, b)) / maximum * 255)))


def crop_to_content(image):
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return image
    return image.crop(bbox)


def keep_components(mask, min_area=80, keep_largest=False):
    width, height = mask.size
    src = mask.load()
    visited = bytearray(width * height)
    components = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or src[x, y] == 0:
                continue
            visited[index] = 1
            queue = deque([(x, y)])
            pixels = []
            while queue:
                px, py = queue.popleft()
                pixels.append((px, py))
                for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    nindex = ny * width + nx
                    if visited[nindex] or src[nx, ny] == 0:
                        continue
                    visited[nindex] = 1
                    queue.append((nx, ny))
            components.append(pixels)

    if not components:
        return mask

    kept = [max(components, key=len)] if keep_largest else [c for c in components if len(c) >= min_area]
    clean = Image.new("L", mask.size, 0)
    dst = clean.load()
    for component in kept:
        for x, y in component:
            dst[x, y] = src[x, y]
    return clean


def build_logo(source_name, output_name, crop_box, alpha_fn, min_area=80, keep_largest=False):
    source = Image.open(SRC / source_name).convert("RGBA")
    if crop_box:
        source = source.crop(crop_box)

    mask = Image.new("L", source.size, 0)
    source_pixels = source.load()
    mask_pixels = mask.load()
    for y in range(source.height):
        for x in range(source.width):
            mask_pixels[x, y] = alpha_fn(source_pixels[x, y])

    mask = keep_components(mask, min_area=min_area, keep_largest=keep_largest)
    result = Image.new("RGBA", source.size, (*COLOR, 0))
    result.putalpha(mask)
    result = crop_to_content(result)
    result.save(OUT / output_name)


def main():
    OUT.mkdir(exist_ok=True)
    build_logo("vtech logo.png", "vtech-wordmark.png", None, alpha_from_white, min_area=90, keep_largest=False)
    build_logo("Gameloft_logo.png", "gameloft-g.png", (0, 0, 269, 142), alpha_from_dark, min_area=180, keep_largest=True)
    build_logo("funplus_logo.png", "funplus-icon.png", (0, 0, 200, 132), alpha_from_white, min_area=120, keep_largest=False)

    preview = Image.new("RGBA", (540, 88), (3, 13, 28, 255))
    for index, name in enumerate(("vtech-wordmark.png", "gameloft-g.png", "funplus-icon.png")):
        logo = Image.open(OUT / name).convert("RGBA")
        scale = min(132 / logo.width, 54 / logo.height)
        logo = logo.resize((max(1, round(logo.width * scale)), max(1, round(logo.height * scale))), Image.Resampling.LANCZOS)
        x = index * 180 + (180 - logo.width) // 2
        y = (88 - logo.height) // 2
        preview.alpha_composite(logo, (x, y))
    preview.save(OUT / "logo-preview.png")


if __name__ == "__main__":
    main()
