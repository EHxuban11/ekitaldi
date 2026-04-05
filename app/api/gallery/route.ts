import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getPublicUrl } from "@/lib/r2";

// List all galleries (admin only)
export async function GET() {
  try {
    await requireAdmin();

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
        createdAt: g.createdAt,
        hasPassword: !!g.passwordHash,
        photoCount: g._count.photos,
        coverThumb: coverPhoto?.thumbR2Key
          ? getPublicUrl(coverPhoto.thumbR2Key)
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
