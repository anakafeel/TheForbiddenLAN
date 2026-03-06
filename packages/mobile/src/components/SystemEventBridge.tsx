import React, { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import type { SignalStatus } from '@forbiddenlan/comms';
import { useStore } from '../store';
import { comms } from '../utils/comms';

function hasSignalTelemetry(status: SignalStatus) {
  return (
    status.activeLink !== 'none' ||
    status.certusDataBars > 0 ||
    status.cellularSignal > 0 ||
    status.certusDataUsedKB > 0
  );
}

export default function SystemEventBridge() {
  const jwt = useStore((s) => s.jwt);
  const role = useStore((s) => s.user?.role);
  const preferredConnection = useStore((s) => s.preferredConnection);
  const signalStatus = useStore((s) => s.signalStatus);
  const setSignalStatus = useStore((s) => s.setSignalStatus);
  const pushNotification = useStore((s) => s.pushNotification);

  const netConnectedRef = useRef<boolean | null>(null);
  const prevSignalRef = useRef<SignalStatus | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      const previous = netConnectedRef.current;

      if (previous === null) {
        netConnectedRef.current = connected;
        return;
      }

      if (previous && !connected) {
        pushNotification({
          title: 'Network Disconnected',
          message: 'Device lost internet connectivity.',
          severity: 'warning',
          source: 'network',
          dedupeKey: 'network-offline',
        });
      }

      if (!previous && connected) {
        pushNotification({
          title: 'Network Restored',
          message: 'Internet connectivity restored.',
          severity: 'info',
          source: 'network',
          dedupeKey: 'network-online',
        });
      }

      netConnectedRef.current = connected;
    });

    return unsubscribe;
  }, [pushNotification]);

  useEffect(() => {
    if (!jwt || role === 'admin') return undefined;

    let cleanupPolling: (() => void) | null = null;

    try {
      cleanupPolling = comms.startSignalPolling(10_000, (status) => {
        setSignalStatus(status);
      });
    } catch (err) {
      console.warn('[SystemEventBridge] signal polling unavailable:', err);
    }

    return () => {
      if (typeof cleanupPolling === 'function') {
        cleanupPolling();
      }
    };
  }, [jwt, role, setSignalStatus]);

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
        if (previous.activeLink !== 'none' && current.activeLink === 'none') {
          pushNotification({
            title: 'Connection Lost',
            message: `${previous.activeLink.toUpperCase()} link dropped.`,
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-link-lost',
          });
        } else if (previous.activeLink === 'none' && current.activeLink !== 'none') {
          pushNotification({
            title: 'Connection Restored',
            message: `${current.activeLink.toUpperCase()} link is back online.`,
            severity: 'info',
            source: 'signal',
            dedupeKey: 'signal-link-restored',
          });
        } else if (previous.activeLink === 'satellite' && current.activeLink === 'cellular') {
          pushNotification({
            title: 'Fallback Engaged',
            message: 'Traffic switched from SATCOM to cellular.',
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-fallback-cellular',
          });
        } else if (previous.activeLink === 'cellular' && current.activeLink === 'satellite') {
          pushNotification({
            title: 'SATCOM Active',
            message: 'Traffic switched from cellular to SATCOM.',
            severity: 'info',
            source: 'signal',
            dedupeKey: 'signal-satcom-active',
          });
        }
      }

      if (current.activeLink === 'satellite') {
        if (previous.certusDataBars >= 2 && current.certusDataBars === 0) {
          pushNotification({
            title: 'Satellite Signal Lost',
            message: 'Certus data bars dropped to 0.',
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-sat-lost',
          });
        } else if (previous.certusDataBars >= 4 && current.certusDataBars <= 2) {
          pushNotification({
            title: 'Satellite Signal Degraded',
            message: `Certus dropped to ${current.certusDataBars}/5 bars.`,
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-sat-degraded',
          });
        }
      }

      if (current.activeLink === 'cellular') {
        if (previous.cellularSignal >= 30 && current.cellularSignal < 15) {
          pushNotification({
            title: 'Cellular Signal Weak',
            message: `Cellular signal dropped to ${current.cellularSignal}%.`,
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-cell-weak',
          });
        } else if (previous.cellularSignal < 15 && current.cellularSignal >= 30) {
          pushNotification({
            title: 'Cellular Signal Recovered',
            message: `Cellular signal recovered to ${current.cellularSignal}%.`,
            severity: 'info',
            source: 'signal',
            dedupeKey: 'signal-cell-recovered',
          });
        }
      }

      if (preferredConnection === 'satellite' && current.activeLink === 'cellular') {
        pushNotification({
          title: 'Preferred Link Unavailable',
          message: 'Preferred SATCOM link unavailable, using cellular.',
          severity: 'warning',
          source: 'signal',
          dedupeKey: 'signal-preferred-satellite-unavailable',
        });
      }
    }

    prevSignalRef.current = current;
  }, [signalStatus, preferredConnection, pushNotification]);

  return null;
}
