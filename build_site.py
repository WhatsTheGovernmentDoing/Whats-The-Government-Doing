"""Build the static action site from the pipeline's own files.

Reads  Bills/<n>/action.json  (letter content, one per publishable bill)
       Bills/<n>/high-stakes-carousel | watch-carousel  (slide PNGs)
       Roundups/*, Primers/*, Glossary, Progress-Updates/*  (extra graphics)
Writes Site/assets/data.js  (window.SITE_DATA — embedded so the site works
       from file:// with zero fetches) and copies all graphics + fonts in.

Re-run after any new bill is rendered or an action.json changes:
    python Site/build_site.py
"""

import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parent
ROOT = SITE.parent
FONT_SRC = Path.home() / ".claude" / "skills" / "canvas-design" / "canvas-fonts"

FONTS = [
    "BigShoulders-Bold.ttf",
    "BigShoulders-Regular.ttf",
    "IBMPlexMono-Regular.ttf",
    "IBMPlexMono-Bold.ttf",
    "WorkSans-Regular.ttf",
    "WorkSans-Bold.ttf",
    "WorkSans-Italic.ttf",
    "IBMPlexSerif-Regular.ttf",
    "IBMPlexSerif-Italic.ttf",
    "BigShoulders-OFL.txt",
    "IBMPlexMono-OFL.txt",
    "WorkSans-OFL.txt",
]

REGISTER_RANK = {"alarm": 0, "concern": 1, "explain": 2}


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def copy_pngs(src_dir: Path, dest_dir: Path, web_prefix: str):
    """Copy sorted PNGs from src_dir into dest_dir; return web paths."""
    pngs = sorted(src_dir.glob("*.png"), key=natural_key)
    if not pngs:
        return []
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = []
    for p in pngs:
        shutil.copy2(p, dest_dir / p.name)
        out.append(f"{web_prefix}/{p.name}")
    return out


def build_bills(graphics_root: Path):
    bills = []
    for aj in sorted(ROOT.glob("Bills/*/action.json")):
        data = json.loads(aj.read_text(encoding="utf-8"))
        if data.get("draft"):
            print(f"  (draft, excluded from site: {data['bill']} — awaiting approval)")
            continue
        if data.get("status") == "died":
            print(f"  (died, excluded from site: {data['bill']})")
            continue
        folder = aj.parent
        carousel = None
        for name in ("high-stakes-carousel", "watch-carousel"):
            if (folder / name).is_dir():
                carousel = folder / name
                break
        code = data["bill"]
        data["graphics"] = (
            copy_pngs(carousel, graphics_root / code, f"graphics/{code}")
            if carousel
            else []
        )
        bills.append(data)

    def sort_key(b):
        active = 1 if b["status"] == "law" else 0
        return (REGISTER_RANK.get(b["register"], 9), active, natural_key(Path(b["bill"])))

    bills.sort(key=sort_key)
    return bills


def prettify(name: str) -> str:
    return name.replace("-", " ").replace("_", " ").strip().title()


def build_extras(graphics_root: Path):
    """Roundups / Primers / Glossary / Progress-Updates -> gallery sections."""
    extras = []
    sources = [
        ("Roundups", "Weekly Roundups"),
        ("Progress-Updates", "Progress Updates"),
        ("Primers", "Primers"),
    ]
    for folder, section in sources:
        base = ROOT / folder
        if not base.is_dir():
            continue
        subdirs = sorted([d for d in base.iterdir() if d.is_dir()], reverse=True)
        for d in subdirs:
            slug = f"extras/{d.name}"
            images = copy_pngs(d, graphics_root / "extras" / d.name, f"graphics/{slug}")
            if images:
                extras.append(
                    {"section": section, "name": prettify(d.name), "images": images}
                )
    gl = ROOT / "Glossary"
    if gl.is_dir():
        images = copy_pngs(gl, graphics_root / "extras" / "glossary", "graphics/extras/glossary")
        if images:
            extras.append(
                {"section": "Reference", "name": "Plain-Language Glossary", "images": images}
            )
    return extras


def load_senators():
    p = SITE / "senators.json"
    if not p.exists():
        print("  ! senators.json missing — run: python Site/fetch_senators.py", file=sys.stderr)
        return []
    return json.loads(p.read_text(encoding="utf-8"))


def make_maple_stamp():
    """Tint the project's maple stamp asset vermilion for the masthead."""
    src = ROOT / "Graphics" / "assets" / "stamps" / "stamp_leaf.png"
    dest = SITE / "assets" / "maple-stamp.png"
    if not src.exists():
        print("  ! stamp_leaf.png not found — masthead stamp skipped", file=sys.stderr)
        return
    try:
        from PIL import Image
        img = Image.open(src).convert("RGBA")
        solid = Image.new("RGBA", img.size, (181, 58, 38, 255))  # vermilion ACC
        solid.putalpha(img.getchannel("A"))
        solid.save(dest)
    except Exception as e:
        print(f"  ! stamp tint failed ({e}); copying untinted", file=sys.stderr)
        shutil.copy2(src, dest)


def make_icons():
    """App/PWA icons: the vermilion maple stamp on paper, from the project asset."""
    src = ROOT / "Graphics" / "assets" / "stamps" / "stamp_leaf.png"
    dest = SITE / "assets" / "icons"
    if not src.exists():
        print("  ! stamp_leaf.png not found — icons skipped", file=sys.stderr)
        return
    try:
        from PIL import Image
        stamp = Image.open(src).convert("RGBA")
        tinted = Image.new("RGBA", stamp.size, (181, 58, 38, 255))
        tinted.putalpha(stamp.getchannel("A"))
        dest.mkdir(parents=True, exist_ok=True)
        for size in (512, 192, 180):
            canvas = Image.new("RGBA", (size, size), (249, 246, 238, 255))  # paper
            # keep the mark inside the maskable safe zone (~80% circle)
            mark = tinted.resize((int(size * 0.68), int(size * 0.68)), Image.LANCZOS)
            off = (size - mark.width) // 2
            canvas.alpha_composite(mark, (off, off))
            canvas.convert("RGB").save(dest / f"icon-{size}.png")
    except Exception as e:
        print(f"  ! icon generation failed ({e})", file=sys.stderr)


def copy_fonts():
    dest = SITE / "fonts"
    dest.mkdir(exist_ok=True)
    missing = []
    for f in FONTS:
        src = FONT_SRC / f
        if src.exists():
            shutil.copy2(src, dest / f)
        else:
            missing.append(f)
    if missing:
        print(f"  ! fonts not found (skipped): {', '.join(missing)}", file=sys.stderr)


def main():
    graphics_root = SITE / "graphics"
    if graphics_root.exists():
        shutil.rmtree(graphics_root)

    bills = build_bills(graphics_root)
    extras = build_extras(graphics_root)
    copy_fonts()
    (SITE / "assets").mkdir(exist_ok=True)
    make_maple_stamp()
    make_icons()

    payload = {
        "generated": date.today().isoformat(),
        "bills": bills,
        "extras": extras,
        "senators": load_senators(),
    }
    js = "window.SITE_DATA = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n"
    (SITE / "assets" / "data.js").write_text(js, encoding="utf-8")

    n_slides = sum(len(b["graphics"]) for b in bills) + sum(len(e["images"]) for e in extras)
    print(f"Built: {len(bills)} bills, {len(extras)} extra galleries, {n_slides} slides copied.")
    for b in bills:
        tag = "law" if b["status"] == "law" else b["status"]
        print(f"  [{b['register'].upper():7}] {b['bill']:6} {tag:15} slides={len(b['graphics'])}")


if __name__ == "__main__":
    main()
