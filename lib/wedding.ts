// Wedding-mode section config. The UI shows these tabs; each maps to one or more
// stored GalleryPhoto.section values (e.g. "Familia" combines the framed and
// unframed family folders, as the client asked).

export interface WeddingSection {
  key: string;
  sections: string[]; // photo.section values this tab includes
}

export const WEDDING_SECTIONS: WeddingSection[] = [
  { key: "todas", sections: ["todas"] },
  { key: "familia", sections: ["familia_marco", "familia_importante"] },
  { key: "novios_solos", sections: ["novios_solos"] },
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

export function sectionLabel(key: string, lang?: string | null): string {
  const l = LABELS[key];
  if (!l) return key;
  return l[(lang as string) || "en"] || l.en;
}
