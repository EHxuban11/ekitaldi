// Publish the "MC Office" gallery to PRODUCTION (Neon DB + Cloudflare R2),
// replicating app/api/gallery/publish/route.ts exactly (sharp EXIF strip,
// full JPEG q92 + 600px WebP thumb, upload to R2, insert DB rows).
//
// Run: GALLERY_PASSWORD='...' node --env-file=.env.local scripts/upload-mc-office.mjs
//
// Env knobs:
//   GALLERY_PASSWORD  (required) password to protect the gallery
//   SRC_DIR           photo source dir (default E:/DCIM/100MSDCF)
//   ONLY_DATE         YYYY-MM-DD to select by file mtime (default: today, local)
//   DRY_RUN=1         process + list selection but write nothing
//   FORCE=1           allow creating even if a "MC Office" gallery already exists

import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const GALLERY_NAME = "MC Office";
const SRC_DIR = process.env.SRC_DIR || "E:/DCIM/100MSDCF";
const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE = process.env.FORCE === "1";
const password = process.env.GALLERY_PASSWORD || "";

// ── Gallery date label + selection date (today, local) ──
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const onlyDate = process.env.ONLY_DATE || todayStr;
const GALLERY_DATE = onlyDate;

// ── hashPassword: identical to lib/gallery-auth.ts ──
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function selectPhotos() {
  const all = fs.readdirSync(SRC_DIR).filter((f) => /\.(jpe?g)$/i.test(f));
  const picked = [];
  for (const name of all) {
    const full = path.join(SRC_DIR, name);
    const st = fs.statSync(full);
    if (fmtDate(st.mtime) === onlyDate) picked.push({ name, full, mtime: st.mtime, size: st.size });
  }
  picked.sort((a, b) => a.name.localeCompare(b.name));
  return picked;
}

async function main() {
  if (!password && !DRY_RUN) {
    console.error("ERROR: set GALLERY_PASSWORD (the gallery must be password-protected).");
    process.exit(1);
  }

  const db = new PrismaClient();
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = process.env.R2_BUCKET_NAME;

  const photos = selectPhotos();
  const totalMB = (photos.reduce((s, p) => s + p.size, 0) / 1024 / 1024).toFixed(0);
  console.log(`Source : ${SRC_DIR}`);
  console.log(`Date   : ${onlyDate}  ->  ${photos.length} photos (${totalMB} MB)`);
  console.log(`Gallery: "${GALLERY_NAME}"  date="${GALLERY_DATE}"  password=${password ? "yes" : "(none)"}`);
  console.log(`First  : ${photos[0]?.name}   Last: ${photos[photos.length - 1]?.name}`);
  if (!photos.length) { console.error("No photos matched the date. Aborting."); process.exit(1); }

  // Guard: don't create a duplicate gallery by accident
  const existing = await db.gallery.findFirst({ where: { name: GALLERY_NAME } });
  if (existing && !FORCE) {
    console.error(`\nA gallery named "${GALLERY_NAME}" already exists (id=${existing.id}). Re-run with FORCE=1 to create another. Aborting.`);
    await db.$disconnect();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n[DRY_RUN] No writes. Selected files:");
    for (const p of photos) console.log(`  ${p.name}  ${(p.size / 1024 / 1024).toFixed(2)}MB  ${p.mtime.toISOString()}`);
    await db.$disconnect();
    return;
  }

  // Create gallery
  const gallery = await db.gallery.create({
    data: { name: GALLERY_NAME, date: GALLERY_DATE, passwordHash: hashPassword(password) },
  });
  console.log(`\nCreated gallery id=${gallery.id}`);

  const results = [];
  for (let i = 0; i < photos.length; i++) {
    const { name, full } = photos[i];
    try {
      const fileBuffer = fs.readFileSync(full);

      const fullBuffer = await sharp(fileBuffer).rotate().jpeg({ quality: 92 }).toBuffer();
      const thumbBuffer = await sharp(fileBuffer)
        .rotate()
        .resize(600, undefined, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      // Dimensions of the ROTATED output (not the raw sensor frame) so portrait
      // shots aren't stored as landscape and stretched in the masonry grid.
      const metadata = await sharp(fullBuffer).metadata();

      const safeFilename = name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const r2Key = `galleries/${gallery.id}/${safeFilename}`;
      const thumbR2Key = `galleries/${gallery.id}/thumbs/${safeFilename}.webp`;

      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: r2Key, Body: fullBuffer, ContentType: "image/jpeg" }));
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: thumbR2Key, Body: thumbBuffer, ContentType: "image/webp" }));

      await db.galleryPhoto.create({
        data: {
          galleryId: gallery.id,
          r2Key,
          filename: name,
          order: i,
          width: metadata.width || null,
          height: metadata.height || null,
          thumbR2Key,
        },
      });

      results.push({ name });
      console.log(`  [${i + 1}/${photos.length}] ${name}  (${metadata.width}x${metadata.height})  ok`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name, error: message });
      console.log(`  [${i + 1}/${photos.length}] ${name}  ERROR: ${message}`);
    }
  }

  const uploaded = results.filter((r) => !r.error).length;
  const errors = results.filter((r) => r.error);
  console.log(`\nDone. Uploaded ${uploaded}/${photos.length}.`);
  if (errors.length) console.log("Errors:", errors);
  console.log(`\nGallery URL : https://ekitaldi.org/gallery/${gallery.id}`);
  console.log(`Dashboard   : https://ekitaldi.org/dashboard/${gallery.id}`);
  console.log(`Password    : ${password}`);

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
