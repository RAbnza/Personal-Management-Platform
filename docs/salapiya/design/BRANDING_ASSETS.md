# Existing branding asset register

**Status:** Existing assets are owner-supplied and must remain unchanged. Usage
sizes and spacing below are D0 proposals, subject to D1 native visual proof.
All paths below are relative to `apps/salapiya/assets/branding/`.

## Inspected files

| Asset / link                                                                                                                      | Intrinsic dimensions; viewBox       | Bytes  | Intended use                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| [source/salapiya_original.svg](../../../apps/salapiya/assets/branding/source/salapiya_original.svg)                               | 1888×1588; `0 0 1416 1190.999948`   | 167477 | Archival source; mixed original wordmark/tagline colors, not an automatic runtime variant |
| [mark/salapiya_mark.svg](../../../apps/salapiya/assets/branding/mark/salapiya_mark.svg)                                           | 1486×1491; `0 0 1114.5 1118.250011` | 136338 | Symbol on light or dark; compact shell, About or identity region                          |
| [horizontal/salapiya_horizontal_on_light.svg](../../../apps/salapiya/assets/branding/horizontal/salapiya_horizontal_on_light.svg) | 1441×463; `0 0 1080.75 347.249998`  | 166550 | Wide welcome/about on Porcelain or white                                                  |
| [horizontal/salapiya_horizontal_on_dark.svg](../../../apps/salapiya/assets/branding/horizontal/salapiya_horizontal_on_dark.svg)   | Same horizontal geometry            | 166550 | Wide welcome/about on Midnight Spectrum                                                   |
| [vertical/salapiya_vertical_on_light.svg](../../../apps/salapiya/assets/branding/vertical/salapiya_vertical_on_light.svg)         | Same geometry as source             | 167473 | Portrait welcome/about on Porcelain or white                                              |
| [vertical/salapiya_vertical_on_dark.svg](../../../apps/salapiya/assets/branding/vertical/salapiya_vertical_on_dark.svg)           | Same geometry as source             | 167473 | Portrait welcome/about on Midnight Spectrum                                               |

Resolve the links above from this document; their targets are the existing assets,
not copies. Product name: **Salapiya**. Tagline: **Your money, on your terms.**

The mark's violet/lavender wings and highlighted pearl remain consistent across
the files. The light wordmark paths use `#553995` with `#8361B2` supporting
lettering; dark variants use `#F8F8F8` and `#F4DDFF`. These observations do not
authorize extracting/replacing the symbol colors with UI tokens.

## Rendering findings and integrity

All six XML documents parse. Each contains two embedded PNG image elements
declaring 338×339 dimensions, two filters using color matrices, a mask and
clipping. Wordmark/tagline lettering is represented by paths. The symbol-only
file has only one path plus its embedded-image composition: it is **not an
all-vector drawing**, despite its SVG extension.

Browser inspection of the unmodified assets shows transparent surrounding
regions, correct supplied light/dark variants, and no added background. The
archival source has a pale wordmark that is barely visible on Porcelain; use
the supplied `on_light` variant there. Do not “repair” the original.

Rendered inspection used installed Edge through Playwright after the bundled
headless Chromium binary was unavailable. Local contact sheet:
`out/salapiya-d0/branding-inspection.png` (ignored review aid, not a new asset).
This proves browser appearance only. It does not establish Flutter SVG parser,
mask/filter fidelity, tiny-size legibility or launcher suitability.

The [flutter_svg package](https://pub.dev/packages/flutter_svg) is a candidate
renderer, not evidence that these particular files work. D1 must compare all
six on both themes in Windows and Android against the browser reference.
Check masks, embedded-image sampling, colors, alpha edges, clipping and scaling.
If fidelity fails, keep the originals; propose visually faithful, transparent
raster display derivatives with recorded source hash and export dimensions.
Review those derivatives before adoption. Do not flatten onto a background,
remove filters blindly, recolor or redraw as a workaround. Launcher icon exports
are a separate later assignment.

| File             | SHA-256 at D0 inspection                                           |
| ---------------- | ------------------------------------------------------------------ |
| Original         | `5f6f711dfc2b4019f2253cbb122b083f35227842f43249b861a99e3f970c06b1` |
| Mark             | `f223376778b191c77115193cbf8952686ba2955a872ff9f5682a804e887b2813` |
| Horizontal light | `d43fda57aee08873886d74443bfc1ec9582aada970d03c47f50b3b7374789fec` |
| Horizontal dark  | `2c70019fc683db470f97d4f9ad24aca8b5c7808bc356f263801852e7ebd56142` |
| Vertical light   | `68a22a5f30fab3c0d9f1defff70347dd73592f7a802d74ee0fffd2a738240502` |
| Vertical dark    | `cbf5c996fad731be5f4143d5273a81a7571e33751ab1355d0755ca819897b0aa` |

## Usage and spacing proposal

- Always contain the full asset at its original aspect ratio. No stretch,
  cropping, rotation, tint, color filter, opacity change, recoloring, added
  outline, monochrome variant or changed internal composition.
- Let **S** be the rendered symbol height. Add at least **S/4** clear space
  outside the full asset bounds on every side; native asset whitespace is
  preserved and not counted as permission to crop. For lockups, compute S from
  the symbol within the full image. D1 records the measured layout value.
- In compact rail/toolbar use the mark at **40–48 logical pixels** initially.
  Test 24, 32, 40, 48 and 96; 24/32 are comparison sizes, not approved minima.
  Interactive container is at least 48×48, independently of image size.
- The full horizontal lockup includes a small tagline. Begin proof at **560
  logical pixels wide**; the vertical lockup at **320 wide**. These conservative
  starting sizes are not a guarantee of tagline readability. At smaller widths
  use the unmodified mark with the product name/tagline as ordinary separately
  laid-out accessible UI text, not a new exported lockup.
- Expanded rail is too narrow for the full horizontal lockup. Use the mark in
  its identity region and a separate “Salapiya” application heading. Do not
  squeeze or crop the supplied wordmark. Onboarding at large text scale should
  similarly prioritize readable text and entry choices.
- Use the symbol alone on either approved opaque theme. Use matching full
  light/dark lockups only on compatible surfaces; do not place branding over
  a busy pattern, chart, photo or translucent changing background.
- Give a meaningful standalone image the semantic label “Salapiya.” If adjacent
  UI already names the app, exclude the duplicate image from semantics. Present
  the tagline in accessible text when it conveys welcome content.
- A brand image is not a loading spinner, sync-state indicator, home-button
  substitute without a label, or currency icon. No pulsing pearl or wing-flap
  animation is planned.

The application pubspec does not yet declare these branding assets. D1 should
bundle only the runtime files it uses after rendering validation; retain the
source in Git. File existence is not proof of app bundling or correct runtime
display.

The existing native launcher resources are Flutter development placeholders.
Do not report them as Salapiya Windows icons, Android adaptive icons, themed
monochrome icons or store exports. The owner expressly prohibits a monochrome
symbol; later platform work must disclose any conflicting optional icon
treatment rather than create one silently.
