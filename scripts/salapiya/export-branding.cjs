// Render protected SVG sources without modifying their geometry or colors.
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const root = "apps/salapiya/assets/branding";
  const entries = [
    ["source/salapiya_original.svg", 944, 794],
    ["mark/salapiya_mark.svg", 768, 771],
    ["horizontal/salapiya_horizontal_on_light.svg", 1441, 463],
    ["horizontal/salapiya_horizontal_on_dark.svg", 1441, 463],
    ["vertical/salapiya_vertical_on_light.svg", 944, 794],
    ["vertical/salapiya_vertical_on_dark.svg", 944, 794],
  ];
  const manifest = [];
  fs.mkdirSync(path.join(root, "display"), { recursive: true });
  for (const [source, width, height] of entries) {
    const bytes = fs.readFileSync(path.join(root, source));
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      '<body style="margin:0;background:transparent"><img style="display:block;width:100%;height:100%;object-fit:contain" src="data:image/svg+xml;base64,' +
        bytes.toString("base64") +
        '"></body>',
    );
    await page.locator("img").evaluate((img) => img.decode());
    const output = "display/" + path.basename(source, ".svg") + ".png";
    await page.screenshot({
      path: path.join(root, output),
      omitBackground: true,
    });
    manifest.push({
      source,
      output,
      width,
      height,
      sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      outputSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, output)))
        .digest("hex"),
      renderer: await browser.version(),
    });
    await page.close();
  }
  fs.writeFileSync(
    path.join(root, "display/manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await browser.close();
  console.log("Exported six transparent source-faithful display references.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
