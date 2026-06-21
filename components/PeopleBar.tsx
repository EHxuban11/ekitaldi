"use client";

// The "find me in the photos" people strip shown above a face-recognition
// gallery's grid. Tapping a person filters the grid to their photos; "All
// photos" clears the filter. Only rendered when clusters exist.

import { getStrings, personLabel } from "@/lib/i18n";

export interface Cluster {
  personId: string;
  size: number;
  color: string;
  displayName?: string | null;
  avatarUrl?: string;
  exampleUrls?: string[];
}

export default function PeopleBar({
  clusters,
  selected,
  onSelect,
  lang,
}: {
  clusters: Cluster[];
  selected: string | null;
  onSelect: (personId: string | null) => void;
  lang?: string | null;
}) {
  if (!clusters || clusters.length === 0) return null;
  const t = getStrings(lang);

  return (
    <div className="px-4 sm:px-6 pt-3 pb-1">
      <div className="flex items-center gap-2 mb-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "rgba(30,30,30,0.4)" }}
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span
          className="uppercase"
          style={{ fontSize: 10, letterSpacing: "1px", color: "rgba(30,30,30,0.5)" }}
        >
          {t.peopleHeader(clusters.length)}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
        <button
          onClick={() => onSelect(null)}
          className="flex items-center shrink-0 rounded-full transition-colors"
          style={{
            height: 38,
            padding: "0 16px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.3px",
            border: "1px solid",
            borderColor: selected === null ? "rgb(30,30,30)" : "rgba(30,30,30,0.15)",
            background: selected === null ? "rgb(30,30,30)" : "white",
            color: selected === null ? "white" : "rgb(30,30,30)",
          }}
        >
          {t.allPhotos}
        </button>

        {clusters.map((c) => {
          const active = selected === c.personId;
          const avatar = c.avatarUrl || c.exampleUrls?.[0];
          return (
            <button
              key={c.personId}
              onClick={() => onSelect(active ? null : c.personId)}
              className="flex items-center shrink-0 rounded-full transition-colors"
              style={{
                height: 38,
                padding: avatar ? "0 14px 0 4px" : "0 14px",
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.3px",
                border: "1px solid",
                borderColor: active ? "rgb(30,30,30)" : "rgba(30,30,30,0.15)",
                background: active ? "rgb(30,30,30)" : "white",
                color: active ? "white" : "rgb(30,30,30)",
              }}
              title={`${personLabel(c.personId, c.displayName, lang)} (${c.size})`}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  width={30}
                  height={30}
                  loading="lazy"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: `2px solid ${c.color}`,
                  }}
                />
              ) : (
                <span
                  style={{ width: 12, height: 12, borderRadius: "50%", background: c.color }}
                />
              )}
              {personLabel(c.personId, c.displayName, lang)}
              <span style={{ opacity: 0.55, fontWeight: 500 }}>{c.size}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
