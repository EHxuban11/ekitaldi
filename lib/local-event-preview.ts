import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const ROOT = path.resolve(process.cwd(), "events");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const THUMB_CACHE = path.join(os.tmpdir(), "txokofoto-galerias-preview-thumbs");
const dimensions = new Map<string, { mtimeMs: number; width: number | null; height: number | null }>();

type EventSection = { folder: string; key: string; mediaType?: "image" | "video" };
type EventTab = { key: string; sections: string[]; label?: string; labels?: Record<string, string> };
type LocalEvent = { slug: string; name: string; date?: string; language?: string; sourcePath: string; logo?: { hero?: string }; cover?: { section?: string; filename?: string }; sections: EventSection[]; tabs?: EventTab[]; faceDataPath?: string };

function safeSlug(slug: string) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug); }

export function loadLocalEvent(slug: string): LocalEvent | null {
  if (process.env.NODE_ENV === "production" || !safeSlug(slug)) return null;
  const configPath = path.join(ROOT, slug, "event.json");
  if (!fs.existsSync(configPath)) return null;
  const event = JSON.parse(fs.readFileSync(configPath, "utf8")) as LocalEvent;
  return event.sourcePath && Array.isArray(event.sections) ? event : null;
}

function sourceDirectory(slug: string, event: LocalEvent) {
  const eventDir = path.join(ROOT, slug);
  const source = path.resolve(eventDir, event.sourcePath);
  return source.startsWith(`${eventDir}${path.sep}`) ? source : null;
}

async function imageDimensions(asset: string) {
  const stat = fs.statSync(asset);
  const cached = dimensions.get(asset);
  if (cached?.mtimeMs === stat.mtimeMs) return cached;
  const metadata = await sharp(asset).rotate().metadata();
  const result = { mtimeMs: stat.mtimeMs, width: metadata.width || null, height: metadata.height || null };
  dimensions.set(asset, result);
  return result;
}



