// Fix wrong width/height in the DB for "MC Office": set each photo's dimensions
// to the REAL post-rotation size (the images on R2 are already correct).
// DRY_RUN=1 to preview. Run: node --env-file=.env.local scripts/fix-dims.mjs
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = process.env.SRC_DIR || "E:/DCIM/100MSDCF";
const DRY_RUN = process.env.DRY_RUN === "1";
const db = new PrismaClient();

const gallery = await db.gallery.findFirst({ where: { name: "MC Office" } });
const photos = await db.galleryPhoto.findMany({ where: { galleryId: gallery.id }, orderBy: { order: "asc" } });

let fixed = 0;
for (const p of photos) {
  const src = path.join(SRC_DIR, p.filename);
  if (!fs.existsSync(src)) { console.log(`${p.filename}  SKIP (source missing)`); continue; }
  const rotated = await sharp(fs.readFileSync(src)).rotate().toBuffer();
  const m = await sharp(rotated).metadata();
  if (p.width === m.width && p.height === m.height) continue;
  console.log(`${p.filename}  ${p.width}x${p.height} -> ${m.width}x${m.height}${DRY_RUN ? "  (dry)" : ""}`);
  if (!DRY_RUN) {
    await db.galleryPhoto.update({ where: { id: p.id }, data: { width: m.width, height: m.height } });
  }
  fixed++;
}

console.log(`\n${DRY_RUN ? "Would fix" : "Fixed"} ${fixed} of ${photos.length} photos.`);
await db.$disconnect();
