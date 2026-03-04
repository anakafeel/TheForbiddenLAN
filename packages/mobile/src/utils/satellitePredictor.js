import * as satellite from 'satellite.js';
import { comms } from './comms';
import { CONFIG } from '../config';
import * as FileSystem from 'expo-file-system/legacy';

const TLE_CACHE_FILE = FileSystem.cacheDirectory + 'iridium_tles.txt';
const MIN_ELEVATION_DEGREES = 10; // Iridium Certus typically needs >10 degrees elevation

let cachedTransmitters = [];
let lastFetch = 0;

/**
 * Fetch the latest Iridium TLEs from the ForbiddenLAN relay server.
 * The server securely caches Celestrak data to avoid NORAD rate limits.
 */
export async function updateTLEs(jwt) {
  try {
    const url = CONFIG.WS_URL.replace('ws://', 'http://').replace('/ws', '/tle/iridium');
    
    // Check if we have a recent local cache first
    const fileInfo = await FileSystem.getInfoAsync(TLE_CACHE_FILE);
    if (fileInfo.exists && (Date.now() - fileInfo.modificationTime * 1000) < 12 * 60 * 60 * 1000) {
      const data = await FileSystem.readAsStringAsync(TLE_CACHE_FILE);
      parseTLEs(data);
      lastFetch = Date.now();
      return;
    }

    // Fetch from our relay server
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${jwt}` }
    });
    
    if (response.ok) {
      const data = await response.text();
      await FileSystem.writeAsStringAsync(TLE_CACHE_FILE, data);
      parseTLEs(data);
      lastFetch = Date.now();
    }
  } catch (err) {
    console.warn('[SatellitePredictor] Failed to update TLEs:', err);
    // If offline, try to load from the stale cache anyway
    try {
      if ((await FileSystem.getInfoAsync(TLE_CACHE_FILE)).exists) {
        const data = await FileSystem.readAsStringAsync(TLE_CACHE_FILE);
        parseTLEs(data);
      }
    } catch (_) {}
  }
}

/**
 * Parses the raw TLE text block into satellite.js SatRec objects
 */
function parseTLEs(tleData) {
  const lines = tleData.trim().split('\n');
  cachedTransmitters = [];
  
  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i].trim();
    const tle1 = lines[i+1].trim();
    const tle2 = lines[i+2].trim();
    
    try {
      const satrec = satellite.twoline2satrec(tle1, tle2);
      cachedTransmitters.push({ name, satrec });
    } catch (e) {
      // Ignore invalid TLE blocks
    }
  }
  console.log(`[SatellitePredictor] Parsed ${cachedTransmitters.length} Iridium TLEs`);
}

/**
 * Predicts the next passes of Iridium satellites over the device's current location.
 * @returns {Array} List of { name, elevation, azimuth, distance } of visible satellites
 */
export function getVisibleSatellites() {
  const gps = comms.getGPS();
  // Default to a fallback coordinate if GPS hasn't locked yet
  const observerGd = {
    longitude: satellite.degreesToRadians(gps?.lng ?? -74.0060),
    latitude: satellite.degreesToRadians(gps?.lat ?? 40.7128),
    height: (gps?.alt ?? 10) / 1000 // satellite.js expects altitude in km
  };
  
  const now = new Date();
  const gmst = satellite.gcost(now);
  const visible = [];

  for (const { name, satrec } of cachedTransmitters) {
    const positionAndVelocity = satellite.propagate(satrec, now);
    
    // Check if the satellite's position could be calculated
    if (positionAndVelocity?.position && typeof positionAndVelocity.position !== 'boolean') {
      const positionEci = positionAndVelocity.position;
      const positionEcf = satellite.eciToEcf(positionEci, gmst);
      const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
      
      const elevationDeg = satellite.radiansToDegrees(lookAngles.elevation);
      
      // If the satellite is > 10 degrees above the horizon, the Certus terminal can see it
      if (elevationDeg > MIN_ELEVATION_DEGREES) {
        visible.push({
          name,
          elevation: elevationDeg,
          azimuth: satellite.radiansToDegrees(lookAngles.azimuth),
          range: lookAngles.rangeSat // km
        });
      }
    }
  }
  
  // Sort by highest elevation first (best signal)
  visible.sort((a, b) => b.elevation - a.elevation);
  return visible;
}
