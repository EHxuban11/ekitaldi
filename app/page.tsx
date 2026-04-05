"use client";

import { useEffect, useState } from "react";

interface PublicGallery {
  id: string;
  name: string;
  date: string | null;
  photoCount: number;
  hasPassword: boolean;
  coverUrl: string | null;
}

export default function Home() {
  const [galleries, setGalleries] = useState<PublicGallery[]>([]);

  useEffect(() => {
    fetch("/api/gallery/public")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setGalleries(data); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-14 sm:pt-20 pb-10">
        <h1
          className="font-bold uppercase tracking-wider text-center text-2xl sm:text-4xl"
          style={{ fontFamily: "var(--font-raleway), sans-serif", letterSpacing: "3px", color: "rgb(30,30,30)" }}
        >
          Ekitaldi
        </h1>
        <p className="mt-4 text-sm text-center" style={{ color: "rgba(30,30,30,0.5)", lineHeight: 1.7 }}>
          Private photo galleries for events and sessions.
        </p>

        {/* Gallery tiles */}
        <div className="mt-10 sm:mt-14 w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
          {galleries.map((g) => (
            <a
              key={g.id}
              href={`/gallery/${g.id}`}
              className="group relative aspect-[16/10] overflow-hidden bg-gray-100 rounded-sm"
            >
              {g.coverUrl && (
                <img
                  src={g.coverUrl}
                  alt={g.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <h2
                    className="font-bold uppercase text-white text-sm sm:text-lg"
                    style={{ fontFamily: "var(--font-raleway), sans-serif", letterSpacing: "1.5px" }}
                  >
                    {g.name}
                  </h2>
                  {g.hasPassword && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-white/60 mt-1 uppercase" style={{ letterSpacing: "1.5px" }}>
                  {g.date && <span>{g.date}</span>}
                  {g.date && <span> &middot; </span>}
                  {g.photoCount} photos
                </p>
              </div>
            </a>
          ))}
        </div>
      </main>

      {/* Admin link */}
      <div className="pb-6 text-center">
        <a
          href="/dashboard"
          className="text-[10px] transition-opacity hover:opacity-70"
          style={{ color: "rgba(30,30,30,0.2)" }}
        >
          Dashboard
        </a>
      </div>
    </div>
  );
}
