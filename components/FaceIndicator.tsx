"use client";

// Per-photo person chips, revealed on hover over a gallery tile. Clicking a chip
// selects that person (filters the gallery to their photos). Only rendered for
// face-recognition galleries, see app/gallery/[id]/page.tsx.

import { personLabel } from "@/lib/i18n";

export interface ClusterInfo {
  personId: string;
  color: string;
  displayName?: string | null;
}

export default function FaceIndicator({
  personIds,
  clusterMap,
  onSelect,
  lang,
  max = 3,
}: {
  personIds: string[];
  clusterMap: Map<string, ClusterInfo>;
  onSelect: (personId: string) => void;
  lang?: string | null;
  max?: number;
}) {
  if (!personIds || personIds.length === 0) return null;
  const shown = personIds.slice(0, max);
  const extra = personIds.length - shown.length;

  return (
    <div className="absolute bottom-1 left-1 right-1 z-10 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      {shown.map((pid) => {
        const c = clusterMap.get(pid);
        if (!c) return null;
        return (
          <button
            key={pid}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(pid);
            }}
            className="flex items-center gap-1.5 rounded-full"
            style={{
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(4px)",
              padding: "2px 8px 2px 6px",
              fontSize: 10,
              fontWeight: 600,
              color: "rgb(40,40,40)",
              letterSpacing: "0.3px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
            title={personLabel(pid, c.displayName, lang)}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: c.color,
                flexShrink: 0,
              }}
            />
            {personLabel(pid, c.displayName, lang)}
          </button>
        );
      })}
      {extra > 0 && (
        <span
          className="rounded-full"
          style={{
            background: "rgba(255,255,255,0.92)",
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 600,
            color: "rgba(40,40,40,0.7)",
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
