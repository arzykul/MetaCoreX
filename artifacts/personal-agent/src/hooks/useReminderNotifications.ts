import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListRemindersQueryKey } from "@workspace/api-client-react";

const POLL_INTERVAL_MS = 30_000; // every 30 seconds

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function showNotification(title: string) {
  if (Notification.permission !== "granted") return;
  const n = new Notification("⏰ Напоминание — PersonalAI", {
    body: title,
    icon: "/personal-agent/favicon.ico",
    badge: "/personal-agent/favicon.ico",
    requireInteraction: true,
  });
  n.onclick = () => { window.focus(); n.close(); };
}

export function useReminderNotifications() {
  const queryClient = useQueryClient();
  const permissionAsked = useRef(false);

  useEffect(() => {
    // Ask for permission once on mount (after short delay so user is engaged)
    const askTimer = setTimeout(async () => {
      if (!permissionAsked.current) {
        permissionAsked.current = true;
        await requestNotificationPermission();
      }
    }, 3000);

    return () => clearTimeout(askTimer);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${base}/api/openrouter/reminders/due`);
        if (!res.ok) return;
        const due = await res.json() as { id: number; title: string }[];
        if (due.length === 0) return;

        // Show browser notification for each due reminder
        for (const reminder of due) {
          showNotification(reminder.title);
        }

        // Refresh reminders list in UI
        queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
      } catch {
        // silently ignore network errors
      }
    };

    // Check immediately, then on interval
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [queryClient]);
}
