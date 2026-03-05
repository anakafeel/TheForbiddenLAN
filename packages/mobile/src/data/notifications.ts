export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  minutesAgo: number;
  severity: "warning" | "info";
  unread: boolean;
};

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    title: "Signal Down",
    message: "Satellite link dropped for 12s",
    minutesAgo: 2,
    severity: "warning",
    unread: true,
  },
  {
    id: "n2",
    title: "Saim hopped off chat",
    message: "Last active in Tactical-Main",
    minutesAgo: 4,
    severity: "info",
    unread: true,
  },
  {
    id: "n3",
    title: "Maisam hopped on Channel 1",
    message: "Presence updated in real-time",
    minutesAgo: 6,
    severity: "info",
    unread: true,
  },
  {
    id: "n4",
    title: "Cellular fallback engaged",
    message: "Routing switched to cellular path",
    minutesAgo: 9,
    severity: "warning",
    unread: true,
  },
  {
    id: "n5",
    title: "Aisha joined Recon-Units",
    message: "User presence changed",
    minutesAgo: 12,
    severity: "info",
    unread: false,
  },
  {
    id: "n6",
    title: "Signal restored",
    message: "Satellite link back to stable",
    minutesAgo: 14,
    severity: "info",
    unread: true,
  },
  {
    id: "n7",
    title: "Rafi left Channel 2",
    message: "Membership count updated",
    minutesAgo: 19,
    severity: "info",
    unread: false,
  },
  {
    id: "n8",
    title: "PTT queue delay warning",
    message: "Latency spike detected",
    minutesAgo: 22,
    severity: "warning",
    unread: false,
  },
];

export const getUnreadCount = () => MOCK_NOTIFICATIONS.filter((n) => n.unread).length;
