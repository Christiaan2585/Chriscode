import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";
import { backupStatus } from "./backupAge";

// What still needs attention: the business details printed on invoices (only an admin can fix those), the signed-in
// person's own phone number and photo, and - for an admin - a backup that has not happened for days. Drives the badge on
// Settings (sidebar) and the "N to add / N missing" notes inside it.
export function useSetupNeeds(user) {
  const { data } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await apiClient.get("/business/")).data,
    enabled: Boolean(user),
  });
  const { data: backups } = useQuery({
    queryKey: ["backups"], // the same list the Data & Backups page uses
    queryFn: async () => (await apiClient.get("/backups/")).data,
    enabled: Boolean(user?.is_admin),
    retry: false,
    staleTime: 60000,
  });
  const business = data?.missing || [];
  const own = user ? [!user.phone && "your phone number", !user.avatar_url && "a profile photo"].filter(Boolean) : [];
  const backup = user?.is_admin && backups ? backupStatus(backups.backups) : null;
  const backupStale = backup?.state === "stale";
  const count = (user?.is_admin ? business.length : 0) + own.length + (backupStale ? 1 : 0); // what this person can act on
  return { business, own, backup, backupStale, count };
}
