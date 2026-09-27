import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { localEventAsset, localEventFaceThumbnail, localEventThumbnail } from "@/lib/local-event-preview";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".tif": "image/tiff", ".tiff": "image/tiff", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v" };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const faceId = request.nextUrl.searchParams.get("face");
  if (faceId) {
    const body = await localEventFaceThumbnail(params.slug, faceId);
    return body
      ? new NextResponse(new Uint8Array(body), { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store" } })
      : new NextResponse("Not found", { status: 404 });
  }
  const asset = localEventAsset(params.slug, request.nextUrl.searchParams.get("section"), request.nextUrl.searchParams.get("file"), request.nextUrl.searchParams.get("logo") === "hero");
  if (!asset) return new NextResponse("Not found", { status: 404 });
  const thumb = request.nextUrl.searchParams.get("thumb") === "1";
  const body = thumb ? await localEventThumbnail(asset) : fs.readFileSync(asset);
  const contentType = thumb ? "image/webp" : (MIME[path.extname(asset).toLowerCase()] || "application/octet-stream");
  return new NextResponse(body, { headers: { "Content-Type": contentType, "Cache-Control": "no-store" } });
}
