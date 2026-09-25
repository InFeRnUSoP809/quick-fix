// One-off PWA icon generator: renders public/logo.svg to PNG sizes in public/icons.
// Run with: bun scripts/generate-icons.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("sharp is not installed. Run: bun add -d sharp");
    process.exit(1);
  }

  const svg = readFileSync("public/logo.svg");
  mkdirSync("public/icons", { recursive: true });

  const targets = [
    { file: "public/icons/icon-192.png", size: 192 },
    { file: "public/icons/icon-512.png", size: 512 },
    // Maskable: safe zone = 80% of canvas, so render the mark smaller on a solid tile.
    { file: "public/icons/icon-maskable-512.png", size: 512, maskable: true },
  ];

  for (const { file, size, maskable } of targets) {
    let svgText = svg.toString("utf8");
    if (maskable) {
      // Expand viewBox content padding for the maskable safe zone.
      svgText = svgText.replace(
        'viewBox="0 0 96.81 96.81"',
        'viewBox="-9 -9 114.81 114.81"',
      );
    }
    await sharp(Buffer.from(svgText))
      .resize(size, size)
      .png()
      .toFile(file);
    console.log("wrote", file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
