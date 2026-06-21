#!/usr/bin/env node
// Generate a cropped-face avatar for each person cluster in a gallery and store
// it. Picks the highest-quality face per person from the pipeline's bboxes
// (faces.json), crops a padded square from the local photo, uploads it, and sets
// PersonCluster.avatarKey so the People bar shows the actual face.
//
// Usage:
//   node --env-file=.env.local scripts/set-avatars.mjs <galleryId> <faces.json> <photosFolder>

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

async function main() {
  const [galleryId, facesPath, photosFolder] = process.argv.slice(2);
  if (!galleryId || !facesPath || !photosFolder) {
    console.error("Usage: node --env-file=.env.local scripts/set-avatars.mjs <galleryId> <faces.json> <photosFolder>");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(facesPath, "utf-8"));
  const byPid = new Map();
  for (const f of data.faces) {
    if (!f.person_id) continue;
    if (!byPid.has(f.person_id)) byPid.set(f.person_id, []);
    byPid.get(f.person_id).push(f);
  }

  const prisma = new PrismaClient();
  const clusters = await prisma.personCluster.findMany({ where: { galleryId } });

  const bucket = process.env.R2_BUCKET_NAME;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const SIZE = 256;
  let made = 0;
  for (const cluster of clusters) {
    const faces = byPid.get(cluster.personId) || [];
    if (!faces.length) continue;
    // best = most confident, weighted by face area
    const best = faces.reduce((a, b) => (score(b) > score(a) ? b : a));
    const file = path.join(photosFolder, best.filename);
    if (!fs.existsSync(file)) continue;

    try {
      const buf = fs.readFileSync(file);
      // bbox is in the stored (non-rotated) pixel space, same as sharp without
      // .rotate(), so extract aligns with it.
      const meta = await sharp(buf).metadata();
      const W = meta.width || 0;
      const H = meta.height || 0;
      const [x1, y1, x2, y2] = best.bbox;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const side = Math.max(x2 - x1, y2 - y1) * 1.6;
      let left = Math.round(cx - side / 2);
      let top = Math.round(cy - side / 2);
      let s = Math.round(side);
      // clamp the square fully inside the image
      s = Math.min(s, W, H);
      left = Math.max(0, Math.min(left, W - s));
      top = Math.max(0, Math.min(top, H - s));
      if (s < 8) continue;

      const cropBuf = await sharp(buf)
        .extract({ left, top, width: s, height: s })
        .resize(SIZE, SIZE)
        .jpeg({ quality: 88 })
        .toBuffer();

      const key = `galleries/${galleryId}/avatars/${cluster.personId}.v${Date.now()}.jpg`;
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: cropBuf, ContentType: "image/jpeg" }));
      await prisma.personCluster.update({ where: { id: cluster.id }, data: { avatarKey: key } });
      made++;
    } catch (err) {
      console.log(`  ${cluster.personId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  await prisma.$disconnect();
  console.log(`Set ${made}/${clusters.length} avatars.`);
}

function score(f) {
  const [x1, y1, x2, y2] = f.bbox;
  const area = Math.max(1, (x2 - x1) * (y2 - y1));
  return (f.confidence ?? 0) * Math.sqrt(area);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
