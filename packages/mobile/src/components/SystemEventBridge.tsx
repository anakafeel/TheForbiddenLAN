import React, { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import type { SignalStatus } from "@forbiddenlan/comms";
import { useStore } from "../store";
import { comms } from "../utils/comms";
import { CONFIG } from "../config";

function hasSignalTelemetry(status: SignalStatus) {
  return (
    status.activeLink !== "none" ||
    status.certusDataBars > 0 ||
    status.cellularSignal > 0 ||
    status.certusDataUsedKB > 0
  );
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function certusBarsFromDbm(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0;
  if (dbm >= -70) return 5;
  if (dbm >= -78) return 4;
  if (dbm >= -85) return 3;
  if (dbm >= -92) return 2;
  if (dbm > -100) return 1;
  return 0;
}

function usageToKB(usage: unknown, unit: unknown): number {
  const value = toNumber(usage);
  const normalizedUnit = String(unit || "").toUpperCase();
  if (!value) return 0;

  if (normalizedUnit === "GB") return value * 1024 * 1024;
  if (normalizedUnit === "MB") return value * 1024;
  if (normalizedUnit === "B") return value / 1024;
  return value;
}

function inferActiveLink(
  routingPreference: unknown,
  certusBars: number,
  cellularSignal: number,
): SignalStatus["activeLink"] {
  const normalized = String(routingPreference || "").toLowerCase();
  if (normalized === "satellite") return "satellite";
  if (normalized === "cellular") return "cellular";

  if (cellularSignal > 40) return "cellular";
  if (certusBars > 0) return "satellite";
  return "none";
}

async function fetchJson(url: string, jwt: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Signal endpoint failed (${response.status})`);
  }
  return response.json().catch(() => ({}));
}

async function fetchSignalFromApi(jwt: string): Promise<SignalStatus> {
  const status = await fetchJson(`${CONFIG.API_URL}/device/status`, jwt);

  const [usageResult, routingResult] = await Promise.allSettled([
    fetchJson(`${CONFIG.API_URL}/device/data-usage?period=24h`, jwt),
    fetchJson(`${CONFIG.API_URL}/network/routing`, jwt),
  ]);

  const usage = usageResult.status === "fulfilled" ? usageResult.value : {};
  const routing =
    routingResult.status === "fulfilled" ? routingResult.value : {};

  const certusBarsRaw = toNumber(status?.certusDataBars);
  const certusBars =
    certusBarsRaw > 0
      ? certusBarsRaw
      : certusBarsFromDbm(toNumber(status?.certusSignalStrength));

  const cellularSignal = Math.max(
    0,
    Math.min(
      100,
      toNumber(status?.cellularSignal ?? status?.cellularSignalStrength),
    ),
  );

  const certusUsageKb =
    usageToKB(usage?.certus?.txusage, usage?.certus?.txunit) +
    usageToKB(usage?.certus?.rxusage, usage?.certus?.rxunit);

  return {
    certusDataBars: Math.max(0, Math.min(5, Math.round(certusBars))),
    cellularSignal: Math.round(cellularSignal),
    activeLink: inferActiveLink(
      routing?.preference ?? routing?.prefer,
      certusBars,
      cellularSignal,
    ),
    certusDataUsedKB: Math.max(0, Math.round(certusUsageKb)),
  };
}

interface SystemEventBridgeProps {
  profileHydrated?: boolean;
}

export default function SystemEventBridge({
  profileHydrated = true,
}: SystemEventBridgeProps) {
  const jwt = useStore((s) => s.jwt);
  const role = useStore((s) => s.user?.role);
  const profile = useStore((s) => s.profile);
  const preferredConnection = useStore((s) => s.preferredConnection);
  const signalStatus = useStore((s) => s.signalStatus);
  const setSignalStatus = useStore((s) => s.setSignalStatus);
  const pushNotification = useStore((s) => s.pushNotification);

  const netConnectedRef = useRef<boolean | null>(null);
  const prevSignalRef = useRef<SignalStatus | null>(null);
  const skipFirstProfileSyncRef = useRef(true);

  useEffect(() => {
    skipFirstProfileSyncRef.current = true;
  }, [jwt]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(
        state.isConnected && state.isInternetReachable !== false,
      );
      const previous = netConnectedRef.current;

      if (previous === null) {
        netConnectedRef.current = connected;
        return;
      }

      if (previous && !connected) {
        pushNotification({
          title: "Network Disconnected",
          message: "Device lost internet connectivity.",
          severity: "warning",
          source: "network",
          dedupeKey: "network-offline",
        });
      }

      if (!previous && connected) {
        pushNotification({
          title: "Network Restored",
          message: "Internet connectivity restored.",
          severity: "info",
          source: "network",
          dedupeKey: "network-online",
        });
      }

      netConnectedRef.current = connected;
    });

    return unsubscribe;
  }, [pushNotification]);

  useEffect(() => {
    if (!jwt) return undefined;

    let disposed = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pollSignal = async () => {
      let nextStatus: SignalStatus | null = null;

      try {
        nextStatus = await fetchSignalFromApi(jwt);
      } catch {
        // Non-admin users can also fall back to the comms SDK
        if (role !== "admin") {
          try {
            nextStatus = await comms.getSignalStatus();
          } catch {
            nextStatus = null;
          }
        }
      }

      if (!disposed && nextStatus) {
        setSignalStatus(nextStatus);
      }
    };

    pollSignal();
    timer = setInterval(pollSignal, 10_000);

    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
    };
  }, [jwt, role, setSignalStatus]);

  useEffect(() => {
    if (!jwt || role === "admin") return;
    comms.setTransportMode(
      preferredConnection === "satellite" ? "satcom" : "cellular",
    );
  }, [jwt, role, preferredConnection]);

  useEffect(() => {
    if (!jwt || role === "admin" || !profileHydrated) return;

    if (skipFirstProfileSyncRef.current) {
      skipFirstProfileSyncRef.current = false;
      return;
    }

    const syncProfile = async () => {
      try {
        await fetch(`${CONFIG.API_URL}/users/me/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            display_name: profile.displayName,
            callsign: profile.callsign,
            photo_url: profile.photoUrl,
            status_message: profile.statusMessage,
          }),
        });
      } catch {
        // Best effort sync; local profile remains source of truth on device.
      }
    };

    syncProfile();
  }, [
    jwt,
    role,
    profileHydrated,
    profile.displayName,
    profile.callsign,
    profile.photoUrl,
    profile.statusMessage,
  ]);

  useEffect(() => {
    const previous = prevSignalRef.current;
    const current = signalStatus;

    if (!previous) {
      prevSignalRef.current = current;
      return;
    }

    const prevHasTelemetry = hasSignalTelemetry(previous);
    const curHasTelemetry = hasSignalTelemetry(current);

    if (prevHasTelemetry || curHasTelemetry) {
      if (previous.activeLink !== current.activeLink) {
        if (previous.activeLink !== "none" && current.activeLink === "none") {
          pushNotification({
            title: "Connection Lost",
            message: `${previous.activeLink.toUpperCase()} link dropped.`,
            severity: "warning",
            source: "signal",
            dedupeKey: "signal-link-lost",
          });
        } else if (
          previous.activeLink === "none" &&
          current.activeLink !== "none"
        ) {
          pushNotification({
            title: "Connection Restored",
            message: `${current.activeLink.toUpperCase()} link is back online.`,
            severity: "info",
            source: "signal",
            dedupeKey: "signal-link-restored",
          });
        } else if (
          previous.activeLink === "satellite" &&
          current.activeLink === "cellular"
        ) {
          pushNotification({
            title: "Fallback Engaged",
            message: "Traffic switched from SATCOM to cellular.",
            severity: "warning",
            source: "signal",
            dedupeKey: "signal-fallback-cellular",
          });
        } else if (
          previous.activeLink === "cellular" &&
          current.activeLink === "satellite"
        ) {
          pushNotification({
            title: "SATCOM Active",
            message: "Traffic switched from cellular to SATCOM.",
            severity: "info",
            source: "signal",
            dedupeKey: "signal-satcom-active",
          });
        }
      }

      if (current.activeLink === "satellite") {
        if (previous.certusDataBars >= 2 && current.certusDataBars === 0) {
          pushNotification({
            title: "Satellite Signal Lost",
            message: "Certus data bars dropped to 0.",
            severity: "warning",
            source: "signal",
            dedupeKey: "signal-sat-lost",
          });
        } else if (
          previous.certusDataBars >= 4 &&
          current.certusDataBars <= 2
        ) {
          pushNotification({
            title: "Satellite Signal Degraded",
            message: `Certus dropped to ${current.certusDataBars}/5 bars.`,
            severity: "warning",
            source: "signal",
            dedupeKey: "signal-sat-degraded",
          });
        }
      }

      if (current.activeLink === "cellular") {
        if (previous.cellularSignal >= 30 && current.cellularSignal < 15) {
          pushNotification({
            title: "Cellular Signal Weak",
            message: `Cellular signal dropped to ${current.cellularSignal}%.`,
            severity: "warning",
            source: "signal",
            dedupeKey: "signal-cell-weak",
          });
        } else if (
          previous.cellularSignal < 15 &&
          current.cellularSignal >= 30
        ) {
          pushNotification({
            title: "Cellular Signal Recovered",
            message: `Cellular signal recovered to ${current.cellularSignal}%.`,
            severity: "info",
            source: "signal",
            dedupeKey: "signal-cell-recovered",
          });
        }
      }

      if (
        preferredConnection === "satellite" &&
        current.activeLink === "cellular"
      ) {
        pushNotification({
          title: "Preferred Link Unavailable",
          message: "Preferred SATCOM link unavailable, using cellular.",
          severity: "warning",
          source: "signal",
          dedupeKey: "signal-preferred-satellite-unavailable",
        });
      }
    }

    prevSignalRef.current = current;
  }, [signalStatus, preferredConnection, pushNotification]);

  return null;
}
