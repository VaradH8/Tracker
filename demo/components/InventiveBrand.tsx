/**
 * The Inventive logo, shared by both modules.
 *
 * The supplied artwork (inventivebizsol.com/images/logo-01.png) has a
 * WHITE wordmark on transparency — it is drawn for the dark navy header on
 * the company site. On the module's white surfaces the word "Inventive"
 * would simply vanish, leaving a floating arrow ring and "with you".
 *
 * So the logo is always given the dark ground it was designed for, using
 * the brand's own navy (#001e3c, the site header) shading into its
 * scrolled-header slate (#0f172a). That keeps the mark faithful rather
 * than recolouring someone else's identity, and reads as a deliberate
 * brand panel rather than an image dropped on the wrong background.
 *
 * If a dark-text version of the artwork ever arrives, this is the one
 * place that needs to change — Tracker and Engineering both render
 * through here.
 */

/** The brand's own navy, lifted from the site's header styles. */
export const BRAND_NAVY = "linear-gradient(135deg, #001e3c 0%, #0f172a 100%)";

export function InventiveLogo({
  className = "",
  height = 34,
}: {
  className?: string;
  /** Rendered height in px; width follows the artwork's 656:233 ratio. */
  height?: number;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/inventive-logo.png"
      alt="Inventive"
      height={height}
      width={Math.round((height * 656) / 233)}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}

/**
 * Logo plus the module name, on the dark panel — the top of a nav rail or
 * a sign-in card.
 *
 * The name stays alongside the mark: the logo says whose product this is,
 * the caption says which part of it you are in, and dropping the second
 * would leave Tracker and Engineering indistinguishable at a glance.
 */
export function BrandPanel({
  label,
  height = 34,
  className = "",
  subdued = false,
}: {
  /** Which part of the product this is — "Engineering", "Task Manager". */
  label: string;
  height?: number;
  className?: string;
  /** Renders the caption smaller, for the narrow top bar. */
  subdued?: boolean;
}) {
  return (
    <span
      className={`flex items-center ${subdued ? "gap-2.5" : "gap-3"} ${className}`}
      style={{ background: BRAND_NAVY }}
    >
      <InventiveLogo height={height} />
      {/* A hairline between the mark and the module name. Without it the
          two read as one crowded wordmark; with it they read as a lockup
          — company, then which part of it you are in.
          Fixed height rather than self-stretch: the panel is content-height
          in the narrow top bar, where stretching resolved to nothing and
          the divider silently disappeared. */}
      <span
        aria-hidden
        className={`w-px bg-white/25 shrink-0 ${subdued ? "h-4" : "h-5"}`}
      />
      <span
        className={`font-medium tracking-wide text-white/75 leading-none whitespace-nowrap ${
          subdued ? "text-[12px]" : "text-[13px]"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
