// Per-gallery UI strings. A gallery's `language` field selects the set.
// Keep these short; they appear on small chips and buttons.

export type Lang = "en" | "eu" | "es";

export interface Strings {
  photoGallery: string;
  viewGallery: string;
  enterPassword: string;
  incorrectPassword: string;
  peopleHeader: (n: number) => string;
  allPhotos: string;
  showAll: string;
  photosCount: (n: number) => string;
  personLabel: (n: number) => string;
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    photoGallery: "Photo Gallery",
    viewGallery: "View Gallery",
    enterPassword: "Enter password",
    incorrectPassword: "Incorrect password",
    peopleHeader: (n) => `${n} people in this gallery, tap to find someone`,
    allPhotos: "All photos",
    showAll: "Show all photos",
    photosCount: (n) => `${n} photo${n !== 1 ? "s" : ""}`,
    personLabel: (n) => `Person ${n}`,
  },
  eu: {
    photoGallery: "Argazki Galeria",
    viewGallery: "Ikusi galeria",
    enterPassword: "Sartu pasahitza",
    incorrectPassword: "Pasahitz okerra",
    peopleHeader: (n) => `${n} pertsona galeria honetan, sakatu norbait aurkitzeko`,
    allPhotos: "Argazki guztiak",
    showAll: "Erakutsi argazki guztiak",
    photosCount: (n) => `${n} argazki`,
    personLabel: (n) => `${n}. pertsona`,
  },
  es: {
    photoGallery: "Galería de fotos",
    viewGallery: "Ver galería",
    enterPassword: "Introduce la contraseña",
    incorrectPassword: "Contraseña incorrecta",
    peopleHeader: (n) => `${n} personas en esta galería, toca para encontrar a alguien`,
    allPhotos: "Todas las fotos",
    showAll: "Ver todas las fotos",
    photosCount: (n) => `${n} foto${n !== 1 ? "s" : ""}`,
    personLabel: (n) => `Persona ${n}`,
  },
};

export function getStrings(lang?: string | null): Strings {
  return STRINGS[(lang as Lang)] ?? STRINGS.en;
}

// Label for an anonymous person cluster, localized. displayName wins if set.
export function personLabel(personId: string, displayName?: string | null, lang?: string | null): string {
  if (displayName) return displayName;
  const n = parseInt(personId.split("_")[1] || "0", 10);
  return Number.isFinite(n) && n > 0 ? getStrings(lang).personLabel(n) : personId;
}
