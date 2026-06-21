#!/usr/bin/env node
// Publish a WEDDING gallery (type="wedding") from a structured folder.
//
// The folder has one subfolder per section (the client's layout):
//   TODAS_LAS_FOTOS_SIN_MARCO/  -> "todas"   (+ face recognition runs here)
//   FAMILIA_IMPORTANTE/         -> "familia_importante"
//   FAMILIA_MARCO/              -> "familia_marco"
//   novios_solos/               -> "novios_solos"
//   novios_con_amigos/          -> "novios_con_amigos"
//   PRINTS/                     -> "prints"
//   VIDEOS/                     -> "videos"   (mp4, served as <video>)
//   LOGOS/                      -> logo for the hero (the "_Largo" one)
//
// Uploads everything to R2 + Neon, runs the face pipeline on "todas", and
// creates the gallery as type="wedding" so the UI renders the section layout.
//
// Usage:
//   node --env-file=.env.local scripts/publish-wedding.mjs "Name" <rootFolder> \
//        [--password pw] [--date d] [--language eu] [--max px] [--faces-json p]

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
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".m4v"]);

// folder name -> { section, kind, faces }. Display order is this array's order.
const SECTIONS = [
  { folder: "TODAS_LAS_FOTOS_SIN_MARCO", section: "todas", kind: "image", faces: true },
  { folder: "FAMILIA_IMPORTANTE", section: "familia_importante", kind: "image" },
  { folder: "FAMILIA_MARCO", section: "familia_marco", kind: "image" },
  { folder: "novios_solos", section: "novios_solos", kind: "image" },
  { folder: "novios_con_amigos", section: "novios_con_amigos", kind: "image" },
  { folder: "PRINTS", section: "prints", kind: "image" },
  { folder: "VIDEOS", section: "videos", kind: "video" },
];

const PALETTE = [
  "#E5989B", "#90BEDE", "#B5E48C", "#BDB2FF", "#FFB4A2", "#9AD1D4",
  "#CDB4DB", "#FFD6A5", "#A8DADC", "#F4A261", "#B5828C", "#83C5BE",
];

function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--password") opts.password = argv[++i];
    else if (a === "--date") opts.date = argv[++i];
    else if (a === "--language") opts.language = argv[++i];
    else if (a === "--max") opts.max = parseInt(argv[++i], 10);
    else if (a === "--faces-json") opts.facesJson = argv[++i];
    else pos.push(a);
  }
  return { name: pos[0], root: pos[1], opts };
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function listFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => exts.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function runFaces(todasDir, opts) {
  if (opts.facesJson) {
    console.log(`Faces:    precomputed ${opts.facesJson}`);
    return JSON.parse(fs.readFileSync(opts.facesJson, "utf-8"));
  }
  const py = process.platform === "win32"
    ? path.join(REPO_ROOT, "face_pipeline", ".venv", "Scripts", "python.exe")
    : path.join(REPO_ROOT, "face_pipeline", ".venv", "bin", "python");
  const script = path.join(REPO_ROOT, "face_pipeline", "detect_faces.py");
  const out = path.join(os.tmpdir(), `wedding-faces-${Date.now()}.json`);
  console.log(`Faces:    running detect_faces.py on "todas"…\n`);
  const r = spawnSync(py, [script, "--images", todasDir, "--out", out], { stdio: "inherit" });
  if (r.status !== 0) { console.error("face detection failed"); process.exit(1); }
  return JSON.parse(fs.readFileSync(out, "utf-8"));
}

