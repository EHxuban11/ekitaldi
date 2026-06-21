#!/usr/bin/env node
// Delete a gallery: its R2 objects (galleries/<id>/...) and the DB row (photos,
// clusters, faces cascade). Irreversible.
//
// Usage: node --env-file=.env.local scripts/delete-gallery.mjs <galleryId>

import { PrismaClient } from "@prisma/client";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

async function main() {
  const galleryId = process.argv[2];
  if (!galleryId) {
    console.error("Usage: node --env-file=.env.local scripts/delete-gallery.mjs <galleryId>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    include: { _count: { select: { photos: true } } },
  });
  if (!gallery) {
    console.error("Gallery not found:", galleryId);
    process.exit(1);
  }
  console.log(`Deleting "${gallery.name}" (${gallery._count.photos} photos)…`);

  const bucket = process.env.R2_BUCKET_NAME;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const prefix = `galleries/${galleryId}/`;
  let token, removed = 0;
  do {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    if (listed.Contents?.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key })) } }));
      removed += listed.Contents.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);

  await prisma.gallery.delete({ where: { id: galleryId } });
  await prisma.$disconnect();
  console.log(`Deleted ${removed} R2 objects + the gallery row.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
