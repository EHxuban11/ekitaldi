#!/usr/bin/env node
// Quick overview of all galleries: id, name, date, face-recognition status,
// photo count, cluster count. Handy for sanity checks.
//
// Usage: node --env-file=.env.local scripts/list-galleries.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const galleries = await prisma.gallery.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { photos: true, personClusters: true } } },
  });

  for (const g of galleries) {
    const faces = g.faceRecognitionEnabled ? `FACES(${g._count.personClusters})` : "no-faces";
    console.log(
      `${g.id}  ${faces.padEnd(11)}  ${String(g._count.photos).padStart(4)} photos  ` +
        `${g.passwordHash ? "🔒" : "  "}  ${g.name}${g.date ? "  (" + g.date + ")" : ""}`
    );
  }
  console.log(`\n${galleries.length} galleries total.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
