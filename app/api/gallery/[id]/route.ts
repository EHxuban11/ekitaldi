import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { deleteGalleryFromR2, getPublicUrl } from "@/lib/r2";
import { hashPassword } from "@/lib/gallery-auth";
import { canAccessGallery } from "@/lib/gallery-access";
import { localEventGallery } from "@/lib/local-event-preview";
import { parseSectionTabs } from "@/lib/wedding";
import { parsePresentation, orderGalleryPhotos, orderGalleryPeople } from "@/lib/gallery-presentation";

// Get gallery details (public — used by gallery page)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (params.id.startsWith("local-")) {
      const preview = await localEventGallery(params.id.slice("local-".length));
      if (preview) return NextResponse.json(preview);
    }
    const gallery = await db.gallery.findFirst({
      where: { OR: [{ id: params.id }, { slug: params.id }] },
      include: {
        photos: { orderBy: { order: "asc" } },
        personClusters: { orderBy: { size: "desc" } },
      },
    });

    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
    }

    const hasPassword = !!gallery.passwordHash;
    const cookie = request.cookies.get(`gallery_${params.id}`)?.value;
    const hasAccess = await canAccessGallery(params.id, gallery.passwordHash, cookie);

    if (!hasAccess) {
      return NextResponse.json({
        id: gallery.id,
        name: gallery.name,
        hasPassword,
        authenticated: false,
        language: gallery.language,
        type: gallery.type,
      });
    }

    const presentation = gallery.type === "wedding" ? parsePresentation(gallery.brandingJson) : {};
    const sorted = orderGalleryPhotos(gallery.photos, gallery.coverPhotoId, presentation);

    // Pagination: ?cursor=<index>&limit=<n> (default 30). Face galleries return
    // the full set in one response so person-filtering spans the whole gallery;
    // non-face galleries keep the exact same paginated behavior as before.
    const facesOn = gallery.faceRecognitionEnabled;
    const wedding = gallery.type === "wedding";
    const sectionTabs = wedding ? parseSectionTabs(gallery.brandingJson) : undefined;
    const rich = facesOn || wedding; // return the whole set in one response
    const cursor = parseInt(request.nextUrl.searchParams.get("cursor") || "0", 10);
    const defaultLimit = rich ? sorted.length : 30;
    const limit = parseInt(
      request.nextUrl.searchParams.get("limit") || String(defaultLimit),
      10
    );
    const page = sorted.slice(cursor, cursor + limit);
    const hasMore = cursor + limit < sorted.length;

    const photosWithUrls = page.map((p) => ({
      id: p.id,
      filename: p.filename,
      width: p.width,
      height: p.height,
      url: getPublicUrl(p.r2Key),
      thumbUrl: getPublicUrl(p.thumbR2Key),
      ...(facesOn ? { personIds: p.personIds } : {}),
      ...(wedding ? { section: p.section, mediaType: p.mediaType } : {}),
    }));

    return NextResponse.json({
      id: gallery.id,
      name: gallery.name,
      date: gallery.date,
      hasPassword,
      authenticated: true,
      coverPhotoId: gallery.coverPhotoId,
      language: gallery.language,
      type: gallery.type,
      ...(sectionTabs ? { sectionTabs } : {}),
      ...(presentation.hero ? { hero: presentation.hero } : {}),
      ...(wedding && gallery.logoKey ? { logoUrl: getPublicUrl(gallery.logoKey) } : {}),
      totalPhotos: sorted.length,
      nextCursor: hasMore ? cursor + limit : null,
      photos: photosWithUrls,
      faceRecognitionEnabled: facesOn,
      ...(facesOn
        ? {
            clusters: orderGalleryPeople(gallery.personClusters, presentation).map((c) => ({
              personId: c.personId,
              size: c.size,
              color: c.color,
              displayName: c.displayName,
              avatarUrl: c.avatarKey ? getPublicUrl(c.avatarKey) : undefined,
              exampleUrls: c.exampleKeys.map(getPublicUrl),
            })),
          }
        : {}),
    }, { headers: { "Cache-Control": "private, no-store" } });
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
