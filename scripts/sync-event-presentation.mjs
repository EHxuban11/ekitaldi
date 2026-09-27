#!/usr/bin/env node
// Apply an event's explicit presentation settings and reviewed avatar choices
// to an existing gallery. Dry-run by default; never reruns recognition.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const [slug, ...flags] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Usage: node --env-file=.env.local scripts/sync-event-presentation.mjs <slug> [--apply]");
const eventDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "events", slug);
const event = JSON.parse(fs.readFileSync(path.join(eventDir, "event.json"), "utf8"));
const apply = flags.includes("--apply");
const localPath = (...parts) => {
  const resolved = path.resolve(eventDir, ...parts);
  if (!resolved.startsWith(eventDir + path.sep)) throw new Error("Asset path leaves the event directory");
  return resolved;
};
const db = new PrismaClient();
try {
  const gallery = await db.gallery.findUnique({ where: { slug }, include: { photos: true, personClusters: true } });
  if (!gallery || gallery.type !== "wedding") throw new Error("Wedding gallery not found");
  if (!event.presentation) throw new Error("No presentation settings configured");
  for (const pin of event.presentation.openingPhotos || []) {
    if (!gallery.photos.some((photo) => photo.filename === pin.filename && photo.section === pin.section)) throw new Error(`Opening photo not uploaded: ${pin.filename}`);
  }
  if (event.presentation.hero?.showLogo && !gallery.logoKey) throw new Error("Hero logo has not been uploaded");
  const previous = gallery.brandingJson ? JSON.parse(gallery.brandingJson) : {};
  const brandingJson = JSON.stringify({ ...previous, presentation: event.presentation });
  const avatars = [];
  if (event.people?.avatarSelection === "reviewed") {
    if (!event.people.consentConfirmed) throw new Error("Supplied person filters require confirmed consent");
    const data = JSON.parse(fs.readFileSync(localPath(event.faceDataPath), "utf8").replace(/^\uFEFF/, ""));
    if (data.params?.source !== "local-opencv-yunet-sface") throw new Error("Unexpected face coordinate format");
    const faces = new Map(data.faces.map((face) => [face.face_id, face]));
    const choices = new Map(data.clusters.map((cluster) => [cluster.person_id, cluster.example_faces?.[0]]));
    for (const cluster of gallery.personClusters) {
      const face = faces.get(choices.get(cluster.personId));
      if (!face?.bbox || face.person_id !== cluster.personId) throw new Error(`Reviewed avatar missing or mismatched: ${cluster.personId}`);
      const section = event.sections.find((section) => fs.existsSync(localPath(event.sourcePath, section.folder, face.filename)));
      if (!section) throw new Error(`Reviewed source image missing: ${face.filename}`);
      const asset = localPath(event.sourcePath, section.folder, face.filename);
      const metadata = await sharp(asset).rotate().metadata();
      const [x, y, w, h] = face.bbox;
      if (!metadata.width || !metadata.height || ![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error("Invalid reviewed face box");
      // Match the friend's preview crop and image finishing exactly.
      const left = Math.max(0, Math.floor((x - w * 0.22) * metadata.width));
      const top = Math.max(0, Math.floor((y - h * 0.22) * metadata.height));
      const right = Math.min(metadata.width, Math.ceil((x + w + w * 0.22) * metadata.width));
      const bottom = Math.min(metadata.height, Math.ceil((y + h + h * 0.22) * metadata.height));
      const body = await sharp(asset).rotate().extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
        .resize(96, 96, { fit: "cover" }).normalize().modulate({ brightness: 1.08, saturation: 1.03 }).webp({ quality: 84 }).toBuffer();
      const digest = crypto.createHash("sha256").update(body).digest("hex").slice(0, 20);
      avatars.push({ clusterId: cluster.id, personId: cluster.personId, faceId: face.face_id, body,
        key: `galleries/${gallery.id}/avatars/reviewed/${cluster.personId}-${digest}.webp` });
    }
  }
  console.log(`${gallery.name}: ${event.presentation.openingPhotos?.length || 0} opening photos, ${avatars.length} reviewed avatars, people priority ${event.presentation.peopleOrder?.join(", ") || "default"}`);
  if (!apply) console.log("Dry run complete: no database or R2 changes.");
  else {
    const exportDir = localPath("exports");
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, `presentation-backup-${Date.now()}.json`), JSON.stringify({ galleryId: gallery.id, brandingJson: gallery.brandingJson, avatars: gallery.personClusters.map(({ id, personId, avatarKey }) => ({ id, personId, avatarKey })) }, null, 2));
    const s3 = new S3Client({ region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < avatars.length) {
        const avatar = avatars[next++];
        await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: avatar.key, Body: avatar.body, ContentType: "image/webp" }));
      }
    }));
    await db.$transaction([
      db.gallery.update({ where: { id: gallery.id }, data: { brandingJson } }),
      ...avatars.map((avatar) => db.personCluster.update({ where: { id: avatar.clusterId }, data: {
        avatarKey: avatar.key,
        ...(event.people?.labels?.[avatar.personId] ? { displayName: event.people.labels[avatar.personId] } : {}),
      } })),
    ]);
    fs.writeFileSync(path.join(exportDir, "reviewed-avatar-manifest.json"), JSON.stringify(avatars.map(({ personId, faceId, key }) => ({ personId, faceId, key })), null, 2));
    console.log("Event presentation and reviewed avatars applied. Photos, person assignments, and passwords unchanged.");
  }
} finally {
  await db.$disconnect();
}