export async function localEventGallery(slug: string) {
  const event = loadLocalEvent(slug);
  if (!event) return null;
  const eventDir = path.join(ROOT, slug);
  const source = sourceDirectory(slug, event);
  if (!source || !fs.existsSync(source)) return null;
  const faceDataPath = event.faceDataPath ? path.resolve(eventDir, event.faceDataPath) : null;
  const faceData = faceDataPath && faceDataPath.startsWith(`${eventDir}${path.sep}`) && fs.existsSync(faceDataPath)
    ? JSON.parse(fs.readFileSync(faceDataPath, "utf8")) as { photos?: Array<{ filename: string; person_ids?: string[] }>; clusters?: Array<{ person_id: string; size: number; label?: string; example_faces?: string[] }>; faces?: Array<{ face_id: string; filename: string; bbox?: [number, number, number, number] }> }
    : null;
  const photoPeople = new Map((faceData?.photos || []).map((photo) => [photo.filename, photo.person_ids || []]));
  const sections = await Promise.all(event.sections.map(async (section) => {
    const folder = path.join(source, section.folder);
    if (!fs.existsSync(folder)) return [];
    const mediaType = section.mediaType || (section.key === "videos" ? "video" : "image");
    const extensions = mediaType === "video" ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
    return Promise.all(fs.readdirSync(folder).filter((file) => extensions.has(path.extname(file).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(async (filename, index) => {
        const sourceUrl = `/api/local-event/${slug}?section=${encodeURIComponent(section.key)}&file=${encodeURIComponent(filename)}`;
        const asset = path.join(folder, filename);
        const size = mediaType === "image" ? await imageDimensions(asset) : { width: null, height: null };
        return { id: `local-${section.key}-${index}`, filename, width: size.width, height: size.height, url: sourceUrl, thumbUrl: mediaType === "image" ? `${sourceUrl}&thumb=1` : sourceUrl, section: section.key, mediaType, personIds: photoPeople.get(filename) || [] };
      }));
  }));
  const photos = sections.flat();
  // Keep the configured cover first so the gallery hero and initial preview
  // use the event's chosen image instead of whichever filename sorts first.
  if (event.cover?.filename) {
    const coverIndex = photos.findIndex((photo) =>
      photo.filename === event.cover?.filename &&
      (!event.cover?.section || photo.section === event.cover.section),
    );
    if (coverIndex > 0) {
      const ordered = photos.slice();
      const [cover] = ordered.splice(coverIndex, 1);
      // Keep the selected cover first, followed immediately by the two
      // neighbouring frames on each side of the original sequence.
      const nearbyIndexes = [coverIndex - 2, coverIndex - 1, coverIndex + 1, coverIndex + 2]
        .filter((index) => index >= 0 && index < photos.length && index !== coverIndex)
        .map((index) => photos[index]);
      const nearbyIds = new Set(nearbyIndexes.map((photo) => photo.id));
      photos.splice(0, photos.length, cover, ...nearbyIndexes, ...ordered.filter((photo) => !nearbyIds.has(photo.id)));
    }
  }
  const logoUrl = event.logo?.hero ? `/api/local-event/${slug}?logo=hero` : undefined;
  const clusters = (faceData?.clusters || [])
    .filter((cluster) => cluster.person_id === "person_001" || cluster.person_id === "person_002" || cluster.size >= 3)
    .map((cluster, index) => ({ personId: cluster.person_id, size: cluster.size, color: ["#E5989B", "#90BEDE", "#B5E48C", "#BDB2FF", "#FFB4A2", "#9AD1D4"][index % 6], displayName: cluster.label || `Persona ${index + 1}`, ...(cluster.example_faces?.[0] ? { avatarUrl: `/api/local-event/${slug}?face=${encodeURIComponent(cluster.example_faces[0])}` } : {}) }));
  return { id: `local-${slug}`, name: event.name, date: event.date, language: event.language || "eu", type: "wedding", hasPassword: false, authenticated: true, totalPhotos: photos.length, nextCursor: null, photos, ...(logoUrl ? { logoUrl } : {}), faceRecognitionEnabled: clusters.length > 0, clusters, ...(event.tabs?.length ? { sectionTabs: event.tabs } : {}) };
}

export async function localEventThumbnail(asset: string) {
  const stat = fs.statSync(asset);
  const key = crypto.createHash("sha1").update(`${asset}:${stat.mtimeMs}`).digest("hex");
  const target = path.join(THUMB_CACHE, `${key}.webp`);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(THUMB_CACHE, { recursive: true });
    await sharp(asset).rotate().resize(600, undefined, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(target);
  }
  return fs.readFileSync(target);
}

export async function localEventFaceThumbnail(slug: string, faceId: string) {
  const event = loadLocalEvent(slug);
  if (!event || !event.faceDataPath || path.basename(faceId) !== faceId) return null;
  const eventDir = path.join(ROOT, slug);
  const dataPath = path.resolve(eventDir, event.faceDataPath);
  if (!dataPath.startsWith(`${eventDir}${path.sep}`) || !fs.existsSync(dataPath)) return null;
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8")) as { faces?: Array<{ face_id: string; filename: string; bbox?: [number, number, number, number] }> };
  const face = data.faces?.find((item) => item.face_id === faceId);
  if (!face?.bbox) return null;
  const source = sourceDirectory(slug, event);
  if (!source) return null;
  const section = event.sections.find((item) => fs.existsSync(path.join(source, item.folder, face.filename)));
  if (!section) return null;
  const asset = path.join(source, section.folder, face.filename);
  const metadata = await sharp(asset).rotate().metadata();
  if (!metadata.width || !metadata.height) return null;
  const [x, y, w, h] = face.bbox;
  const padX = w * 0.22;
  const padY = h * 0.22;
  const left = Math.max(0, Math.floor((x - padX) * metadata.width));
  const top = Math.max(0, Math.floor((y - padY) * metadata.height));
  const right = Math.min(metadata.width, Math.ceil((x + w + padX) * metadata.width));
  const bottom = Math.min(metadata.height, Math.ceil((y + h + padY) * metadata.height));
  return sharp(asset).rotate().extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }).resize(96, 96, { fit: "cover" }).normalize().modulate({ brightness: 1.08, saturation: 1.03 }).webp({ quality: 84 }).toBuffer();
}

export function localEventAsset(slug: string, sectionKey: string | null, filename: string | null, logo: boolean) {
  const event = loadLocalEvent(slug);
  if (!event) return null;
  const source = sourceDirectory(slug, event);
  if (!source) return null;
  let relative: string | undefined;
  if (logo) relative = event.logo?.hero;
  else {
    const section = event.sections.find((item) => item.key === sectionKey);
    if (!section || !filename || path.basename(filename) !== filename) return null;
    relative = path.join(section.folder, filename);
  }
  if (!relative) return null;
  const asset = path.resolve(source, relative);
  return asset.startsWith(`${source}${path.sep}`) && fs.existsSync(asset) ? asset : null;
}
