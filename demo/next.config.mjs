/**
 * Content-Security-Policy for the app's HTML pages.
 *
 * Everything the app loads is its own: scripts, styles, fonts (next/font
 * self-hosts them at build), images, API calls and the attachment preview
 * iframe. So the policy pins all of that to 'self' and closes the doors an
 * injected script would use: loading code from elsewhere, posting forms
 * off-site, rewriting <base>, plugins, and being framed by another site.
 *
 * 'unsafe-inline' scripts stay allowed: Next.js inlines its hydration
 * data, and the nonce alternative forces every page to render dynamically.
 * Dev also needs 'unsafe-eval' for React Refresh.
 *
 * Applied to pages, not /api/*: API answers are JSON or file downloads,
 * and the Engineering file preview (an iframe on a PDF) sets its own,
 * stricter sandbox CSP — a page-wide `object-src 'none'` on top would stop
 * the browser's PDF viewer from rendering it.
 */
const isDev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

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
        // Every path except /api/* — see the CSP comment above.
        source: "/((?!api/).*)",
        headers: [{ key: "Content-Security-Policy", value: CSP }],
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
