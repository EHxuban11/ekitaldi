#!/usr/bin/env node
// Set a gallery's cover (hero) photo.
//
// Auto-picks a good hero: a photo containing the gallery's two most-photographed
// people (typically the couple), preferring landscape orientation, and skipping
// logo/title-card images (.png/.svg). Or pass --photo <filename> to pick one.
//
// Usage:
//   node --env-file=.env.local scripts/set-cover.mjs <galleryId> [--photo IMG_1234.JPG]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parse(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--photo") opts.photo = argv[++i];
    else pos.push(argv[i]);
  }
  return { galleryId: pos[0], opts };
}

async function main() {
  const { galleryId, opts } = parse(process.argv.slice(2));
  if (!galleryId) {
    console.error("Usage: node --env-file=.env.local scripts/set-cover.mjs <galleryId> [--photo filename]");
    process.exit(1);
  }

  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    include: { personClusters: { orderBy: { size: "desc" } }, photos: true },
  });
  if (!gallery) {
    console.error("Gallery not found:", galleryId);
    process.exit(1);
  }

  const photos = gallery.photos;
  const isLogo = (f) => /\.(png|svg)$/i.test(f);
  const landscape = (p) => p.width && p.height && p.width >= p.height;

  let chosen;
  if (opts.photo) {
    chosen = photos.find((p) => p.filename === opts.photo);
    if (!chosen) {
      console.error("Photo not found in gallery:", opts.photo);
      process.exit(1);
    }
  } else {
    const top = gallery.personClusters.slice(0, 2).map((c) => c.personId);
    const hasAllTop = (p) => top.length > 0 && top.every((pid) => p.personIds.includes(pid));
    const real = photos.filter((p) => !isLogo(p.filename)).sort((a, b) => a.order - b.order);
    chosen =
      real.find((p) => hasAllTop(p) && landscape(p)) ||
      real.find((p) => hasAllTop(p)) ||
      real.find((p) => top[0] && p.personIds.includes(top[0]) && landscape(p)) ||
      real.find((p) => top[0] && p.personIds.includes(top[0])) ||
      real.find(landscape) ||
      real[0] ||
      photos[0];
  }

  await prisma.gallery.update({
    where: { id: galleryId },
    data: { coverPhotoId: chosen.id },
  });
  console.log(`Cover for "${gallery.name}" set to ${chosen.filename} (${chosen.width}x${chosen.height})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
