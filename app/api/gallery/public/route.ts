import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPublicUrl } from "@/lib/r2";
import { getAdminSession } from "@/lib/auth";

// Always read fresh from the DB — otherwise Next.js statically caches this
// route at build time and the homepage never shows newly-added galleries.
export const dynamic = "force-dynamic";

// Keep protected tiles visible; details are available only to signed-in admins.
export async function GET() {
  try {
    const isAdmin = !!(await getAdminSession());
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
      const redact = !!g.passwordHash && !isAdmin;
      const coverPhoto = g.coverPhotoId
        ? g.photos.find((p) => p.id === g.coverPhotoId)
        : g.photos[0];

      return {
        id: g.id,
        slug: redact ? null : g.slug,
        name: redact ? "Protected Gallery" : g.name,
        date: g.date,
        photoCount: g._count.photos,
        hasPassword: !!g.passwordHash,
        // Censor covers of password-protected galleries on the public landing
        // page, so a private gallery never leaks a preview image.
        coverUrl: redact
          ? null
          : coverPhoto?.thumbR2Key
            ? getPublicUrl(coverPhoto.thumbR2Key)
            : null,
      };
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
