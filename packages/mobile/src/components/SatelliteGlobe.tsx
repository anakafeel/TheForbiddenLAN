import { useEffect, useRef } from 'react';
import createGlobe, { type COBEOptions, type Marker } from 'cobe';
import { useMotionValue, useSpring } from 'motion/react';

const MOVEMENT_DAMPING = 1400;
const FOCUS_LERP = 0.08;
const MARKER_LERP = 0.22;
const DEFAULT_SCALE = 1;
const DEFAULT_THETA = 0.34;
type GlobeTheme = Pick<
  COBEOptions,
  'dark' | 'diffuse' | 'mapBrightness' | 'mapBaseBrightness' | 'baseColor' | 'glowColor'
>;

interface RuntimeMarker {
  id: string;
  lat: number;
  lng: number;
  size: number;
  color: [number, number, number];
}

export interface SatelliteGlobeMarker {
  id?: string;
  lat: number;
  lng: number;
  size?: number;
  color?: [number, number, number];
}

export interface SatelliteGlobeFocusPoint {
  lat: number;
  lng: number;
  zoom?: number;
  token?: number;
}

interface SatelliteGlobeProps {
  markers: SatelliteGlobeMarker[];
  className?: string;
  autoRotateSpeed?: number;
  autoRotateEnabled?: boolean;
  dark?: boolean;
  focusPoint?: SatelliteGlobeFocusPoint | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFocusPhi(lng: number): number {
  return -((lng * Math.PI) / 180);
}

function toFocusTheta(lat: number): number {
  const mapped = 0.34 - (lat * Math.PI) / 180 * 0.45;
  return clamp(mapped, -0.75, 0.95);
}

function normalizeMarker(marker: SatelliteGlobeMarker, index: number): RuntimeMarker {
  return {
    id: marker.id ?? `marker-${index}`,
    lat: marker.lat,
    lng: marker.lng,
    size: marker.size ?? 0.03,
    color: marker.color ?? [0.2, 0.95, 1],
  };
}

function lerpLongitude(from: number, to: number, alpha: number): number {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return from + delta * alpha;
}

function toCobeMarker(marker: RuntimeMarker): Marker {
  return {
    location: [marker.lat, marker.lng],
    size: marker.size,
    color: marker.color,
  };
}

function themeFor(dark: boolean): GlobeTheme {
  return {
    dark: dark ? 1 : 0,
    diffuse: dark ? 0.52 : 0.58,
    mapBrightness: dark ? 1.44 : 1.2,
    mapBaseBrightness: dark ? 0.3 : 0.42,
    baseColor: dark ? [0.12, 0.14, 0.17] : [0.33, 0.38, 0.44],
    glowColor: dark ? [0.09, 0.62, 0.86] : [0.2, 0.6, 0.9],
  };
}

function applyTheme(state: Partial<COBEOptions>, dark: boolean): void {
  const nextTheme = themeFor(dark);
  state.dark = nextTheme.dark;
  state.diffuse = nextTheme.diffuse;
  state.mapBrightness = nextTheme.mapBrightness;
  state.mapBaseBrightness = nextTheme.mapBaseBrightness;
  state.baseColor = nextTheme.baseColor;
  state.glowColor = nextTheme.glowColor;
}

export function SatelliteGlobe({
  markers,
  className,
  autoRotateSpeed = 0.0035,
  autoRotateEnabled = true,
  dark = true,
  focusPoint = null,
}: SatelliteGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const thetaRef = useRef(DEFAULT_THETA);
  const widthRef = useRef(0);
  const scaleRef = useRef(DEFAULT_SCALE);
  const pointerInteracting = useRef<number | null>(null);
  const targetPhiRef = useRef(0);
  const targetThetaRef = useRef(DEFAULT_THETA);
  const targetScaleRef = useRef(DEFAULT_SCALE);
  const markersRef = useRef<RuntimeMarker[]>([]);
  const runtimeMarkersRef = useRef<RuntimeMarker[]>([]);
  const darkRef = useRef(dark);
  const focusActiveRef = useRef(false);

  const r = useMotionValue(0);
  const rs = useSpring(r, {
    mass: 1,
    damping: 30,
    stiffness: 100,
  });

  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  useEffect(() => {
    markersRef.current = markers.map(normalizeMarker);
  }, [markers]);

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = value !== null ? 'grabbing' : 'grab';
    }
  };

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current === null) return;
    const delta = clientX - pointerInteracting.current;
    pointerInteracting.current = clientX;
    r.set(r.get() + delta / MOVEMENT_DAMPING);
  };

  useEffect(() => {
    if (!focusPoint) {
      focusActiveRef.current = false;
      targetPhiRef.current = 0;
      targetThetaRef.current = DEFAULT_THETA;
      targetScaleRef.current = DEFAULT_SCALE;
      return;
    }

    focusActiveRef.current = true;
    targetPhiRef.current = toFocusPhi(focusPoint.lng);
    targetThetaRef.current = toFocusTheta(focusPoint.lat);
    targetScaleRef.current = clamp(focusPoint.zoom ?? 1.55, 0.85, 2.2);
  }, [focusPoint?.lat, focusPoint?.lng, focusPoint?.zoom, focusPoint?.token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction = Math.sign(event.deltaY);
      targetScaleRef.current = clamp(targetScaleRef.current - direction * 0.08, 0.85, 2.2);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    markersRef.current = markers.map(normalizeMarker);
    runtimeMarkersRef.current = markersRef.current.map((marker) => ({ ...marker }));

    const onResize = () => {
      if (!canvasRef.current) return;
      widthRef.current =
        canvasRef.current.offsetWidth ||
        canvasRef.current.parentElement?.clientWidth ||
        420;
    };

    window.addEventListener('resize', onResize);
    onResize();

    const initialTheme = themeFor(darkRef.current);
    const globe = createGlobe(canvasRef.current!, {
      width: widthRef.current * 2,
      height: widthRef.current * 2,
      devicePixelRatio: 2,
      phi: 0,
      theta: DEFAULT_THETA,
      mapSamples: 22000,
      markerColor: [0.2, 0.95, 1],
      markers: markersRef.current.map(toCobeMarker),
      ...initialTheme,
      onRender: (state) => {
        applyTheme(state, darkRef.current);
        if (pointerInteracting.current === null && autoRotateEnabled) {
          phiRef.current += autoRotateSpeed;
        }

        if (focusActiveRef.current) {
          phiRef.current += (targetPhiRef.current - phiRef.current) * FOCUS_LERP;
        }
        thetaRef.current += (targetThetaRef.current - thetaRef.current) * FOCUS_LERP;
        scaleRef.current += (targetScaleRef.current - scaleRef.current) * FOCUS_LERP;

        const targetMarkers = markersRef.current;
        let runtimeMarkers = runtimeMarkersRef.current;
        const markersShapeChanged =
          runtimeMarkers.length !== targetMarkers.length ||
          runtimeMarkers.some((marker, index) => marker.id !== targetMarkers[index]?.id);

        if (markersShapeChanged) {
          runtimeMarkers = targetMarkers.map((marker) => ({ ...marker }));
        } else {
          for (let index = 0; index < runtimeMarkers.length; index += 1) {
            const current = runtimeMarkers[index];
            const target = targetMarkers[index];
            current.lat += (target.lat - current.lat) * MARKER_LERP;
            current.lng = lerpLongitude(current.lng, target.lng, MARKER_LERP);
            current.size += (target.size - current.size) * MARKER_LERP;
            current.color = [
              current.color[0] + (target.color[0] - current.color[0]) * MARKER_LERP,
              current.color[1] + (target.color[1] - current.color[1]) * MARKER_LERP,
              current.color[2] + (target.color[2] - current.color[2]) * MARKER_LERP,
            ];
          }
        }

        runtimeMarkersRef.current = runtimeMarkers;
        state.markers = runtimeMarkers.map(toCobeMarker);
        state.phi = phiRef.current + rs.get();
        state.theta = thetaRef.current;
        state.scale = scaleRef.current;
        state.width = widthRef.current * 2;
        state.height = widthRef.current * 2;
      },
    });

    requestAnimationFrame(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '1';
    });

    return () => {
      globe.destroy();
      window.removeEventListener('resize', onResize);
    };
  }, [autoRotateSpeed, autoRotateEnabled, rs]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        margin: '0',
        aspectRatio: '1 / 1',
        width: '100%',
        maxWidth: '760px',
        maxHeight: '100%',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          opacity: 0,
          transition: 'opacity 500ms ease',
          contain: 'layout paint size',
          touchAction: 'none',
        }}
        onPointerDown={(event) => updatePointerInteraction(event.clientX)}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onPointerCancel={() => updatePointerInteraction(null)}
        onMouseMove={(event) => updateMovement(event.clientX)}
        onTouchMove={(event) => {
          if (event.touches[0]) {
            updateMovement(event.touches[0].clientX);
          }
        }}
      />
    </div>
  );
}
