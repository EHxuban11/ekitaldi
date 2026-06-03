import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPublicUrl } from "@/lib/r2";

// Always read fresh from the DB — otherwise Next.js statically caches this
// route at build time and the homepage never shows newly-added galleries.
export const dynamic = "force-dynamic";

// Public gallery list — no auth, returns only public-safe info
export async function GET() {
  try {
    const allGalleries = await db.gallery.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { photos: true } },
        photos: {
          orderBy: { order: "asc" },
          select: { id: true, thumbR2Key: true },
        },
      },
    });

    const result = allGalleries.map((g) => {
      const coverPhoto = g.coverPhotoId
        ? g.photos.find((p) => p.id === g.coverPhotoId)
        : g.photos[0];

      return {
        id: g.id,
        name: g.name,
        date: g.date,
        photoCount: g._count.photos,
        hasPassword: !!g.passwordHash,
        coverUrl: coverPhoto?.thumbR2Key
          ? getPublicUrl(coverPhoto.thumbR2Key)
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
