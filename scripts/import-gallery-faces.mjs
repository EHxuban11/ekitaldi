#!/usr/bin/env node
// Attach already reviewed face assignments to an existing gallery. Does not
// run a model, re-upload photos, or replace existing person data.
import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const [galleryId, facesPath, ...options] = process.argv.slice(2);
if (!galleryId || !facesPath) throw new Error("Usage: node --env-file=.env.local scripts/import-gallery-faces.mjs <galleryId> <faces.json> [--dry-run]");
const data = JSON.parse(fs.readFileSync(facesPath, "utf8"));
const db = new PrismaClient();
try {
  const gallery = await db.gallery.findUnique({ where: { id: galleryId }, include: { photos: true, personClusters: true } });
  if (!gallery) throw new Error("Gallery not found");
  if (gallery.personClusters.length) throw new Error("Gallery already has person data; refusing to replace it");
  const photos = new Map(gallery.photos.filter((p) => p.section === "todas").map((p) => [p.filename, p]));
  const missing = data.photos.filter((p) => !photos.has(p.filename));
  if (missing.length) throw new Error(`${missing.length} photos have not been uploaded yet`);
  const palette = ["#E5989B", "#90BEDE", "#B5E48C", "#BDB2FF", "#FFB4A2", "#9AD1D4"];
  const clusters = data.clusters.map((c, i) => ({
    id: crypto.randomUUID(), galleryId, personId: c.person_id,
    size: c.size, displayName: c.label || null, color: palette[i % palette.length],
    exampleKeys: (c.example_files || []).map((f) => photos.get(f)?.thumbR2Key).filter(Boolean),
  }));
  const ids = new Map(clusters.map((c) => [c.personId, c.id]));
  const faces = data.faces.map((f) => ({
    galleryId, photoId: photos.get(f.filename).id, personClusterId: ids.get(f.person_id) || null,
    personId: f.person_id || null, bbox: f.bbox, confidence: f.confidence ?? null, faceIndex: f.face_index,
  }));
  console.log(`${gallery.name}: ${data.photos.length} photos, ${clusters.length} person filters, ${faces.length} face records`);
  if (options.includes("--dry-run")) console.log("Dry run: no changes made.");
  else {
    await db.$transaction([
      db.personCluster.createMany({ data: clusters }),
      ...data.photos.map((p) => db.galleryPhoto.update({ where: { id: photos.get(p.filename).id }, data: { personIds: p.person_ids } })),
      db.face.createMany({ data: faces }),
      db.gallery.update({ where: { id: galleryId }, data: { faceRecognitionEnabled: true } }),
    ]);
    console.log("Imported supplied filters and enabled the people bar.");
  }
} finally {
  await db.$disconnect();
}
