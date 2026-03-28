import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword,
  signGalleryAccess,
} from "@/lib/gallery-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { password } = (await request.json()) as { password: string };
    const gallery = await db.gallery.findUnique({
      where: { id: params.id },
    });

    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
    }

    // No password set — grant access
    if (!gallery.passwordHash) {
      const token = signGalleryAccess(params.id);
      const response = NextResponse.json({ success: true });
      response.cookies.set(`gallery_${params.id}`, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
      return response;
    }

    // Verify password
    if (!verifyPassword(password, gallery.passwordHash)) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    const token = signGalleryAccess(params.id);
    const response = NextResponse.json({ success: true });
    response.cookies.set(`gallery_${params.id}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
