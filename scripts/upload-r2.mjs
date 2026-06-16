#!/usr/bin/env node
// Publish a gallery by uploading photos DIRECTLY to Cloudflare R2 and writing
// rows to the Neon database — bypassing the Vercel function (whose ~4.5MB
// request limit rejects full-size photos). Mirrors app/api/gallery/publish.
//
// Usage:
//   node --env-file=.env.local scripts/upload-r2.mjs "Gallery Name" /path/to/photos [options]
//
// Options:
//   --password <pw>   Protect the gallery with a password
//   --date <date>     Display date (e.g. "2026-06-03")
//   --max <px>        Resize full image so its longest side <= px (default: no resize)
//
// Requires in env (.env.local): POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING,
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
// and optionally R2_PUBLIC_DOMAIN (default photos.ekitaldi.org).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--password") opts.password = argv[++i];
    else if (a === "--date") opts.date = argv[++i];
    else if (a === "--max") opts.max = parseInt(argv[++i], 10);
    else positional.push(a);
  }
  return { name: positional[0], folder: positional[1], opts };
}

// must match lib/gallery-auth.ts exactly so the gallery unlocks
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    console.error("Make sure they're in .env.local and run with: node --env-file=.env.local ...");
    process.exit(1);
  }
}

async function main() {
  const { name, folder, opts } = parseArgs(process.argv.slice(2));
  if (!name || !folder) {
    console.error('Usage: node --env-file=.env.local scripts/upload-r2.mjs "Gallery Name" /path/to/photos [--password pw] [--date 2026-06-03] [--max 3000]');
    process.exit(1);
  }
  requireEnv([
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ]);

  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error(`Folder not found: ${folder}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(folder)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!files.length) {
    console.error(`No image files found in ${folder}`);
    process.exit(1);
  }

  const bucket = process.env.R2_BUCKET_NAME;
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || "photos.ekitaldi.org";
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const prisma = new PrismaClient();

  const put = (key, body, contentType) =>
    s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));

  console.log(`Gallery:  ${name}`);
  console.log(`Photos:   ${files.length} from ${folder}`);
  console.log(`Bucket:   ${bucket}  ->  https://${publicDomain}`);
  if (opts.max) console.log(`Resize:   longest side <= ${opts.max}px`);
  if (opts.password) console.log(`Password: (set)`);
  console.log("");

  const gallery = await prisma.gallery.create({
    data: {
      name,
      date: opts.date || null,
      passwordHash: opts.password ? hashPassword(opts.password) : null,
    },
  });
  console.log(`Created gallery ${gallery.id}\n`);

  let ok = 0;
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = `[${String(i + 1).padStart(3)}/${files.length}] ${file}`;
    try {
      const buf = fs.readFileSync(path.join(folder, file));

      let full = sharp(buf).rotate();
      if (opts.max) full = full.resize(opts.max, opts.max, { fit: "inside", withoutEnlargement: true });
      const fullBuffer = await full.jpeg({ quality: 92 }).toBuffer();

      // Dimensions of the actual stored image (rotated, and resized if --max) so
      // portrait shots aren't saved as landscape and stretched by the grid's
      // aspect-ratio.
      const meta = await sharp(fullBuffer).metadata();

      const thumbBuffer = await sharp(buf)
        .rotate()
        .resize(600, undefined, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const safe = file.replace(/[^a-zA-Z0-9._-]/g, "_");
      const r2Key = `galleries/${gallery.id}/${safe}`;
      const thumbR2Key = `galleries/${gallery.id}/thumbs/${safe}.webp`;

      await put(r2Key, fullBuffer, "image/jpeg");
      await put(thumbR2Key, thumbBuffer, "image/webp");

      await prisma.galleryPhoto.create({
        data: {
          galleryId: gallery.id,
          r2Key,
          filename: file,
          order: i,
          width: meta.width || null,
          height: meta.height || null,
          thumbR2Key,
        },
      });

      ok++;
      console.log(`${label}  ok  (${(fullBuffer.length / 1048576).toFixed(1)}MB)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ file, msg });
      console.log(`${label}  FAILED: ${msg}`);
    }
  }

  await prisma.$disconnect();

  console.log(`\nDone. ${ok}/${files.length} uploaded.`);
  if (errors.length) {
    console.log("Errors:");
    for (const e of errors) console.log(`  - ${e.file}: ${e.msg}`);
  }
  console.log(`\nGallery URL: https://www.ekitaldi.org/gallery/${gallery.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
