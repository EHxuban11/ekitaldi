import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getStrings } from "@/lib/i18n";

// Per-gallery social preview (OpenGraph/Twitter). The page itself is a client
// component and cannot export metadata, so this server layout supplies it, which
// is what WhatsApp/iMessage/Facebook/X read for the share card.
//
// For privacy we never expose a photo as og:image (galleries can be password
// protected); we only surface the gallery's name + date so a shared link reads
// as "Ainhoa eta Adrian" instead of the generic site default.
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const gallery = await db.gallery.findUnique({
    where: { id: params.id },
    select: { name: true, date: true, language: true },
  });
  if (!gallery) return { title: "Gallery" };

  const t = getStrings(gallery.language);
  const description = gallery.date ? `${gallery.name} · ${gallery.date}` : t.photoGallery;

  return {
    title: gallery.name,
    description,
    openGraph: {
      title: gallery.name,
      description,
      siteName: "Ekitaldi",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: gallery.name,
      description,
    },
  };
}

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
