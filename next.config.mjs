/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
  async redirects() {
    // Keep previously shared misspellings working; every visitor lands on Akassi.
    return ["akisi-eta-aitor", "akasi-eta-aitor"].flatMap((legacySlug) => [
      { source: `/gallery/${legacySlug}`, destination: "/gallery/akassi-eta-aitor", permanent: true },
      { source: `/api/gallery/${legacySlug}/:path*`, destination: "/api/gallery/akassi-eta-aitor/:path*", permanent: true },
      { source: `/gallery/local-${legacySlug}`, destination: "/gallery/local-akassi-eta-aitor", permanent: false },
      { source: `/api/gallery/local-${legacySlug}`, destination: "/api/gallery/local-akassi-eta-aitor", permanent: false },
      { source: `/api/local-event/${legacySlug}`, destination: "/api/local-event/akassi-eta-aitor", permanent: false },
    ]);
  },
};

export default nextConfig;
