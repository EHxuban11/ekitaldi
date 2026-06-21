import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPublicUrl } from "@/lib/r2";
import { verifyGalleryAccess } from "@/lib/gallery-auth";

// Download a single photo by photoId query param
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const photoId = request.nextUrl.searchParams.get("photoId");
    if (!photoId) {
      return NextResponse.json({ error: "photoId required" }, { status: 400 });
    }

    const gallery = await db.gallery.findFirst({
      where: { OR: [{ id: params.id }, { slug: params.id }] },
      include: { photos: { where: { id: photoId } } },
    });

    if (!gallery || !gallery.photos.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Check access
    if (gallery.passwordHash) {
      const cookie = request.cookies.get(`gallery_${params.id}`)?.value;
      if (!cookie || !verifyGalleryAccess(params.id, cookie)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const photo = gallery.photos[0];
    const publicUrl = getPublicUrl(photo.r2Key);

    // Fetch from R2 and stream back with download headers
    const r2Response = await fetch(publicUrl);
    if (!r2Response.ok) {
      return NextResponse.json({ error: "Download failed" }, { status: 500 });
    }

    const headers = new Headers();
    headers.set("Content-Disposition", `attachment; filename="${photo.filename}"`);
    headers.set("Content-Type", r2Response.headers.get("Content-Type") || "image/jpeg");
    const contentLength = r2Response.headers.get("Content-Length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(r2Response.body, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
