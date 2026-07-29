#!/usr/bin/env python3
"""Render an Instagram carousel by substituting text into a template
created with the web editor (web/index.html).

Usage:
    python3 scripts/generate.py --template szablon.json --content tresci.json [--outdir output] [--zip]

template.json  - exported from the web editor (background + text/image box positions/styles).
content.json   - {"slides": [{"<Etykieta pola>": "tekst lub ścieżka do zdjęcia", ...}, ...]}
                  Keys are matched against each box's label (case-insensitive) or its
                  internal id. For image boxes, the value is a path to a photo file
                  (relative paths are resolved against content.json's directory).
"""
import argparse
import base64
import io
import json
import re
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"

# Maps a keyword found in the CSS font-family string (from the web editor)
# to a bundled font family name. First match wins; anything unmatched falls
# back to Liberation Sans (metric-compatible with Arial). "serif" is checked
# last and excludes "sans-serif", since that substring would otherwise match too.
FONT_FAMILY_KEYWORDS = [
    ("dejavu", "DejaVuSans"),
    ("courier", "LiberationMono"),
    ("mono", "LiberationMono"),
    ("georgia", "LiberationSerif"),
    ("times", "LiberationSerif"),
]
DEFAULT_FAMILY = "LiberationSans"


def resolve_font_path(font_family, bold, italic):
    key = (font_family or "").lower()
    family = DEFAULT_FAMILY
    for keyword, fam in FONT_FAMILY_KEYWORDS:
        if keyword in key:
            family = fam
            break
    else:
        if "serif" in key and "sans-serif" not in key:
            family = "LiberationSerif"

    if family == "DejaVuSans":
        # Only Regular/Bold are bundled for DejaVu (no italic variants shipped).
        path = FONT_DIR / (f"{family}-Bold.ttf" if bold else f"{family}.ttf")
        return path if path.exists() else FONT_DIR / f"{family}.ttf"

    if bold and italic:
        suffix = "-BoldItalic"
    elif bold:
        suffix = "-Bold"
    elif italic:
        suffix = "-Italic"
    else:
        suffix = "-Regular"
    path = FONT_DIR / f"{family}{suffix}.ttf"
    return path if path.exists() else FONT_DIR / f"{family}-Regular.ttf"


def get_font(box, size, cache):
    path = resolve_font_path(box.get("fontFamily"), box.get("bold"), box.get("italic"))
    key = (str(path), size)
    if key not in cache:
        cache[key] = ImageFont.truetype(str(path), size)
    return cache[key]


def wrap_text(draw, font, text, max_width):
    paragraphs = str(text or "").split("\n")
    lines = []
    for paragraph in paragraphs:
        words = [w for w in paragraph.split() if w]
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if draw.textlength(candidate, font=font) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def fit_text(draw, box, text, px_width, px_height, font_cache):
    max_size = box.get("fontSize", 32)
    auto_fit = box.get("autoFit", False)
    min_size = min(box.get("minFontSize", 12), max_size) if auto_fit else max_size

    size = max_size
    lines = []
    while size >= min_size:
        font = get_font(box, size, font_cache)
        lines = wrap_text(draw, font, text, px_width)
        line_height = size * box.get("lineHeight", 1.2)
        total_height = len(lines) * line_height
        if total_height <= px_height or size == min_size or not auto_fit:
            break
        size -= 1
    return size, lines


def draw_text_box(draw, box, text, canvas_w, canvas_h, font_cache):
    px = box["x"] * canvas_w
    py = box["y"] * canvas_h
    pw = box["width"] * canvas_w
    ph = box["height"] * canvas_h

    size, lines = fit_text(draw, box, text, pw, ph, font_cache)
    font = get_font(box, size, font_cache)
    line_height = size * box.get("lineHeight", 1.2)
    total_height = len(lines) * line_height

    valign = box.get("valign", "middle")
    if valign == "top":
        start_y = py
    elif valign == "bottom":
        start_y = py + ph - total_height
    else:
        start_y = py + (ph - total_height) / 2

    align = box.get("align", "center")
    color = box.get("color", "#000000")

    for i, line in enumerate(lines):
        line_top = start_y + i * line_height
        ascent = size * 0.8  # matches the canvas-based web preview
        baseline_y = line_top + ascent
        if align == "left":
            x, anchor = px, "ls"
        elif align == "right":
            x, anchor = px + pw, "rs"
        else:
            x, anchor = px + pw / 2, "ms"
        draw.text((x, baseline_y), line, font=font, fill=color, anchor=anchor)


