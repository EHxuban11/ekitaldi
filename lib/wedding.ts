// Wedding-mode section config. The UI shows these tabs; each maps to one or more
// stored GalleryPhoto.section values (e.g. "Familia" combines the framed and
// unframed family folders, as the client asked).

export interface WeddingSection {
  key: string;
  sections: string[]; // photo.section values this tab includes
  label?: string;
  labels?: Record<string, string>;
}

export function parseSectionTabs(brandingJson: string | null): WeddingSection[] | undefined {
  if (!brandingJson) return undefined;
  try {
    const tabs: unknown = JSON.parse(brandingJson).tabs;
    if (!Array.isArray(tabs) || !tabs.length) return undefined;
    if (!tabs.every((tab) => tab && typeof tab.key === "string" &&
      Array.isArray(tab.sections) && tab.sections.length > 0 &&
      tab.sections.every((section: unknown) => typeof section === "string") &&
      (tab.label === undefined || typeof tab.label === "string") &&
      (tab.labels === undefined || (tab.labels && typeof tab.labels === "object" &&
        Object.values(tab.labels).every((label) => typeof label === "string"))))) return undefined;
    if (new Set(tabs.map((tab) => tab.key)).size !== tabs.length) return undefined;
    return tabs;
  } catch {
    return undefined;
  }
}

export const WEDDING_SECTIONS: WeddingSection[] = [
  { key: "novios_solos", sections: ["novios_solos"] },
  { key: "todas", sections: ["todas"] },
  { key: "familia", sections: ["familia_marco", "familia_importante"] },
  { key: "novios_con_amigos", sections: ["novios_con_amigos"] },
  { key: "prints", sections: ["prints"] },
  { key: "videos", sections: ["videos"] },
];

const LABELS: Record<string, Record<string, string>> = {
  todas: { en: "All photos", es: "Todas las fotos", eu: "Argazki guztiak" },
  familia: { en: "Family", es: "Familia", eu: "Familia" },
  novios_solos: { en: "The couple", es: "Los novios", eu: "Bikotea" },
  novios_con_amigos: { en: "With friends", es: "Con amigos", eu: "Lagunekin" },
  prints: { en: "Prints", es: "Prints", eu: "Prints" },
  videos: { en: "Videos", es: "Vídeos", eu: "Bideoak" },
};

export function sectionLabel(section: WeddingSection | string, lang?: string | null): string {
  if (typeof section !== "string") {
    const custom = section.labels?.[(lang as string) || "en"] || section.label;
    if (custom) return custom;
  }
  const key = typeof section === "string" ? section : section.key;
  const l = LABELS[key];
  if (!l) return key;
  return l[(lang as string) || "en"] || l.en;
}
