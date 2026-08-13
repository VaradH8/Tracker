/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    // The module was renamed Domain -> Engineering and its routes moved with
    // it. Anyone holding a /domain bookmark would otherwise hit a 404, so
    // keep the old paths pointing at the new ones. Permanent: the old URLs
    // are not coming back.
    return [
      { source: "/domain", destination: "/engineering", permanent: true },
      {
        source: "/domain/:path*",
        destination: "/engineering/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
