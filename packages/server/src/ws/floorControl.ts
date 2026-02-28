// Server-side floor control helper — validates timestamps, detects rogue transmissions
export function isTimestampValid(timestamp: number, windowMs = 5000): boolean {
  return Math.abs(Date.now() - timestamp) < windowMs;
}
