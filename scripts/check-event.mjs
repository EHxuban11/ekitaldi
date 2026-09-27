#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];

if (!slug) {
  console.error("Uso: npm run event:check -- <slug>");
  process.exit(1);
}

const eventDir = path.join(repoRoot, "events", slug);
const configPath = path.join(eventDir, "event.json");
if (!fs.existsSync(configPath)) {
  console.error(`No existe la ficha del evento: ${configPath}`);
  process.exit(1);
}

const event = JSON.parse(fs.readFileSync(configPath, "utf8"));
const sourceDir = path.resolve(eventDir, event.sourcePath);
const requiredFolders = event.sections.map((section) => section.folder).concat("LOGOS");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const videoExtensions = new Set([".mp4", ".mov", ".webm", ".m4v"]);

let valid = true;
const fail = (message) => {
  console.error(message);
  valid = false;
};

if (!event.slug || !event.name || !event.sourcePath || !Array.isArray(event.sections) || !event.sections.length) {
  fail("event.json debe incluir slug, nombre, sourcePath y al menos una sección.");
}
if (!sourceDir.startsWith(`${eventDir}${path.sep}`)) {
  fail("sourcePath debe estar dentro de la carpeta del evento.");
}
const sectionKeys = new Set();
const sectionFolders = new Set();
for (const section of event.sections) {
  if (!section.folder || !section.key || !section.label) fail("Cada sección debe incluir folder, key y label.");
  if (sectionKeys.has(section.key) || sectionFolders.has(section.folder)) fail("Las claves y carpetas de las secciones deben ser únicas.");
  sectionKeys.add(section.key);
  sectionFolders.add(section.folder);
}
console.log(`Evento: ${event.name} (${event.slug})`);
console.log(`Origen: ${sourceDir}`);

for (const folder of requiredFolders) {
  const folderPath = path.join(sourceDir, folder);
  if (!fs.existsSync(folderPath)) {
    console.error(`Falta la carpeta: ${folder}`);
    valid = false;
    continue;
  }
  const isVideo = folder === "VIDEOS";
  const extensions = isVideo ? videoExtensions : imageExtensions;
  const count = fs.readdirSync(folderPath).filter((file) => extensions.has(path.extname(file).toLowerCase())).length;
  console.log(`${folder}: ${count} archivo(s)`);
  if (!count) fail(`No hay archivos publicables en: ${folder}`);
}

for (const logo of Object.values(event.logo || {})) {
  if (typeof logo === "string" && !fs.existsSync(path.join(sourceDir, logo))) {
    fail(`No existe el logotipo configurado: ${logo}`);
  }
}

if (event.cover?.filename) {
  const coverFolder = event.cover.section
    ? event.sections.find((section) => section.key === event.cover.section)?.folder
    : undefined;
  if (!coverFolder) {
    fail("La portada configurada debe indicar una sección existente.");
  } else if (!fs.existsSync(path.join(sourceDir, coverFolder, event.cover.filename))) {
    fail(`No existe la portada configurada: ${event.cover.filename}`);
  }
}

if (event.publish?.faceRecognition && !event.people?.consentConfirmed) {
  fail("El reconocimiento facial requiere people.consentConfirmed: true.");
}

if (!valid) process.exit(1);
console.log("Manifest y material validados.");
