export type MonitoringLevel = 'info' | 'warn' | 'error';
export type MonitoringCategory = 'system' | 'socket' | 'talkgroup' | 'floor' | 'udp' | 'auth';

export interface MonitoringEvent {
  id: string;
  timestamp: string;
  level: MonitoringLevel;
  category: MonitoringCategory;
  message: string;
  metadata?: Record<string, unknown>;
}

const MAX_EVENT_BUFFER = 500;
const startedAtMs = Date.now();
const events: MonitoringEvent[] = [];

function normalizeLimit(limit?: number, fallback = 100): number {
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(MAX_EVENT_BUFFER, Math.floor(Number(limit))));
}

export function recordMonitoringEvent(input: {
  level?: MonitoringLevel;
  category: MonitoringCategory;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const entry: MonitoringEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level: input.level ?? 'info',
    category: input.category,
    message: input.message,
    metadata: input.metadata,
  };

  events.push(entry);
  if (events.length > MAX_EVENT_BUFFER) {
    events.splice(0, events.length - MAX_EVENT_BUFFER);
  }

  return entry;
}

export function listMonitoringEvents(limit?: number): MonitoringEvent[] {
  const capped = normalizeLimit(limit, 100);
  const slice = events.slice(Math.max(0, events.length - capped));
  return [...slice].reverse();
}

export function getMonitoringUptimeSeconds(): number {
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

export function getMonitoringStartedAtISO(): string {
  return new Date(startedAtMs).toISOString();
}

// Seed the buffer with a startup marker so admins can verify event ingestion quickly.
recordMonitoringEvent({
  level: 'info',
  category: 'system',
  message: 'Monitoring service initialized',
});
