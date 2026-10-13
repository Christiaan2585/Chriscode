import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";
import { isNative } from "../utils/pairing";
import { lastReminderDay, markReminded, reminderFor, remindersOn } from "../utils/reminders";

const localDay = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the PC's own time zone

// Desktop only, mounted once someone is signed in: a Windows notification, at most once a day, saying what is
// overdue or due this week. Uses the dashboard's own list (same query key, so no extra request). Renders nothing.
const Reminders = () => {
  const enabled = Boolean(window.electronAPI) && !isNative();
  const { data } = useQuery({
    queryKey: ["analytics", "dashboard"],
    queryFn: async () => (await apiClient.get("/analytics/dashboard")).data,
    enabled,
    refetchInterval: 60 * 60_000, // also catches a PC that is left on over midnight
  });

  useEffect(() => {
    if (!enabled || !data || !remindersOn() || typeof Notification === "undefined") return;
    const today = localDay();
    const reminder = reminderFor(data.attention, today, lastReminderDay());
    if (!reminder) return;
    markReminded(today); // before asking, so a refused permission doesn't ask again all day
    Notification.requestPermission().then((permission) => {
      if (permission !== "granted") return;
      const note = new Notification(reminder.title, { body: reminder.body, silent: false });
      note.onclick = () => { window.focus(); window.location.hash = "#/"; };
    });
  }, [data, enabled]);

  return null;
};

export default Reminders;
