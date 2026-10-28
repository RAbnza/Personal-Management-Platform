"""Export native resources from the approved PNG; never capture a UI surface.

Requires Pillow 11.2.1. --check verifies committed hashes and regenerated pixels.
The Android monochrome derivative is explicitly authorized by the P6 assignment.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "apps/salapiya"
SOURCE = APP / "assets/branding/display/salapiya_mark.png"
SOURCE_SHA = "f8139c0a613fd040d0534927bf4c2c6c59e756f144b28ceb6cbce3fb7e519029"
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]


def generate():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA
    mark = Image.open(SOURCE).convert("RGBA")
    outputs = {}

    def contain(size, fraction):
        # Preserve all source whitespace, colors and aspect ratio.
        image = Image.new("RGBA", (size, size))
        scaled = mark.copy()
        scaled.thumbnail((round(size * fraction), round(size * fraction)), Image.Resampling.LANCZOS)
        image.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
        return image

    def png(path, image):
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        outputs[path] = stream.getvalue()

    stream = io.BytesIO()
    base = contain(256, .88)
    frames = [contain(size, .88) for size in SIZES[:-1]]
    base.save(stream, format="ICO", sizes=[(s, s) for s in SIZES], append_images=frames)
    outputs["windows/runner/resources/app_icon.ico"] = stream.getvalue()
    for density, scale in [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)]:
        png(f"android/app/src/main/res/mipmap-{density}/ic_launcher.png", contain(round(48 * scale), .8))
        foreground = contain(round(108 * scale), 46 / 108)
        png(f"android/app/src/main/res/drawable-{density}/ic_launcher_foreground.png", foreground)
        mono = Image.new("RGBA", foreground.size, "white")
        mono.putalpha(foreground.getchannel("A"))
        png(f"android/app/src/main/res/drawable-{density}/ic_launcher_monochrome.png", mono)
        # Every nontransparent pixel is inside the guaranteed 66dp circular safe zone.
        alpha = foreground.getchannel("A")
        center = foreground.width / 2
        assert all((x + .5 - center) ** 2 + (y + .5 - center) ** 2 <= (33 * scale) ** 2
                   for y in range(alpha.height) for x in range(alpha.width) if alpha.getpixel((x, y)))
    manifest = {"source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"), "sourceSha256": SOURCE_SHA,
                "generator": "Pillow 11.2.1", "windowsSizes": SIZES,
                "androidAdaptiveCanvasDp": 108, "androidMarkBoxDp": 46,
                "androidBackground": "#F3F4F6", "monochrome": "original alpha silhouette; P6 authorized",
                "outputs": {p: hashlib.sha256(b).hexdigest() for p, b in sorted(outputs.items())}}
    outputs["assets/branding/native-icons.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    return outputs


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = generate()
    manifest_name = "assets/branding/native-icons.json"
    if args.check:
        committed = json.loads((APP / manifest_name).read_text(encoding="utf-8"))
        regenerated = json.loads(generated[manifest_name])
        assert {k: v for k, v in committed.items() if k != "outputs"} == {
            k: v for k, v in regenerated.items() if k != "outputs"
        }, "Stale native icon metadata"
        assert set(committed["outputs"]) == set(generated) - {manifest_name}
    for name, data in generated.items():
        path = APP / name
        if args.check:
            if name == manifest_name:
                continue
            actual = path.read_bytes()
            assert hashlib.sha256(actual).hexdigest() == committed["outputs"][name], f"Changed committed icon: {name}"
            # Pillow wheels can use different zlib builds on Windows and Linux.
            # Preserve strict pixel equality and committed byte hashes rather
            # than requiring identical compression across those platforms.
            expected_image = Image.open(io.BytesIO(data))
            actual_image = Image.open(io.BytesIO(actual))
            if name.endswith(".ico"):
                assert actual_image.ico.sizes() == expected_image.ico.sizes()
                pairs = [(actual_image.ico.getimage(size), expected_image.ico.getimage(size))
                         for size in expected_image.ico.sizes()]
            else:
                pairs = [(actual_image, expected_image)]
            for packed, expected in pairs:
                assert packed.size == expected.size and packed.convert("RGBA").tobytes() == expected.convert("RGBA").tobytes(), f"Stale native icon pixels: {name}"
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print("Verified native icon resources." if args.check else "Generated native icon resources; no screenshots.")
