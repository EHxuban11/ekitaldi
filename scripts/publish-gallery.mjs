#!/usr/bin/env node
// One-command gallery publisher.
//
// Uploads photos straight to Cloudflare R2 + writes rows to Neon (bypassing the
// Vercel 4.5MB function limit). With --faces it ALSO runs the face-recognition
// pipeline (face_pipeline/detect_faces.py) and stores anonymous person clusters,
// so the gallery gets "find me in the photos" filtering.
//
// Face recognition is strictly OPT-IN: without --faces this behaves exactly like
// scripts/upload-r2.mjs and the gallery's faceRecognitionEnabled stays false, so
// existing galleries are never affected.
//
// Usage:
//   node --env-file=.env.local scripts/publish-gallery.mjs "Gallery Name" /path/to/photos [options]
//
// Options:
//   --faces              Detect + cluster faces and enable face filtering
//   --faces-json <path>  Use a precomputed faces.json (skips running Python)
//   --python <path>      Python interpreter (default: face_pipeline/.venv)
//   --password <pw>      Protect the gallery with a password
//   --date <date>        Display date (e.g. "2026-06-21")
//   --max <px>           Resize full image so its longest side <= px
//
// Requires in env (.env.local): POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING,
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
// optionally R2_PUBLIC_DOMAIN (default photos.ekitaldi.org).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

// Distinct, soft palette assigned in cluster-size order (person_001 = first).
const PALETTE = [
  "#E5989B", "#90BEDE", "#B5E48C", "#BDB2FF", "#FFB4A2", "#9AD1D4",
  "#CDB4DB", "#FFD6A5", "#A8DADC", "#F4A261", "#B5828C", "#83C5BE",
];

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--faces") opts.faces = true;
    else if (a === "--faces-json") opts.facesJson = argv[++i];
    else if (a === "--python") opts.python = argv[++i];
    else if (a === "--password") opts.password = argv[++i];
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
    console.error("Run with: node --env-file=.env.local scripts/publish-gallery.mjs ...");
    process.exit(1);
  }
}

function defaultPython() {
  return process.platform === "win32"
    ? path.join(REPO_ROOT, "face_pipeline", ".venv", "Scripts", "python.exe")
    : path.join(REPO_ROOT, "face_pipeline", ".venv", "bin", "python");
}

