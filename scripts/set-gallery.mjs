#!/usr/bin/env node
// Update a gallery's settings.
//   node --env-file=.env.local scripts/set-gallery.mjs <galleryId> [options]
// Options:
//   --password <pw>     set a password
//   --clear-password    remove the password
//   --language <code>   "en" | "eu" | "es"
//   --name <name>
//   --date <date>

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

// must match lib/gallery-auth.ts exactly so the gallery unlocks
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function parse(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--password") opts.password = argv[++i];
    else if (a === "--clear-password") opts.clearPassword = true;
    else if (a === "--language") opts.language = argv[++i];
    else if (a === "--slug") opts.slug = argv[++i];
    else if (a === "--name") opts.name = argv[++i];
    else if (a === "--date") opts.date = argv[++i];
    else pos.push(a);
  }
  return { galleryId: pos[0], opts };
}

async function main() {
  const { galleryId, opts } = parse(process.argv.slice(2));
  if (!galleryId) {
    console.error("Usage: node --env-file=.env.local scripts/set-gallery.mjs <galleryId> [--password pw|--clear-password] [--language eu] [--name ..] [--date ..]");
    process.exit(1);
  }
  const data = {};
  if (opts.password) data.passwordHash = hashPassword(opts.password);
  if (opts.clearPassword) data.passwordHash = null;
  if (opts.language) data.language = opts.language;
  if (opts.slug) data.slug = opts.slug;
  if (opts.name) data.name = opts.name;
  if (opts.date) data.date = opts.date;
  if (Object.keys(data).length === 0) {
    console.error("Nothing to update.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const g = await prisma.gallery.update({ where: { id: galleryId }, data });
  console.log(`Updated "${g.name}": ${Object.keys(data).join(", ")}`);
  console.log(`  password: ${g.passwordHash ? "set" : "none"}, language: ${g.language}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
