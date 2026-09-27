import { getAdminSession } from "@/lib/auth";
import { verifyGalleryAccess } from "@/lib/gallery-auth";

// Admin access lasts only as long as the GitHub session. Do not issue a guest
// gallery cookie: signing out must restore the password gate immediately.
export async function canAccessGallery(
  galleryId: string,
  passwordHash: string | null,
  cookie?: string,
): Promise<boolean> {
  if (!passwordHash) return true;
  if (await getAdminSession()) return true;
  return !!cookie && verifyGalleryAccess(galleryId, cookie);
}
