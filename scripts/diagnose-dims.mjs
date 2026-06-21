// Read-only: compare DB-stored width/height vs the REAL displayed (post-rotation)
// dimensions for the MC Office gallery. Confirms the orientation/deformation bug.
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = process.env.SRC_DIR || "E:/DCIM/100MSDCF";
const db = new PrismaClient();

const gallery = await db.gallery.findFirst({ where: { name: "MC Office" } });
const photos = await db.galleryPhoto.findMany({ where: { galleryId: gallery.id }, orderBy: { order: "asc" } });

let mismatched = 0;
for (const p of photos) {
  const src = path.join(SRC_DIR, p.filename);
  let real = "??x?? (source missing)";
  let flag = "";
  if (fs.existsSync(src)) {
    const rotated = await sharp(fs.readFileSync(src)).rotate().toBuffer();
    const m = await sharp(rotated).metadata();
    real = `${m.width}x${m.height}`;
    const storedLandscape = (p.width || 0) >= (p.height || 0);
    const realLandscape = m.width >= m.height;
    if (storedLandscape !== realLandscape) { flag = "  <-- DEFORMED (orientation mismatch)"; mismatched++; }
  }
  console.log(`${p.filename}  stored=${p.width}x${p.height}  real=${real}${flag}`);
}

console.log(`\n${mismatched} of ${photos.length} photos have wrong stored dimensions.`);
await db.$disconnect();
