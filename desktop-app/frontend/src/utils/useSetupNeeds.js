import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";

// What still needs filling in: the business details printed on invoices (only an admin can fix those) and the
// signed-in person's own phone number and photo. Drives the badge on Settings and the bar under the header.
export function useSetupNeeds(user) {
  const { data } = useQuery({
    queryKey: ["business"],
    queryFn: async () => (await apiClient.get("/business/")).data,
    enabled: Boolean(user),
  });
  const business = data?.missing || [];
  const own = user ? [!user.phone && "your phone number", !user.avatar_url && "a profile photo"].filter(Boolean) : [];
  const count = (user?.is_admin ? business.length : 0) + own.length; // what this person can act on
  return { business, own, count };
}
