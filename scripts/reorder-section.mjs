#!/usr/bin/env node
// Pin photos to the front of their section, in the given order. The rest keep
// their relative order. Reassigns the section's existing `order` values to the
// new sequence, so it stays within the same global band.
//
// Usage:
//   node --env-file=.env.local scripts/reorder-section.mjs <galleryId> <photoId1> <photoId2> ...
//   (photoId1 becomes first in its section, photoId2 second, etc.)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [galleryId, ...pinIds] = process.argv.slice(2);
  if (!galleryId || pinIds.length === 0) {
    console.error("Usage: node --env-file=.env.local scripts/reorder-section.mjs <galleryId> <photoId...>");
    process.exit(1);
  }

  const first = await prisma.galleryPhoto.findFirst({ where: { id: pinIds[0], galleryId } });
  if (!first) {
    console.error("First photo not found in gallery:", pinIds[0]);
    process.exit(1);
  }
  const section = first.section;

  const photos = await prisma.galleryPhoto.findMany({
    where: { galleryId, section },
    orderBy: { order: "asc" },
  });
  const orderValues = photos.map((p) => p.order).sort((a, b) => a - b);

  const pinned = pinIds.map((id) => photos.find((p) => p.id === id)).filter(Boolean);
  const rest = photos.filter((p) => !pinIds.includes(p.id));
  const newSeq = [...pinned, ...rest];

  for (let i = 0; i < newSeq.length; i++) {
    await prisma.galleryPhoto.update({ where: { id: newSeq[i].id }, data: { order: orderValues[i] } });
  }

  console.log(`Section "${section}" new order:`);
  newSeq.forEach((p, i) => console.log(`  ${i + 1}. ${p.filename}${pinIds.includes(p.id) ? "  <-- pinned" : ""}`));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
