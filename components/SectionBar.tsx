"use client";

// Wedding-mode tabs (Todas / Familia / Los novios / Con amigos / Prints / Vídeos).
// Only shown for type="wedding" galleries; only tabs with photos appear.

import { WEDDING_SECTIONS, sectionLabel } from "@/lib/wedding";

export default function SectionBar({
  available,
  selected,
  onSelect,
  lang,
}: {
  available: Set<string>; // photo.section values present in the gallery
  selected: string; // selected UI section key
  onSelect: (key: string) => void;
  lang?: string | null;
}) {
  const visible = WEDDING_SECTIONS.filter((s) => s.sections.some((x) => available.has(x)));
  if (visible.length <= 1) return null;

  return (
    <div className="bg-white" style={{ borderBottom: "1px solid rgba(30,30,30,0.08)" }}>
      <div className="flex gap-1 overflow-x-auto px-3 sm:px-6">
        {visible.map((s) => {
          const active = selected === s.key;
          return (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              className="shrink-0 uppercase transition-colors"
              style={{
                fontSize: 11,
                letterSpacing: "1px",
                padding: "14px 12px",
                fontWeight: 600,
                color: active ? "rgb(30,30,30)" : "rgba(30,30,30,0.45)",
                borderBottom: active ? "2px solid rgb(30,30,30)" : "2px solid transparent",
              }}
            >
              {sectionLabel(s.key, lang)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