async function main() {
  const { name, root, opts } = parseArgs(process.argv.slice(2));
  if (!name || !root) {
    console.error('Usage: node --env-file=.env.local scripts/publish-wedding.mjs "Name" <rootFolder> [--password pw] [--date d] [--language eu] [--max px] [--faces-json p]');
    process.exit(1);
  }
  requireEnv(["POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]);
  if (!fs.existsSync(root)) { console.error("Folder not found:", root); process.exit(1); }

  const todasDir = path.join(root, "TODAS_LAS_FOTOS_SIN_MARCO");
  const faceData = fs.existsSync(todasDir) ? runFaces(todasDir, opts) : null;
  const filePeople = new Map();
  if (faceData) for (const p of faceData.photos) filePeople.set(p.filename, p.person_ids || []);

  const bucket = process.env.R2_BUCKET_NAME;
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || "photos.ekitaldi.org";
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  const prisma = new PrismaClient();
  const put = (key, body, ct) => s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: ct }));

  console.log(`\nGallery:  ${name} (wedding)`);
  console.log(`Bucket:   ${bucket} -> https://${publicDomain}`);
  console.log(`Faces:    ${faceData ? `${faceData.stats.people} people, ${faceData.stats.faces} faces` : "off"}\n`);

  const gallery = await prisma.gallery.create({
    data: {
      name,
      type: "wedding",
      date: opts.date || null,
      language: opts.language || "eu",
      passwordHash: opts.password ? hashPassword(opts.password) : null,
      faceRecognitionEnabled: !!faceData,
    },
  });
  console.log(`Created gallery ${gallery.id}\n`);

  // Logo (prefer the "_Largo" one for the hero).
  const logoDir = path.join(root, "LOGOS");
  const logos = listFiles(logoDir, IMAGE_EXTS);
  const logoFile = logos.find((f) => /largo/i.test(f)) || logos[0];
  if (logoFile) {
    const buf = fs.readFileSync(path.join(logoDir, logoFile));
    const safe = logoFile.replace(/[^a-zA-Z0-9._-]/g, "_");
    const logoKey = `galleries/${gallery.id}/logo/${safe}`;
    await put(logoKey, buf, logoFile.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
    await prisma.gallery.update({ where: { id: gallery.id }, data: { logoKey } });
    console.log(`Logo:     ${logoFile}\n`);
  }

  let order = 0;
  const errors = [];
  const fileToPhoto = new Map(); // todas filename -> {photoId, thumbR2Key}

  for (const sec of SECTIONS) {
    const dir = path.join(root, sec.folder);
    const files = listFiles(dir, sec.kind === "video" ? VIDEO_EXTS : IMAGE_EXTS);
    if (!files.length) continue;
    console.log(`[${sec.section}] ${files.length} ${sec.kind}s`);

    for (const file of files) {
      const safe = file.replace(/[^a-zA-Z0-9._-]/g, "_");
      try {
        if (sec.kind === "video") {
          const buf = fs.readFileSync(path.join(dir, file));
          const r2Key = `galleries/${gallery.id}/videos/${safe}`;
          await put(r2Key, buf, "video/mp4");
          await prisma.galleryPhoto.create({
            data: {
              galleryId: gallery.id, r2Key, thumbR2Key: r2Key, filename: file,
              order: order++, section: sec.section, mediaType: "video",
            },
          });
        } else {
          const buf = fs.readFileSync(path.join(dir, file));
          let full = sharp(buf).rotate();
          if (opts.max) full = full.resize(opts.max, opts.max, { fit: "inside", withoutEnlargement: true });
          const fullBuffer = await full.jpeg({ quality: 92 }).toBuffer();
          const meta = await sharp(fullBuffer).metadata();
          const thumbBuffer = await sharp(buf).rotate().resize(600, undefined, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          const r2Key = `galleries/${gallery.id}/${sec.section}/${safe}`;
          const thumbR2Key = `galleries/${gallery.id}/thumbs/${sec.section}/${safe}.webp`;
          await put(r2Key, fullBuffer, "image/jpeg");
          await put(thumbR2Key, thumbBuffer, "image/webp");
          const photo = await prisma.galleryPhoto.create({
            data: {
              galleryId: gallery.id, r2Key, thumbR2Key, filename: file,
              order: order++, width: meta.width || null, height: meta.height || null,
              section: sec.section, mediaType: "image",
              personIds: sec.faces ? (filePeople.get(file) || []) : [],
            },
          });
          if (sec.faces) fileToPhoto.set(file, { photoId: photo.id, thumbR2Key });
        }
      } catch (err) {
        errors.push({ file, msg: err instanceof Error ? err.message : String(err) });
        console.log(`  ${file} FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Person clusters + faces (from the "todas" detection).
  if (faceData) {
    const pidToClusterId = new Map();
    for (let c = 0; c < faceData.clusters.length; c++) {
      const cl = faceData.clusters[c];
      const exampleKeys = (cl.example_files || []).map((f) => fileToPhoto.get(f)?.thumbR2Key).filter(Boolean);
      const created = await prisma.personCluster.create({
        data: { galleryId: gallery.id, personId: cl.person_id, size: cl.size, color: PALETTE[c % PALETTE.length], exampleKeys },
      });
      pidToClusterId.set(cl.person_id, created.id);
    }
    const faceRows = [];
    for (const f of faceData.faces) {
      const photo = fileToPhoto.get(f.filename);
      if (!photo) continue;
      faceRows.push({
        galleryId: gallery.id, photoId: photo.photoId,
        personClusterId: f.person_id ? pidToClusterId.get(f.person_id) ?? null : null,
        personId: f.person_id ?? null, bbox: f.bbox, confidence: f.confidence ?? null, faceIndex: f.face_index,
      });
    }
    for (let i = 0; i < faceRows.length; i += 500) await prisma.face.createMany({ data: faceRows.slice(i, i + 500) });
    console.log(`\nFaces:    ${faceData.clusters.length} clusters, ${faceRows.length} faces.`);
  }

  // Cover: a landscape couple shot from "todas" (person_001 + person_002).
  const todasPhotos = await prisma.galleryPhoto.findMany({ where: { galleryId: gallery.id, section: "todas" } });
  const couple = ["person_001", "person_002"];
  const cover =
    todasPhotos.find((p) => couple.every((c) => p.personIds.includes(c)) && p.width && p.height && p.width >= p.height) ||
    todasPhotos.find((p) => couple.every((c) => p.personIds.includes(c))) ||
    todasPhotos.find((p) => p.width && p.height && p.width >= p.height) ||
    todasPhotos[0];
  if (cover) await prisma.gallery.update({ where: { id: gallery.id }, data: { coverPhotoId: cover.id } });

  await prisma.$disconnect();
  console.log(`\nDone. ${order} items uploaded.${errors.length ? ` ${errors.length} errors.` : ""}`);
  console.log(`Cover:    ${cover?.filename || "(none)"}`);
  console.log(`\nGallery URL: https://www.ekitaldi.org/gallery/${gallery.id}`);
  console.log(`Next: run set-avatars.mjs ${gallery.id} <faces.json> ${todasDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
