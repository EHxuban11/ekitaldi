"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import GalleryLightbox, { ThumbnailRect } from "@/components/GalleryLightbox";
import ShareModal from "@/components/ShareModal";
import PeopleBar, { Cluster } from "@/components/PeopleBar";
import FaceIndicator, { ClusterInfo, personLabel } from "@/components/FaceIndicator";

// Row-by-row masonry: assigns each photo to the shortest column
function useMasonryColumns(photos: GalleryPhoto[], colCount: number): GalleryPhoto[][] {
  return useMemo(() => {
    const cols: GalleryPhoto[][] = Array.from({ length: colCount }, () => []);
    const heights = new Array(colCount).fill(0);
    for (const photo of photos) {
      const shortest = heights.indexOf(Math.min(...heights));
      cols[shortest].push(photo);
      const ratio = (photo.height || 3) / (photo.width || 4);
      heights[shortest] += ratio;
    }
    return cols;
  }, [photos, colCount]);
}

function MasonryGrid({ photos, onPhotoClick, clusterMap, onSelectPerson }: {
  photos: GalleryPhoto[];
  onPhotoClick: (index: number, rect: ThumbnailRect) => void;
  clusterMap?: Map<string, ClusterInfo>;
  onSelectPerson?: (personId: string) => void;
}) {
  const [colCount, setColCount] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setColCount(2);
      else if (w < 768) setColCount(2);
      else if (w < 1024) setColCount(3);
      else setColCount(4);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const columns = useMasonryColumns(photos, colCount);

  // Build a flat index map: for each photo id, what's its index in the original array
  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    photos.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [photos]);

  return (
    <div className="flex gap-1">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="flex-1 flex flex-col gap-1">
          {col.map((photo) => {
            const flatIndex = indexMap.get(photo.id) ?? 0;
            return (
              <div
                key={photo.id}
                data-photo-index={flatIndex}
                className="cursor-pointer overflow-hidden relative group"
                onClick={(e) => {
                  const img = e.currentTarget.querySelector("img");
                  if (img) {
                    const rect = img.getBoundingClientRect();
                    onPhotoClick(flatIndex, { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                  } else {
                    onPhotoClick(flatIndex, { top: 0, left: 0, width: 0, height: 0 });
                  }
                }}
              >
                <img
                  src={photo.thumbUrl}
                  alt={photo.filename}
                  className="w-full block bg-gray-100 transition-transform duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                  style={
                    photo.width && photo.height
                      ? { aspectRatio: `${photo.width}/${photo.height}` }
                      : undefined
                  }
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" />
                {clusterMap && onSelectPerson && photo.personIds && photo.personIds.length > 0 && (
                  <FaceIndicator
                    personIds={photo.personIds}
                    clusterMap={clusterMap}
                    onSelect={onSelectPerson}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface GalleryPhoto {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  url: string;
  thumbUrl: string;
  personIds?: string[];
}

interface GalleryData {
  id: string;
  name: string;
  date?: string;
  hasPassword: boolean;
  authenticated: boolean;
  totalPhotos?: number;
  nextCursor?: number | null;
  photos?: GalleryPhoto[];
  faceRecognitionEnabled?: boolean;
  clusters?: Cluster[];
}

export default function GalleryPage() {
  const params = useParams();
  const id = params.id as string;

  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [thumbRect, setThumbRect] = useState<ThumbnailRect | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [r2Blocked, setR2Blocked] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchGallery = useCallback(async (cursor?: number) => {
    try {
      const url = cursor != null
        ? `/api/gallery/${id}?cursor=${cursor}`
        : `/api/gallery/${id}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGallery(data);
      if (data.photos) {
        setPhotos((prev) => cursor ? [...prev, ...data.photos] : data.photos);
        setNextCursor(data.nextCursor ?? null);
        setTotalPhotos(data.totalPhotos ?? data.photos.length);
      }
    } catch {
      if (!cursor) setGallery(null);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  // Detect if R2 storage is blocked (e.g. Spanish ISP blocking Cloudflare during La Liga matches)
  useEffect(() => {
    if (photos.length === 0) return;
    const img = new Image();
    const timeout = setTimeout(() => { setR2Blocked(true); }, 8000);
    img.onload = () => clearTimeout(timeout);
    img.onerror = () => { clearTimeout(timeout); setR2Blocked(true); };
    img.src = photos[0].thumbUrl;
    return () => clearTimeout(timeout);
  }, [photos]);

  // Infinite scroll — observe sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || nextCursor === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor !== null && !loadingMore) {
          setLoadingMore(true);
          fetchGallery(nextCursor);
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, fetchGallery]);

  // Face-recognition derived state (no-ops for normal galleries).
  const clusters: Cluster[] = useMemo(() => gallery?.clusters ?? [], [gallery]);
  const facesEnabled = !!gallery?.faceRecognitionEnabled && clusters.length > 0;
  const clusterMap = useMemo(() => {
    const m = new Map<string, ClusterInfo>();
    for (const c of clusters) {
      m.set(c.personId, { personId: c.personId, color: c.color, displayName: c.displayName });
    }
    return m;
  }, [clusters]);
  const displayedPhotos = useMemo(() => {
    if (!facesEnabled || !selectedPerson) return photos;
    return photos.filter((p) => p.personIds?.includes(selectedPerson));
  }, [facesEnabled, selectedPerson, photos]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`/api/gallery/${id}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setAuthError("Incorrect password");
        return;
      }
      await fetchGallery();
    } catch {
      setAuthError("Something went wrong");
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">Gallery not found</p>
      </div>
    );
  }

  // Password gate
  if (gallery.hasPassword && !gallery.authenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <form
          onSubmit={handleAuth}
          className="w-full max-w-sm px-6"
        >
          <h1 className="text-xl font-light text-gray-900 text-center mb-1">
            {gallery.name}
          </h1>
          {gallery.date && (
            <p className="text-sm text-gray-400 text-center mb-8">
              {gallery.date}
            </p>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 mb-3"
            autoFocus
          />
          {authError && (
            <p className="text-sm text-red-500 mb-3">{authError}</p>
          )}
          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            View Gallery
          </button>
        </form>
      </div>
    );
  }

  const coverPhoto = photos[0];

  const scrollToGrid = () => {
    document.getElementById("gallery-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="bg-white">
      {/* R2 blocked banner */}
      {r2Blocked && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-3 text-center">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">Photos can&apos;t load right now.</span>{" "}
            Your ISP is blocking our image server (thanks, La Liga). Try again after the match ends, or use a VPN.
          </p>
          <button
            onClick={() => setR2Blocked(false)}
            className="absolute top-2 right-3 text-amber-400 hover:text-amber-600 text-lg"
          >
            &times;
          </button>
        </div>
      )}

      {/* Cover / Hero Section */}
      {coverPhoto && (
        <section className="relative h-screen w-full select-none overflow-hidden">
          <img
            src={coverPhoto.thumbUrl}
            alt={gallery.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <img
            src={coverPhoto.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
            style={{ opacity: 0 }}
            onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = "1"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          <div className="absolute inset-0 z-10 flex flex-col justify-between text-white px-5 py-12 sm:px-6 sm:py-20">
            <p className="text-[10px] tracking-[2px] uppercase text-white">
              Photo Gallery
            </p>
            <div className="pb-6 sm:pb-12">
              <h1
                className="font-bold uppercase text-white text-2xl sm:text-4xl md:text-[52px]"
                style={{ fontFamily: "var(--font-raleway), sans-serif", letterSpacing: "2.6px", margin: 0 }}
              >
                {gallery.name}
              </h1>
              {gallery.date && (
                <p className="text-xs sm:text-sm uppercase text-white/70" style={{ letterSpacing: "2.1px", marginTop: "12px" }}>
                  {gallery.date}
                </p>
              )}
              <button
                onClick={scrollToGrid}
                className="inline-flex items-center border border-white text-white text-[11px] font-medium uppercase hover:bg-white/10 transition-all duration-250"
                style={{ letterSpacing: "1.65px", padding: "0 24px", height: "40px", marginTop: "24px" }}
              >
                View Gallery
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Gallery Grid Section */}
      <section id="gallery-grid">
        <header className="sticky top-0 z-10 bg-white" style={{ height: "60px" }}>
          <div className="h-full flex items-center justify-between px-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <h1
                className="font-bold uppercase truncate"
                style={{ fontFamily: "var(--font-raleway), sans-serif", fontSize: "13px", letterSpacing: "1.2px", color: "rgb(30,30,30)" }}
              >
                {gallery.name}
              </h1>
              <p className="uppercase hidden sm:block" style={{ fontSize: "9px", color: "rgba(30,30,30,0.6)", marginTop: "4px" }}>
                Photo Gallery
              </p>
            </div>
            <div className="flex items-center">
              <button
                className="flex items-center justify-center transition-opacity duration-200"
                style={{ width: "45px", height: "37px", color: "rgba(30,30,30,0.6)" }}
                title="Share"
                onClick={() => setShowShare(true)}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.8"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {facesEnabled && (
          <PeopleBar
            clusters={clusters}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
          />
        )}

        <div className="px-2 pb-6 sm:px-5 sm:pb-8">
          {facesEnabled && selectedPerson && (
            <div className="flex items-center justify-between px-2 sm:px-3 pt-1 pb-3">
              <span className="text-xs" style={{ color: "rgba(30,30,30,0.55)" }}>
                {personLabel(selectedPerson, clusterMap.get(selectedPerson)?.displayName)} ·{" "}
                {displayedPhotos.length} photo{displayedPhotos.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setSelectedPerson(null)}
                className="text-xs underline"
                style={{ color: "rgba(30,30,30,0.55)" }}
              >
                Show all photos
              </button>
            </div>
          )}

          <MasonryGrid
            photos={displayedPhotos}
            onPhotoClick={(index, rect) => { setThumbRect(rect); setLightboxIndex(index); }}
            clusterMap={facesEnabled ? clusterMap : undefined}
            onSelectPerson={facesEnabled ? setSelectedPerson : undefined}
          />

          {!selectedPerson && nextCursor !== null && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          )}

          {(selectedPerson || nextCursor === null) && displayedPhotos.length > 0 && (
            <p className="text-center py-6 text-xs" style={{ color: "rgba(30,30,30,0.3)" }}>
              {selectedPerson ? displayedPhotos.length : totalPhotos} photos
            </p>
          )}
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <GalleryLightbox
          photos={displayedPhotos}
          currentIndex={lightboxIndex}
          onClose={() => { setLightboxIndex(null); setThumbRect(null); }}
          onNavigate={setLightboxIndex}
          galleryId={id}
          thumbRect={thumbRect}
        />
      )}

      {/* Share modal */}
      {showShare && (
        <ShareModal
          url={typeof window !== "undefined" ? window.location.href : ""}
          title={gallery.name}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
