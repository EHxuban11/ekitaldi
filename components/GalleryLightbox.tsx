"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ShareModal from "./ShareModal";

interface GalleryPhoto {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  url: string;
  thumbUrl: string;
  mediaType?: string;
}

export interface ThumbnailRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface GalleryLightboxProps {
  photos: GalleryPhoto[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  galleryId: string;
  thumbRect?: ThumbnailRect | null;
}

export default function GalleryLightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
  galleryId,
  thumbRect,
}: GalleryLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showShare, setShowShare] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [showClone, setShowClone] = useState(!!thumbRect);
  const [cloneExpanded, setCloneExpanded] = useState(false);
  const [lightboxReady, setLightboxReady] = useState(!thumbRect);
  const [closingTo, setClosingTo] = useState<ThumbnailRect | null>(null);
  const [bgOpacity, setBgOpacity] = useState(thumbRect ? 0 : 1);
  const fullImgLoaded = useRef(false);
  const isClosing = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const photo = photos[currentIndex] || photos[0];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  // A shareable deep link to THIS photo (works on any ekitaldi gallery).
  const photoShareUrl = () => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${window.location.pathname}?p=${photo.id}`;
  };

  const computeFinalRect = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 48;
    const headerH = 56;
    const footerH = 40;
    const availW = vw - pad * 2;
    const availH = vh - headerH - footerH;
    const imgW = photo.width || 1600;
    const imgH = photo.height || 1067;
    const ratio = Math.min(availW / imgW, availH / imgH, 1);
    const w = imgW * ratio;
    const h = imgH * ratio;
    return { width: w, height: h, left: (vw - w) / 2, top: headerH + (availH - h) / 2 };
  }, [photo.width, photo.height]);

  useEffect(() => {
    if (!thumbRect) return;

    const img = new Image();
    img.src = photo.url;
    img.onload = () => { fullImgLoaded.current = true; };

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCloneExpanded(true);
        setBgOpacity(1);
      });
    });

    const timer = setTimeout(() => {
      setLightboxReady(true);
      setTimeout(() => setShowClone(false), 50);
    }, 330);

    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, []); // mount only

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    [currentIndex - 1, currentIndex + 1]
      .filter((i) => i >= 0 && i < photos.length)
      .forEach((i) => {
        const img = new Image();
        img.src = photos[i].url;
      });
  }, [currentIndex, photos]);

  const handleClose = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;

    const thumbEl = document.querySelector(`[data-photo-index="${currentIndex}"] img`) as HTMLElement | null;
    const targetRect = thumbEl?.getBoundingClientRect();

    if (targetRect) {
      setClosingTo(null);
      setShowClone(true);
      setCloneExpanded(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setLightboxReady(false);
          setClosingTo({
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          });
          setBgOpacity(0);
        });
      });

      setTimeout(onClose, 330);
    } else {
      setBgOpacity(0);
      setTimeout(onClose, 300);
    }
  }, [currentIndex, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
        else handleClose();
      }
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(currentIndex + 1);
    },
    [zoom, handleClose, hasPrev, hasNext, currentIndex, onNavigate]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const newZoom = Math.max(1, Math.min(10, zoom - e.deltaY * 0.005));
      setZoom(newZoom);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging && zoom > 1) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom > 1) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || zoom > 1) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && hasNext) onNavigate(currentIndex + 1);
      if (dx > 0 && hasPrev) onNavigate(currentIndex - 1);
    }
  };

  const handleDownload = async () => {
    const url = `/api/gallery/${galleryId}/download?photoId=${photo.id}`;
    try {
      if ("showSaveFilePicker" in window) {
        const ext = photo.filename.split(".").pop()?.toLowerCase() || "jpg";
        const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
        const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: photo.filename,
          types: [{ description: "Image", accept: { [mimeMap[ext] || "image/jpeg"]: [`.${ext}`] } }],
        });
        const res = await fetch(url);
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = photo.filename;
    a.click();
  };

  const getCloneStyle = (): React.CSSProperties => {
    if (closingTo) {
      return {
        position: "fixed", zIndex: 99999,
        left: closingTo.left, top: closingTo.top,
        width: closingTo.width, height: closingTo.height,
        transition: "all 300ms ease", overflow: "hidden", borderRadius: 0,
      };
    }
    if (cloneExpanded) {
      const r = computeFinalRect();
      return {
        position: "fixed", zIndex: 99999,
        left: r.left, top: r.top, width: r.width, height: r.height,
        transition: "all 300ms ease", overflow: "hidden",
      };
    }
    if (thumbRect) {
      return {
        position: "fixed", zIndex: 99999,
        left: thumbRect.left, top: thumbRect.top,
        width: thumbRect.width, height: thumbRect.height,
        transition: "all 300ms ease", overflow: "hidden",
      };
    }
    return {};
  };

  if (!photos.length || !photo) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[49]"
        style={{ backgroundColor: "white", opacity: bgOpacity, transition: "opacity 300ms ease" }}
      />

      {showClone && (
        <div style={getCloneStyle()}>
          {photo.mediaType === "video" ? (
            <div className="w-full h-full bg-black" />
          ) : (
            <img
              src={photo.thumbUrl}
              alt={photo.filename}
              className="w-full h-full object-contain"
              draggable={false}
            />
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className="fixed inset-0 z-50 flex flex-col"
        style={{
          opacity: lightboxReady ? 1 : 0,
          transition: "opacity 150ms ease",
          pointerEvents: lightboxReady ? "auto" : "none",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 z-10">
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div className="flex items-center gap-5">
            <button onClick={handleDownload} className="text-gray-400 hover:text-gray-700 transition-colors" title="Download">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button onClick={() => setShowShare(true)} className="text-gray-400 hover:text-gray-700 transition-colors" title="Share">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </div>
        </div>

        <div
          className="flex-1 flex items-center justify-center overflow-hidden relative px-2 pb-4 sm:px-12 sm:pb-8"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
        >
          {photo.mediaType === "video" ? (
            <video
              src={photo.url}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <img
              src={photo.url}
              alt={photo.filename}
              className="max-h-full max-w-full object-contain select-none"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transition: dragging ? "none" : "transform 0.2s ease-out",
              }}
              draggable={false}
              onDoubleClick={() => {
                if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
                else setZoom(3);
              }}
            />
          )}
          {hasPrev && (
            <button onClick={() => onNavigate(currentIndex - 1)} className="absolute left-0 top-0 bottom-0 w-10 sm:w-24 flex items-center justify-start pl-2 sm:pl-3 text-gray-300 hover:text-gray-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          {hasNext && (
            <button onClick={() => onNavigate(currentIndex + 1)} className="absolute right-0 top-0 bottom-0 w-10 sm:w-24 flex items-center justify-end pr-2 sm:pr-3 text-gray-300 hover:text-gray-500 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          )}
        </div>

        <div className="py-2 sm:py-3 text-center">
          <span className="text-[10px] sm:text-xs text-gray-400">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>

        {showShare && (
          <ShareModal
            url={photoShareUrl()}
            title={photo.filename}
            onClose={() => setShowShare(false)}
          />
        )}
      </div>
    </>
  );
}