// Run the Python detector (or load a precomputed JSON) and return the parsed
// faces result, or null if face recognition is off.
function runFacePipeline(folder, opts) {
  if (!opts.faces && !opts.facesJson) return null;

  if (opts.facesJson) {
    console.log(`Faces:    using precomputed ${opts.facesJson}`);
    return JSON.parse(fs.readFileSync(opts.facesJson, "utf-8"));
  }

  const py = opts.python || defaultPython();
  const script = path.join(REPO_ROOT, "face_pipeline", "detect_faces.py");
  if (!fs.existsSync(py)) {
    console.error(`Python interpreter not found: ${py}`);
    console.error("Create it: python -m venv face_pipeline/.venv && " +
      "face_pipeline/.venv/Scripts/pip install -r face_pipeline/requirements.txt");
    process.exit(1);
  }
  const outJson = path.join(os.tmpdir(), `ekitaldi-faces-${Date.now()}.json`);
  console.log(`Faces:    running ${path.basename(py)} detect_faces.py …\n`);
  const res = spawnSync(py, [script, "--images", folder, "--out", outJson], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    console.error("\nFace detection failed.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(outJson, "utf-8"));
}

async function main() {
  const { name, folder, opts } = parseArgs(process.argv.slice(2));
  if (!name || !folder) {
    console.error('Usage: node --env-file=.env.local scripts/publish-gallery.mjs "Gallery Name" /path/to/photos [--faces] [--faces-json p] [--password pw] [--date 2026-06-21] [--max 3000]');
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

  // Face pipeline (before upload so we fail fast if it errors).
  const faceData = runFacePipeline(folder, opts);
  const facesEnabled = !!faceData;
  // filename -> sorted person_ids[]
  const filePeople = new Map();
  if (faceData) {
    for (const p of faceData.photos) filePeople.set(p.filename, p.person_ids || []);
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

  console.log(`\nGallery:  ${name}`);
  console.log(`Photos:   ${files.length} from ${folder}`);
  console.log(`Bucket:   ${bucket}  ->  https://${publicDomain}`);
  console.log(`Faces:    ${facesEnabled ? `ON — ${faceData.stats.people} people, ${faceData.stats.faces} faces` : "off"}`);
  if (opts.max) console.log(`Resize:   longest side <= ${opts.max}px`);
  if (opts.password) console.log(`Password: (set)`);
  console.log("");

  const gallery = await prisma.gallery.create({
    data: {
      name,
      date: opts.date || null,
      passwordHash: opts.password ? hashPassword(opts.password) : null,
      faceRecognitionEnabled: facesEnabled,
    },
  });
  console.log(`Created gallery ${gallery.id}\n`);

  let ok = 0;
  const errors = [];
  const fileToPhoto = new Map(); // filename -> { photoId, thumbR2Key }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const label = `[${String(i + 1).padStart(3)}/${files.length}] ${file}`;
    try {
      const buf = fs.readFileSync(path.join(folder, file));

      let full = sharp(buf).rotate();
      if (opts.max) full = full.resize(opts.max, opts.max, { fit: "inside", withoutEnlargement: true });
      const fullBuffer = await full.jpeg({ quality: 92 }).toBuffer();
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

      const photo = await prisma.galleryPhoto.create({
        data: {
          galleryId: gallery.id,
          r2Key,
          filename: file,
          order: i,
          width: meta.width || null,
          height: meta.height || null,
          thumbR2Key,
          personIds: filePeople.get(file) || [],
        },
      });
      fileToPhoto.set(file, { photoId: photo.id, thumbR2Key });

      ok++;
      const ppl = (filePeople.get(file) || []).length;
      console.log(`${label}  ok  (${(fullBuffer.length / 1048576).toFixed(1)}MB)${ppl ? `  ${ppl} ppl` : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ file, msg });
      console.log(`${label}  FAILED: ${msg}`);
    }
  }

  // Write person clusters + faces (only for face galleries).
  if (faceData) {
    console.log(`\nWriting ${faceData.clusters.length} person clusters…`);
    const pidToClusterId = new Map();
    for (let c = 0; c < faceData.clusters.length; c++) {
      const cl = faceData.clusters[c];
      const exampleKeys = (cl.example_files || [])
        .map((f) => fileToPhoto.get(f)?.thumbR2Key)
        .filter(Boolean);
      const created = await prisma.personCluster.create({
        data: {
          galleryId: gallery.id,
          personId: cl.person_id,
          size: cl.size,
          color: PALETTE[c % PALETTE.length],
          exampleKeys,
        },
      });
      pidToClusterId.set(cl.person_id, created.id);
    }

    const faceRows = [];
    for (const f of faceData.faces) {
      const photo = fileToPhoto.get(f.filename);
      if (!photo) continue; // photo failed to upload
      faceRows.push({
        galleryId: gallery.id,
        photoId: photo.photoId,
        personClusterId: f.person_id ? pidToClusterId.get(f.person_id) ?? null : null,
        personId: f.person_id ?? null,
        bbox: f.bbox,
        confidence: f.confidence ?? null,
        faceIndex: f.face_index,
      });
    }
    if (faceRows.length) {
      // chunk to keep the insert payload reasonable
      for (let i = 0; i < faceRows.length; i += 500) {
        await prisma.face.createMany({ data: faceRows.slice(i, i + 500) });
      }
    }
    console.log(`Wrote ${faceData.clusters.length} clusters, ${faceRows.length} faces.`);
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
