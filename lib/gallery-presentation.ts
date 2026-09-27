export interface GalleryPresentation {
  openingPhotos?: Array<{ section: string; filename: string }>;
  peopleOrder?: string[];
  hero?: { showLogo?: boolean; positionX?: number };
}

// These preferences belong to a gallery, never to the shared wedding defaults.
export function parsePresentation(brandingJson: string | null): GalleryPresentation {
  try {
    const value = brandingJson ? JSON.parse(brandingJson)?.presentation : null;
    if (!value || typeof value !== "object") return {};
    const result: GalleryPresentation = {};
    if (Array.isArray(value.openingPhotos) && value.openingPhotos.every((photo: unknown) =>
      photo && typeof photo === "object" &&
      typeof (photo as Record<string, unknown>).section === "string" &&
      typeof (photo as Record<string, unknown>).filename === "string")) {
      result.openingPhotos = value.openingPhotos;
    }
    if (Array.isArray(value.peopleOrder) && value.peopleOrder.every((id: unknown) => typeof id === "string")) {
      result.peopleOrder = value.peopleOrder;
    }
    if (value.hero && typeof value.hero === "object") {
      result.hero = {};
      if (typeof value.hero.showLogo === "boolean") result.hero.showLogo = value.hero.showLogo;
      if (typeof value.hero.positionX === "number" && Number.isFinite(value.hero.positionX) &&
        value.hero.positionX >= 0 && value.hero.positionX <= 100) result.hero.positionX = value.hero.positionX;
    }
    return result;
  } catch {
    return {};
  }
}

export function orderGalleryPhotos<T extends { id: string; filename: string; section?: string | null; order?: number }>(
  photos: T[], coverPhotoId: string | null | undefined, presentation: GalleryPresentation,
): T[] {
  const ordered = [...photos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const first: T[] = [];
  const seen = new Set<string>();
  const add = (photo: T | undefined) => {
    if (photo && !seen.has(photo.id)) { first.push(photo); seen.add(photo.id); }
  };
  add(ordered.find((photo) => photo.id === coverPhotoId));
  for (const pin of presentation.openingPhotos || []) {
    add(ordered.find((photo) => photo.section === pin.section && photo.filename === pin.filename));
  }
  return [...first, ...ordered.filter((photo) => !seen.has(photo.id))];
}

export function orderGalleryPeople<T extends { personId: string }>(people: T[], presentation: GalleryPresentation): T[] {
  const priority = new Map((presentation.peopleOrder || []).map((id, index) => [id, index]));
  return [...people].sort((a, b) =>
    (priority.get(a.personId) ?? priority.size) - (priority.get(b.personId) ?? priority.size));
}
