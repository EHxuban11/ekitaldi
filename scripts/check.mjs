// Read-only connectivity check against PRODUCTION Neon DB + Cloudflare R2.
// Run: node --env-file=.env.local scripts/check.mjs
import { PrismaClient } from "@prisma/client";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

console.log("Prisma URL host:", (process.env.POSTGRES_PRISMA_URL || "").replace(/:[^:@/]+@/, ":***@").split("?")[0]);

const galleries = await db.gallery.findMany({
  include: { _count: { select: { photos: true } } },
  orderBy: { createdAt: "asc" },
});
console.log(`\nDB OK — ${galleries.length} galleries:`);
for (const g of galleries) {
  console.log(`  - ${g.id}  "${g.name}"  photos=${g._count.photos}  password=${!!g.passwordHash}`);
}

const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
console.log(`\nR2 OK — bucket "${bucket}", ${listed.KeyCount} of ${listed.Contents?.length ? "(sample)" : 0} keys:`);
for (const o of listed.Contents || []) console.log(`  - ${o.Key}`);

await db.$disconnect();
console.log("\n✓ Both production connections work.");
