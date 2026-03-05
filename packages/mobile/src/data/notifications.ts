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
    title: "Tactical Breach Detected",
    message: "Sector 7G - Immediate attention",
    minutesAgo: 2,
    severity: "warning",
    unread: true,
  },
  {
    id: "n2",
    title: "Comm Relay Handover",
    message: "Switched to Node A-42",
    minutesAgo: 15,
    severity: "info",
    unread: true,
  },
  {
    id: "n3",
    title: "Recon Update",
    message: "Drone feed is stable",
    minutesAgo: 24,
    severity: "info",
    unread: false,
  },
];

export const getUnreadCount = () => MOCK_NOTIFICATIONS.filter((n) => n.unread).length;
