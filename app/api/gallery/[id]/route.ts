import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { deleteGalleryFromR2, getPublicUrl } from "@/lib/r2";
import { hashPassword, verifyGalleryAccess } from "@/lib/gallery-auth";

// Get gallery details (public — used by gallery page)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gallery = await db.gallery.findUnique({
      where: { id: params.id },
      include: {
        photos: { orderBy: { order: "asc" } },
      },
    });

    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
    }

    const hasPassword = !!gallery.passwordHash;
    const cookie = request.cookies.get(`gallery_${params.id}`)?.value;
    const hasAccess =
      !gallery.passwordHash || (cookie ? verifyGalleryAccess(params.id, cookie) : false);

    if (!hasAccess) {
      return NextResponse.json({
        id: gallery.id,
        name: gallery.name,
        hasPassword,
        authenticated: false,
      });
    }

    // Sort photos: cover photo first, then by order
    const sorted = [...gallery.photos].sort((a, b) => {
      if (gallery.coverPhotoId) {
        if (a.id === gallery.coverPhotoId) return -1;
        if (b.id === gallery.coverPhotoId) return 1;
      }
      return a.order - b.order;
    });

    // Pagination: ?cursor=<index>&limit=<n> (default 30)
    const cursor = parseInt(request.nextUrl.searchParams.get("cursor") || "0", 10);
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "30", 10);
    const page = sorted.slice(cursor, cursor + limit);
    const hasMore = cursor + limit < sorted.length;

    const photosWithUrls = page.map((p) => ({
      id: p.id,
      filename: p.filename,
      width: p.width,
      height: p.height,
      url: getPublicUrl(p.r2Key),
      thumbUrl: getPublicUrl(p.thumbR2Key),
    }));

    return NextResponse.json({
      id: gallery.id,
      name: gallery.name,
      date: gallery.date,
      hasPassword,
      authenticated: true,
      coverPhotoId: gallery.coverPhotoId,
      totalPhotos: sorted.length,
      nextCursor: hasMore ? cursor + limit : null,
      photos: photosWithUrls,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Update gallery (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.date !== undefined) data.date = body.date;
    if (body.coverPhotoId !== undefined) data.coverPhotoId = body.coverPhotoId;
    if (body.password !== undefined) {
      data.passwordHash = body.password
        ? hashPassword(body.password)
        : null;
    }

    await db.gallery.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// Delete gallery (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();

    await deleteGalleryFromR2(params.id);
    await db.gallery.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
