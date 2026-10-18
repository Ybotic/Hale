import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const output = fileURLToPath(new URL("../public/patient/", import.meta.url));
await mkdir(output, { recursive: true });
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#244C37"/><g transform="translate(96 96) scale(5)"><path d="M47 16C29 13 16 21 18 35c1 9 9 13 16 10 12-5 13-19 13-29Z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M17 49 37 28" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g></svg>`);
for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180], ["icon-maskable-512.png", 512]]) {
  await sharp(svg).resize(size, size).png().toFile(`${output}/${file}`);
}
