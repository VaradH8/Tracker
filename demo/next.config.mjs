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
      // Work log became Task log when tasks gained a submit-and-approve
      // flow. Anyone holding the old link lands on the new page.
      {
        source: "/engineering/worklog",
        destination: "/engineering/task-log",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        /**
         * Every Engineering API response is per-person and current by
         * definition: what one role may read another may not, and a
         * delivered count from a minute ago is simply wrong. Nothing
         * between the server and the browser may hold on to it.
         *
         * The client already asks with `cache: "no-store"`, but that is
         * the caller's promise, not the server's instruction — it does
         * nothing about a proxy in between, which could otherwise serve
         * one signed-in person's data to the next.
         */
        source: "/api/domain/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
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
