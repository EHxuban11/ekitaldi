"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface GalleryPhoto {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  url: string;
  thumbUrl: string;
}

interface GalleryDetail {
  id: string;
  name: string;
  date: string | null;
  hasPassword: boolean;
  coverPhotoId: string | null;
  photos: GalleryPhoto[];
}

export default function GalleryDetailPage() {
  const { status } = useSession();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [gallery, setGallery] = useState<GalleryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchGallery = useCallback(async () => {
    try {
      const res = await fetch(`/api/gallery/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGallery(data);
    } catch {
      setGallery(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (status === "authenticated") fetchGallery();
  }, [status, fetchGallery]);

  const setCover = async (photoId: string) => {
    if (!gallery) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/gallery/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPhotoId: photoId }),
      });
      if (!res.ok) throw new Error("Failed to set cover");
      setGallery((prev) => (prev ? { ...prev, coverPhotoId: photoId } : prev));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm" style={{ color: "rgba(30,30,30,0.4)" }}>Gallery not found</p>
      </div>
    );
  }

  const photos = gallery.photos || [];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b" style={{ borderColor: "rgba(30,30,30,0.08)" }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: "rgba(30,30,30,0.4)" }}
            >
              &larr; Back
            </button>
            <span style={{ color: "rgba(30,30,30,0.15)" }}>/</span>
            <div>
              <h1 className="text-sm font-medium" style={{ color: "rgb(30,30,30)" }}>
                {gallery.name}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "rgba(30,30,30,0.35)" }}>
                {photos.length} photos
                {gallery.date && ` \u00b7 ${gallery.date}`}
              </p>
            </div>
          </div>
          <span className="text-xs" style={{ color: "rgba(30,30,30,0.3)" }}>
            {saving ? "Saving..." : "Click a photo to set it as cover"}
          </span>
        </div>
      </header>

      {/* Photo grid */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {photos.map((photo) => {
            const isCover = photo.id === gallery.coverPhotoId;
            return (
              <button
                key={photo.id}
                onClick={() => setCover(photo.id)}
                disabled={saving}
                className={`relative aspect-[3/2] overflow-hidden rounded-sm group transition-all ${
                  isCover
                    ? "ring-2 ring-gray-900"
                    : "hover:ring-2 hover:ring-gray-300"
                }`}
              >
                <img
                  src={photo.thumbUrl}
                  alt={photo.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {isCover && (
                  <div
                    className="absolute top-1.5 left-1.5 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-sm"
                    style={{ background: "rgb(30,30,30)", color: "white", letterSpacing: "0.5px" }}
                  >
                    Cover
                  </div>
                )}
                {!isCover && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity drop-shadow">
                      Set as cover
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
