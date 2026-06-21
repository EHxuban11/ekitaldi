#!/usr/bin/env node
// Reconcile a gallery to a curated folder (e.g. an editor removed some photos).
// Removes gallery photos no longer present in the folder (deletes from R2 + DB;
// Face rows cascade), recomputes each person cluster's size + sample avatars
// from what remains, drops now-empty clusters, and optionally sets the cover.
//
// Matches by filename — assumes the curated set is the SAME files minus some
// (no renames/re-exports). Run with --dry first to preview.
//
// Usage:
//   node --env-file=.env.local scripts/reconcile-gallery.mjs <galleryId> <curatedFolder> [--cover IMG_1234.JPG] [--dry]

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

function parse(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cover") opts.cover = argv[++i];
    else if (argv[i] === "--dry") opts.dry = true;
    else pos.push(argv[i]);
  }
  return { galleryId: pos[0], folder: pos[1], opts };
}

async function main() {
  const { galleryId, folder, opts } = parse(process.argv.slice(2));
  if (!galleryId || !folder) {
    console.error("Usage: node --env-file=.env.local scripts/reconcile-gallery.mjs <galleryId> <curatedFolder> [--cover file] [--dry]");
    process.exit(1);
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error("Folder not found:", folder);
    process.exit(1);
  }

  const keep = new Set(
    fs.readdirSync(folder).filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
  );
  console.log(`Curated folder: ${keep.size} images`);

  const prisma = new PrismaClient();
  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    include: { photos: true, personClusters: true },
  });
  if (!gallery) {
    console.error("Gallery not found:", galleryId);
    process.exit(1);
  }

  const toRemove = gallery.photos.filter((p) => !keep.has(p.filename));
  const remaining = gallery.photos.filter((p) => keep.has(p.filename));
  const notInGallery = [...keep].filter((f) => !gallery.photos.some((p) => p.filename === f));

  console.log(`Gallery "${gallery.name}": ${gallery.photos.length} photos, ${gallery.personClusters.length} clusters`);
  console.log(`  keep:   ${remaining.length}`);
  console.log(`  remove: ${toRemove.length}`);
  if (notInGallery.length) {
    console.log(`  ⚠ ${notInGallery.length} curated files are NOT in the gallery (renamed/re-exported?):`);
    console.log("    " + notInGallery.slice(0, 8).join(", ") + (notInGallery.length > 8 ? " …" : ""));
  }

  if (opts.cover && !keep.has(opts.cover)) {
    console.error(`\n⚠ --cover ${opts.cover} is not in the curated folder. Aborting.`);
    process.exit(1);
  }

  if (opts.dry) {
    console.log("\n(dry run — no changes made)");
    if (toRemove.length) console.log("Would remove: " + toRemove.slice(0, 10).map((p) => p.filename).join(", ") + (toRemove.length > 10 ? " …" : ""));
    await prisma.$disconnect();
    return;
  }

  const bucket = process.env.R2_BUCKET_NAME;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  // 1) delete removed photos from R2 (full + thumb), then DB (faces cascade).
  if (toRemove.length) {
    const objects = toRemove.flatMap((p) => [{ Key: p.r2Key }, { Key: p.thumbR2Key }]);
    for (let i = 0; i < objects.length; i += 1000) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.slice(i, i + 1000) } }));
    }
    await prisma.galleryPhoto.deleteMany({ where: { id: { in: toRemove.map((p) => p.id) } } });
    console.log(`\nDeleted ${toRemove.length} photos from R2 + DB.`);
  }

  // 2) recompute clusters from remaining faces (Face rows of removed photos already cascaded).
  const faces = await prisma.face.findMany({
    where: { galleryId, personId: { not: null } },
    select: { personId: true, photoId: true },
  });
  const byPid = new Map();
  for (const f of faces) {
    if (!byPid.has(f.personId)) byPid.set(f.personId, []);
    byPid.get(f.personId).push(f.photoId);
  }
  const photoById = new Map(remaining.map((p) => [p.id, p]));
  let updated = 0, dropped = 0;
  for (const c of gallery.personClusters) {
    const photoIds = byPid.get(c.personId) || [];
    if (photoIds.length === 0) {
      await prisma.personCluster.delete({ where: { id: c.id } });
      dropped++;
      continue;
    }
    const seen = new Set();
    const exampleKeys = [];
    for (const pid of photoIds) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const ph = photoById.get(pid);
      if (ph) exampleKeys.push(ph.thumbR2Key);
      if (exampleKeys.length >= 6) break;
    }
    await prisma.personCluster.update({
      where: { id: c.id },
      data: { size: photoIds.length, exampleKeys },
    });
    updated++;
  }
  console.log(`Clusters: ${updated} updated, ${dropped} dropped (no longer appear).`);

  // 3) optional cover
  if (opts.cover) {
    const cov = remaining.find((p) => p.filename === opts.cover);
    if (cov) {
      await prisma.gallery.update({ where: { id: galleryId }, data: { coverPhotoId: cov.id } });
      console.log(`Cover set to ${cov.filename}.`);
    }
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
