const HEX = "37,20 28.5,34.7 11.5,34.7 3,20 11.5,5.3 28.5,5.3";
const CORE = "20,11 29,20 20,29 11,20";

/**
 * Dramatic reactor-themed achievement badge. A hexagonal frame with a glowing
 * diamond core and a slowly-rotating dashed containment ring. Unlocked badges
 * glow and animate in their own colour; locked badges are dim and static.
 */
export function AchievementBadge({
  color,
  unlocked,
  size = 34,
  pop = false,
}: {
  color: string;
  unlocked: boolean;
  size?: number;
  pop?: boolean;
}) {
  const c = unlocked ? color : "#3a3a44";
  const cls = [unlocked ? "badge-glow" : "", pop ? "anim-badge-pop" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cls || undefined}
      style={{ color: c }}
      aria-hidden
    >
      {/* Hexagon frame */}
      <polygon
        points={HEX}
        fill={unlocked ? `${c}14` : "none"}
        stroke={c}
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity={unlocked ? 1 : 0.45}
      />

      {/* Rotating containment ring (unlocked only) */}
      {unlocked && (
        <circle
          cx="20" cy="20" r="13"
          fill="none" stroke={c} strokeWidth="0.8"
          strokeDasharray="2 4" opacity="0.55"
          className="badge-ring"
        />
      )}

      {/* Glowing diamond core */}
      <polygon points={CORE} fill={c} opacity={unlocked ? 1 : 0.3} />
      {unlocked && <circle cx="20" cy="20" r="2.6" fill="#fffef2" />}
    </svg>
  );
}
