export type SignalStrength = "strong" | "weak" | "none";

export function getSignalStrengthFromBars(
  bars: number,
  maxBars?: number,
): SignalStrength;

export function getSignalStrengthFromPercent(percent: number): SignalStrength;

export function getBarsFromPercent(percent: number, maxBars?: number): number;

export function getSignalColor(strength: SignalStrength, colors: any): string;

