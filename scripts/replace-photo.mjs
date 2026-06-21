#!/usr/bin/env node
// Replace a single photo's image bytes in a gallery (e.g. after a local edit).
// Re-encodes full (JPEG q92) + thumb (webp 600), uploads to NEW cache-busted
// keys (so Cloudflare/R2 serves the new image immediately), updates the DB row,
// and deletes the old objects. Keeps the photo's id/order/personIds/cover.
//
// Usage:
//   node --env-file=.env.local scripts/replace-photo.mjs <galleryId> <filename> <localImagePath>

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

async function main() {
  const [galleryId, filename, localPath] = process.argv.slice(2);
  if (!galleryId || !filename || !localPath) {
    console.error("Usage: node --env-file=.env.local scripts/replace-photo.mjs <galleryId> <filename> <localImagePath>");
    process.exit(1);
  }
  if (!fs.existsSync(localPath)) {
    console.error("Local image not found:", localPath);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const photo = await prisma.galleryPhoto.findFirst({ where: { galleryId, filename } });
  if (!photo) {
    console.error(`No photo "${filename}" in gallery ${galleryId}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(localPath);
  // The edited file (from OpenCV) is already display-oriented with no EXIF, so
  // rotate() is a harmless no-op here.
  const fullBuffer = await sharp(buf).rotate().jpeg({ quality: 92 }).toBuffer();
  const meta = await sharp(fullBuffer).metadata();
  const thumbBuffer = await sharp(buf)
    .rotate()
    .resize(600, undefined, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const v = Date.now();
  const r2Key = `galleries/${galleryId}/${safe}.v${v}.jpg`;
  const thumbR2Key = `galleries/${galleryId}/thumbs/${safe}.v${v}.webp`;

  const bucket = process.env.R2_BUCKET_NAME;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: r2Key, Body: fullBuffer, ContentType: "image/jpeg" }));
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: thumbR2Key, Body: thumbBuffer, ContentType: "image/webp" }));

  const oldKeys = [photo.r2Key, photo.thumbR2Key].filter(Boolean);
  await prisma.galleryPhoto.update({
    where: { id: photo.id },
    data: { r2Key, thumbR2Key, width: meta.width || photo.width, height: meta.height || photo.height },
  });

  // remove the superseded objects
  if (oldKeys.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: oldKeys.map((Key) => ({ Key })) } }));
  }

  await prisma.$disconnect();
  console.log(`Replaced ${filename} (${meta.width}x${meta.height}) -> ${r2Key}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
