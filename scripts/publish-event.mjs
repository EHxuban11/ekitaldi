#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [slug, ...options] = process.argv.slice(2);

if (!slug) {
  console.error("Uso: npm run event:publish -- <slug> [--password-env VARIABLE]");
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
const faceDataPath = event.publish?.faceDataPath || event.faceDataPath;
const facesPath = faceDataPath ? path.resolve(eventDir, faceDataPath) : null;

const validation = spawnSync(process.execPath, ["scripts/check-event.mjs", slug], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (validation.status !== 0) process.exit(validation.status ?? 1);

if (event.publish?.passwordRequired && options.some((option) => option === "--password" || option.startsWith("--password="))) {
  console.error("Para este evento usa la variable local indicada en passwordEnv; no pases la clave por la línea de comandos.");
  process.exit(1);
}

if (event.publish?.passwordRequired && options.some((option) => option === "--password-env" || option.startsWith("--password-env="))) {
  console.error("La variable de contraseña se define en event.json para evitar publicar con una clave equivocada.");
  process.exit(1);
}

const passwordArgs = event.publish?.passwordRequired
  ? ["--password-env", event.publish.passwordEnv || "GALLERY_PASSWORD"]
  : [];
const args = [
  "--env-file=.env.local",
  "scripts/publish-wedding.mjs",
  event.name,
  sourceDir,
  "--date", event.date,
  "--language", event.language,
  "--slug", event.slug,
  "--max", String(event.publish?.maxImageSide ?? 3000),
  ...(event.publish?.faceRecognition ? [] : ["--skip-faces"]),
  "--event-file", configPath,
  ...(facesPath && fs.existsSync(facesPath) ? ["--faces-json", facesPath] : []),
  ...passwordArgs,
  ...options,
];

const result = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
if (event.presentation) {
  const presentation = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/sync-event-presentation.mjs", slug, "--apply"], { cwd: repoRoot, stdio: "inherit" });
  process.exit(presentation.status ?? 1);
}
