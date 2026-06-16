#!/usr/bin/env node
// Publish a gallery to ekitaldi by posting photos to /api/gallery/publish.
//
// Usage:
//   node scripts/upload.mjs "Gallery Name" /path/to/photos [options]
//
// Options:
//   --password <pw>   Protect the gallery with a password
//   --date <date>     Display date for the gallery (e.g. "2026-06-03")
//   --url <baseUrl>   Target site (default: https://ekitaldi.org)
//
// Auth: reads your admin session cookie from the UPLOAD_COOKIE env var,
// or from a .upload-cookie file in the repo root (gitignored).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff"]);
const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--password") opts.password = argv[++i];
    else if (a === "--date") opts.date = argv[++i];
    else if (a === "--url") opts.url = argv[++i];
    else positional.push(a);
  }
  return { name: positional[0], folder: positional[1], opts };
}

function readCookie() {
  if (process.env.UPLOAD_COOKIE) return process.env.UPLOAD_COOKIE.trim();
  const file = path.join(repoRoot, ".upload-cookie");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  return null;
}

async function main() {
  const { name, folder, opts } = parseArgs(process.argv.slice(2));

  if (!name || !folder) {
    console.error('Usage: node scripts/upload.mjs "Gallery Name" /path/to/photos [--password pw] [--date 2026-06-03] [--url https://ekitaldi.org]');
    process.exit(1);
  }

  const cookie = readCookie();
  if (!cookie) {
    console.error("No session cookie found. Set UPLOAD_COOKIE or create a .upload-cookie file in the repo root.");
    process.exit(1);
  }

  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error(`Folder not found: ${folder}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(folder)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) {
    console.error(`No image files found in ${folder}`);
    process.exit(1);
  }

  // NOTE: must be the www host — bare ekitaldi.org 307-redirects and drops the POST body.
  const baseUrl = (opts.url || process.env.UPLOAD_URL || "https://www.ekitaldi.org").replace(/\/$/, "");

  console.log(`Gallery:  ${name}`);
  console.log(`Photos:   ${files.length} from ${folder}`);
  console.log(`Target:   ${baseUrl}/api/gallery/publish`);
  if (opts.password) console.log(`Password: (set)`);
  if (opts.date) console.log(`Date:     ${opts.date}`);
  console.log("");

  const form = new FormData();
  form.append("name", name);
  if (opts.date) form.append("date", opts.date);
  if (opts.password) form.append("password", opts.password);

  let totalBytes = 0;
  for (const f of files) {
    const full = path.join(folder, f);
    const buf = fs.readFileSync(full);
    totalBytes += buf.length;
    const type = MIME[path.extname(f).toLowerCase()] || "application/octet-stream";
    form.append("photos", new Blob([buf], { type }), f);
  }

  console.log(`Uploading ${(totalBytes / 1024 / 1024).toFixed(1)} MB...`);

  const res = await fetch(`${baseUrl}/api/gallery/publish`, {
    method: "POST",
    headers: { Cookie: `__Secure-next-auth.session-token=${cookie}` },
    body: form,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`\nUnexpected response (HTTP ${res.status}):\n${text.slice(0, 500)}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`\nFailed (HTTP ${res.status}): ${data.error || text}`);
    process.exit(1);
  }

  console.log(`\nDone. Uploaded ${data.uploaded}/${files.length} photos.`);
  if (data.errors?.length) {
    console.log("Errors:");
    for (const e of data.errors) console.log(`  - ${e.filename}: ${e.error}`);
  }
  console.log(`\nGallery URL: ${baseUrl}${data.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