def composite_image_box(base_image, box, photo, canvas_w, canvas_h):
    if photo is None:
        return
    px = round(box["x"] * canvas_w)
    py = round(box["y"] * canvas_h)
    pw = round(box["width"] * canvas_w)
    ph = round(box["height"] * canvas_h)
    if pw <= 0 or ph <= 0:
        return

    photo = photo.convert("RGBA")
    iw, ih = photo.size
    fit = box.get("fit", "cover")
    scale = min(pw / iw, ph / ih) if fit == "contain" else max(pw / iw, ph / ih)
    new_w, new_h = max(1, round(iw * scale)), max(1, round(ih * scale))
    resized = photo.resize((new_w, new_h), Image.LANCZOS)

    if fit == "contain":
        dx = px + (pw - new_w) // 2
        dy = py + (ph - new_h) // 2
        base_image.paste(resized, (dx, dy), resized)
        return

    left = (new_w - pw) // 2
    top = (new_h - ph) // 2
    cropped = resized.crop((left, top, left + pw, top + ph))

    radius = round(box.get("cornerRadius", 0) * min(pw, ph))
    if radius > 0:
        mask = Image.new("L", (pw, ph), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, ph], radius=radius, fill=255)
        base_image.paste(cropped, (px, py), mask)
    else:
        base_image.paste(cropped, (px, py))


def draw_progress_dots(draw, config, total, current_index, canvas_w, canvas_h):
    if not config or not config.get("enabled") or not total:
        return
    dot_size = config.get("dotSize", 0.022) * canvas_w
    gap = config.get("gap", 0.012) * canvas_w
    start_x = config.get("x", 0.08) * canvas_w
    center_y = config.get("y", 0.9) * canvas_h
    active_color = config.get("activeColor", "#D2B069")
    inactive_color = config.get("inactiveColor", "#ffffff")
    inactive_border = config.get("inactiveBorderColor", "#D2B069")

    for i in range(total):
        cx = start_x + i * (dot_size + gap) + dot_size / 2
        r = dot_size / 2
        bbox = [cx - r, center_y - r, cx + r, center_y + r]
        if i <= current_index:
            draw.ellipse(bbox, fill=active_color)
        else:
            draw.ellipse(bbox, fill=inactive_color, outline=inactive_border, width=max(1, round(dot_size * 0.06)))


def load_template(template_path):
    template_path = Path(template_path)
    data = json.loads(template_path.read_text(encoding="utf-8"))
    image_data_url = data.get("imageDataUrl")
    if image_data_url:
        _, b64data = image_data_url.split(",", 1)
        image = Image.open(io.BytesIO(base64.b64decode(b64data))).convert("RGBA")
    else:
        image_path = template_path.parent / data["image"]
        image = Image.open(image_path).convert("RGBA")
    return data, image


def get_slide_value(slide, box):
    if box["id"] in slide:
        return slide[box["id"]]
    label = box.get("label", "").strip().lower()
    for key, value in slide.items():
        if key.strip().lower() == label:
            return value
    return ""


def slugify(name):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "karuzela"


def generate(template_path, content_path, outdir, prefix=None, make_zip=False):
    template, base_image = load_template(template_path)
    content_path = Path(content_path)
    content = json.loads(content_path.read_text(encoding="utf-8"))
    slides = content["slides"]

    canvas_w = template.get("width", base_image.width)
    canvas_h = template.get("height", base_image.height)
    if base_image.size != (canvas_w, canvas_h):
        base_image = base_image.resize((canvas_w, canvas_h))

    prefix = prefix or slugify(template.get("name", "karuzela"))
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    image_boxes = template.get("imageBoxes", [])
    progress_dots = template.get("progressDots")
    total_slides = len(slides)

    font_cache = {}
    output_paths = []
    for i, slide in enumerate(slides, start=1):
        image = base_image.copy()

        for box in image_boxes:
            photo_ref = get_slide_value(slide, box)
            photo = None
            if photo_ref:
                photo_path = Path(photo_ref)
                if not photo_path.is_absolute():
                    photo_path = content_path.parent / photo_path
                photo = Image.open(photo_path)
            composite_image_box(image, box, photo, canvas_w, canvas_h)

        draw = ImageDraw.Draw(image)
        for box in template["textBoxes"]:
            text = get_slide_value(slide, box)
            draw_text_box(draw, box, text, canvas_w, canvas_h, font_cache)
        draw_progress_dots(draw, progress_dots, total_slides, i - 1, canvas_w, canvas_h)

        out_path = outdir / f"{prefix}-{i:02d}.png"
        image.convert("RGB").save(out_path, "PNG")
        output_paths.append(out_path)
        print(f"Zapisano {out_path}")

    if make_zip:
        zip_path = outdir / f"{prefix}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in output_paths:
                zf.write(path, path.name)
        print(f"Spakowano do {zip_path}")

    return output_paths


def main():
    parser = argparse.ArgumentParser(description="Generuje karuzelę na Instagram z szablonu i treści.")
    parser.add_argument("--template", required=True, help="Ścieżka do template.json (z edytora web/index.html)")
    parser.add_argument("--content", required=True, help="Ścieżka do content.json ({'slides': [...]})")
    parser.add_argument("--outdir", default="output", help="Katalog wyjściowy (domyślnie: output)")
    parser.add_argument("--prefix", default=None, help="Prefiks nazw plików (domyślnie: nazwa szablonu)")
    parser.add_argument("--zip", action="store_true", help="Dodatkowo spakuj wynik do .zip")
    args = parser.parse_args()

    generate(args.template, args.content, args.outdir, args.prefix, args.zip)


if __name__ == "__main__":
    main()
