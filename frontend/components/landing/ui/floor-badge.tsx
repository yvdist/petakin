/** Signature motif: magenta outline circle with a floor label. */
export default function FloorBadge({
  label = "1F",
  size = 44,
  className = "",
}: {
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full border font-jbmono font-medium text-magenta ${className}`}
      style={{
        width: size,
        height: size,
        borderColor: "var(--color-magenta)",
        borderWidth: 1.5,
        fontSize: Math.round(size * 0.3),
        background: "rgba(255,255,255,0.85)",
      }}
    >
      {label}
    </span>
  );
}
