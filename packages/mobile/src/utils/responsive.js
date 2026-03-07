/**
 * Responsive scale utilities.
 *
 * Base design width = 393 (common modern Android/iPhone viewport).
 * On a 360dp Moto this gives scale ≈ 0.91, so everything shrinks ~9%.
 * On a large Fold unfolded (720dp) scale ≈ 1.83 — capped at 1.3 so
 * tablet layouts don't balloon.
 */
import { Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const BASE_W = 393;
const BASE_H = 852;

/** Linear scale — use for font sizes and fixed dimensions. Capped at 1.3 to prevent over-scaling on large screens. */
export const s = (size) => Math.round(size * Math.min(W / BASE_W, 1.3));

/** Moderate scale — dampens the scaling factor by half. Good for spacing where full scaling feels too aggressive. */
export const ms = (size, factor = 0.5) => Math.round(size + (s(size) - size) * factor);

/** Width percentage of current screen. */
export const wp = (pct) => Math.round((W * pct) / 100);

/** Height percentage of current screen. */
export const hp = (pct) => Math.round((H * pct) / 100);

/** Raw screen dimensions — useful for layout math. */
export const screenWidth = W;
export const screenHeight = H;

/** Is it a "small" screen (< 380dp wide)? */
export const isSmallScreen = W < 380;

/** Is it a "large" screen (> 500dp) — e.g. Fold unfolded? */
export const isLargeScreen = W > 500;
