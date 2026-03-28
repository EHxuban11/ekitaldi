import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uploadToR2 } from "@/lib/r2";
import { hashPassword } from "@/lib/gallery-auth";
import { requireAdmin } from "@/lib/auth";
import sharp from "sharp";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const date = formData.get("date") as string | null;
    const password = formData.get("password") as string | null;
    const files = formData.getAll("photos") as File[];

    if (!name || !files.length) {
      return NextResponse.json(
        { error: "Name and photos are required" },
        { status: 400 }
      );
    }

    const passwordHash = password ? hashPassword(password) : null;

    // Create gallery
    const gallery = await db.gallery.create({
      data: {
        name,
        date: date || null,
        passwordHash,
      },
    });

    // Process and upload each photo
    const results: { filename: string; error?: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);

        // Get metadata before processing
        const metadata = await sharp(fileBuffer).metadata();

        // Full-size JPEG: strip EXIF by re-encoding, auto-rotate
        const fullBuffer = await sharp(fileBuffer)
          .rotate()
          .jpeg({ quality: 92 })
          .toBuffer();

        // Thumbnail: 600px wide, WebP
        const thumbBuffer = await sharp(fileBuffer)
          .rotate()
          .resize(600, undefined, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const r2Key = `galleries/${gallery.id}/${safeFilename}`;
        const thumbR2Key = `galleries/${gallery.id}/thumbs/${safeFilename}.webp`;

        await uploadToR2(r2Key, fullBuffer, "image/jpeg");
        await uploadToR2(thumbR2Key, thumbBuffer, "image/webp");

        await db.galleryPhoto.create({
          data: {
            galleryId: gallery.id,
            r2Key,
            filename: file.name,
            order: i,
            width: metadata.width || null,
            height: metadata.height || null,
            thumbR2Key,
          },
        });

        results.push({ filename: file.name });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        results.push({ filename: file.name, error: message });
      }
    }

    const uploaded = results.filter((r) => !r.error).length;
    const errors = results.filter((r) => r.error);

    return NextResponse.json({
      galleryId: gallery.id,
      uploaded,
      errors,
      url: `/gallery/${gallery.id}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
