/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
  async redirects() {
    // Keep previously shared misspellings working; every visitor lands on Akissi.
    return ["akisi-eta-aitor", "akasi-eta-aitor", "akassi-eta-aitor"].flatMap((legacySlug) => [
      { source: `/gallery/${legacySlug}`, destination: "/gallery/akissi-eta-aitor", permanent: true },
      { source: `/api/gallery/${legacySlug}/:path*`, destination: "/api/gallery/akissi-eta-aitor/:path*", permanent: true },
      { source: `/gallery/local-${legacySlug}`, destination: "/gallery/local-akissi-eta-aitor", permanent: false },
      { source: `/api/gallery/local-${legacySlug}`, destination: "/api/gallery/local-akissi-eta-aitor", permanent: false },
      { source: `/api/local-event/${legacySlug}`, destination: "/api/local-event/akissi-eta-aitor", permanent: false },
    ]);
  },
};

export default nextConfig;
