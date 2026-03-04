import fetch from 'node-fetch';

/**
 * TLEs (Two-Line Elements) are orbital data used to predict where satellites are.
 * We fetch the "Active" subset of the Iridium constellation from Celestrak,
 * which the DLS-140 Certus router connects to.
 */
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle';

let cachedTles: string | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (TLEs don't change frequently)

export async function getIridiumTles(): Promise<string> {
  const now = Date.now();
  if (cachedTles && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedTles;
  }

  try {
    console.log('[TLE Fetcher] Pulling fresh Iridium TLEs from Celestrak...');
    const response = await fetch(TLE_URL);
    if (!response.ok) {
      throw new Error(`Celestrak HTTP error: ${response.status}`);
    }
    const data = await response.text();
    cachedTles = data;
    lastFetchTime = now;
    console.log('[TLE Fetcher] Successfully cached Iridium TLEs');
    return data;
  } catch (err) {
    console.error('[TLE Fetcher] Error fetching TLEs:', err);
    // If we fail and have a stale cache, return it anyway so the app works
    if (cachedTles) return cachedTles;
    throw err;
  }
}
