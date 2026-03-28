"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";

interface GalleryItem {
  id: string;
  name: string;
  date: string | null;
  createdAt: string;
  hasPassword: boolean;
  photoCount: number;
  coverThumb: string | null;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [galleries, setGalleries] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchGalleries = useCallback(async () => {
    try {
      const res = await fetch("/api/gallery");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setGalleries(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchGalleries();
  }, [status, fetchGalleries]);

  const copyLink = (gallery: GalleryItem) => {
    const url = `${window.location.origin}/gallery/${gallery.id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(gallery.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startEditing = (gallery: GalleryItem) => {
    setEditingId(gallery.id);
    setEditName(gallery.name);
  };

  const saveName = async (id: string) => {
    if (editingId !== id) return;
    if (!editName.trim()) { setEditingId(null); return; }
    setEditingId(null);
    try {
      const res = await fetch(`/api/gallery/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setGalleries((prev) =>
        prev.map((g) => (g.id === id ? { ...g, name: editName.trim() } : g))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const deleteGallery = async (gallery: GalleryItem) => {
    setDeletingId(gallery.id);
    try {
      const res = await fetch(`/api/gallery/${gallery.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setGalleries((prev) => prev.filter((g) => g.id !== gallery.id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1
            className="font-bold uppercase tracking-wider mb-8"
            style={{ fontFamily: "var(--font-raleway), sans-serif", fontSize: "24px", letterSpacing: "2px", color: "rgb(30,30,30)" }}
          >
            Ekitaldi
          </h1>
          <button
            onClick={() => signIn("github")}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase border transition-all duration-200 hover:bg-gray-900 hover:text-white"
            style={{ letterSpacing: "1.65px", padding: "0 24px", height: "40px", borderColor: "rgb(30,30,30)", color: "rgb(30,30,30)" }}
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b" style={{ borderColor: "rgba(30,30,30,0.08)" }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="font-bold uppercase" style={{ fontFamily: "var(--font-raleway), sans-serif", fontSize: "14px", letterSpacing: "1.5px", color: "rgb(30,30,30)" }}>
              Ekitaldi
            </a>
            <span style={{ color: "rgba(30,30,30,0.15)" }}>/</span>
            <span className="text-sm" style={{ color: "rgba(30,30,30,0.5)" }}>Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: "rgba(30,30,30,0.4)" }}>
              {session?.user?.name}
            </span>
            <button
              onClick={() => signOut()}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: "rgba(30,30,30,0.4)" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Gallery list */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-xs font-semibold uppercase mb-8" style={{ letterSpacing: "2px", color: "rgb(30,30,30)" }}>
          Galleries
        </h2>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
          </div>
        ) : galleries.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: "rgba(30,30,30,0.5)" }}>No galleries yet</p>
            <p className="text-xs mt-2" style={{ color: "rgba(30,30,30,0.3)" }}>
              Use the upload API to publish your first gallery
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleries.map((gallery) => (
              <div
                key={gallery.id}
                className="border rounded overflow-hidden group"
                style={{ borderColor: "rgba(30,30,30,0.08)" }}
              >
                {/* Cover */}
                <div
                  className="aspect-[3/2] bg-gray-50 relative cursor-pointer"
                  onClick={() => (window.location.href = `/dashboard/${gallery.id}`)}
                >
                  {gallery.coverThumb && (
                    <img
                      src={gallery.coverThumb}
                      alt={gallery.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity drop-shadow">
                      Manage photos
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  {editingId === gallery.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveName(gallery.id);
                      }}
                      className="mb-2"
                    >
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                        style={{ borderColor: "rgba(30,30,30,0.15)", color: "rgb(30,30,30)" }}
                        autoFocus
                        onBlur={() => saveName(gallery.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    </form>
                  ) : (
                    <h2
                      className="text-sm font-medium mb-1 cursor-pointer hover:opacity-70 transition-opacity"
                      style={{ color: "rgb(30,30,30)" }}
                      onClick={() => startEditing(gallery)}
                      title="Click to rename"
                    >
                      {gallery.name}
                    </h2>
                  )}
                  <div className="flex items-center gap-2 text-xs mb-3" style={{ color: "rgba(30,30,30,0.4)" }}>
                    {gallery.date && <span>{gallery.date}</span>}
                    {gallery.date && <span>&middot;</span>}
                    <span>{gallery.photoCount} photos</span>
                    {gallery.hasPassword && (
                      <>
                        <span>&middot;</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(gallery)}
                      className="flex-1 px-3 py-1.5 border rounded text-xs transition-colors hover:bg-gray-50"
                      style={{ borderColor: "rgba(30,30,30,0.1)", color: "rgba(30,30,30,0.6)" }}
                    >
                      {copiedId === gallery.id ? "Copied!" : "Copy Link"}
                    </button>

                    {deleteConfirmId === gallery.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => deleteGallery(gallery)}
                          disabled={deletingId === gallery.id}
                          className="px-3 py-1.5 bg-red-500 text-white rounded text-xs transition-colors hover:bg-red-600"
                        >
                          {deletingId === gallery.id ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1.5 border rounded text-xs transition-colors hover:bg-gray-50"
                          style={{ borderColor: "rgba(30,30,30,0.1)", color: "rgba(30,30,30,0.4)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(gallery.id)}
                        className="px-3 py-1.5 border rounded text-xs transition-colors hover:border-red-200 hover:text-red-400"
                        style={{ borderColor: "rgba(30,30,30,0.1)", color: "rgba(30,30,30,0.25)" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
