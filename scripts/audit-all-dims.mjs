// Read-only audit: for EVERY gallery, compare DB-stored width/height orientation
// against the real (correctly-rotated) thumbnail served from R2. No source files
// needed. Flags photos whose stored dims are the wrong orientation (deformed).
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const DOMAIN = process.env.R2_PUBLIC_DOMAIN || "photos.ekitaldi.org";
const db = new PrismaClient();

const galleries = await db.gallery.findMany({
  include: { photos: { orderBy: { order: "asc" } } },
  orderBy: { createdAt: "asc" },
});

async function thumbDims(key) {
  const res = await fetch(`https://${DOMAIN}/${key}`);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const m = await sharp(buf).metadata();
  return { w: m.width, h: m.height };
}

let grandBad = 0, grandTotal = 0;
for (const g of galleries) {
  let bad = 0;
  const bering = g.photos.map((p) =>
    thumbDims(p.thumbR2Key).then((d) => {
      if (!d) return;
      const storedLandscape = (p.width || 0) >= (p.height || 0);
      const realLandscape = d.w >= d.h;
      if (storedLandscape !== realLandscape) bad++;
    }).catch(() => {})
  );
  await Promise.all(bering);
  grandBad += bad; grandTotal += g.photos.length;
  console.log(`${bad === 0 ? "OK " : "BAD"}  "${g.name}"  ${bad}/${g.photos.length} deformed`);
}
console.log(`\nTotal: ${grandBad} deformed photos across ${grandTotal} (in ${galleries.length} galleries).`);
await db.$disconnect();
