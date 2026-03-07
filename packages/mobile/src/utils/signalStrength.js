export function getSignalStrengthFromBars(bars, maxBars = 4) {
  const safeBars = Number.isFinite(Number(bars)) ? Number(bars) : 0;
  const safeMax = Math.max(1, Number(maxBars) || 4);
  const ratio = Math.max(0, Math.min(1, safeBars / safeMax));
  if (ratio <= 0) return "none";
  if (ratio >= 0.6) return "strong";
  return "weak";
}

export function getSignalStrengthFromPercent(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  if (safePercent <= 0) return "none";
  if (safePercent >= 60) return "strong";
  return "weak";
}

export function getBarsFromPercent(percent, maxBars = 4) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const safeMax = Math.max(1, Number(maxBars) || 4);
  return Math.round((safePercent / 100) * safeMax);
}

export function getSignalColor(strength, colors) {
  if (strength === "strong") return colors.status.active;
  if (strength === "weak") return colors.status.warning;
  return colors.status.danger;
}
