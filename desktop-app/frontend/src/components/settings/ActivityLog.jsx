import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Smartphone } from "lucide-react";
import apiClient from "../../api/client";
import { authService } from "../../api/authService";
import { useAuth } from "../../context/AuthContext";
import SettingsCard from "./SettingsCard";

const PAGE = 50;
const when = (iso) => new Date(`${iso}Z`).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const RESULT = {
  refused: ["Refused", "bg-amber-100 text-amber-800"],
  failed: ["Failed", "bg-red-100 text-red-700"],
};

// Settings -> Activity log (admins): who changed what, and when. Only the what, never the data itself.
const ActivityLog = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [person, setPerson] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users } = useQuery({ queryKey: ["auth-users"], queryFn: authService.listUsers, enabled: !!user?.is_admin, retry: false });
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["audit", q, person, page],
    queryFn: async () =>
      (await apiClient.get("/audit", { params: { limit: PAGE, offset: page * PAGE, q: q || undefined, user_id: person || undefined } })).data,
    enabled: !!user?.is_admin,
    placeholderData: (previous) => previous,
  });

  if (!user?.is_admin) {
    return <SettingsCard icon={History} title="Activity log"><p className="text-sm text-slate-500">Only an admin can see the activity log.</p></SettingsCard>;
  }
  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE));

  return (
    <SettingsCard icon={History} title="Activity log">
      <p className="text-sm text-slate-500">
        Every change anyone makes, and who made it - plus sign-ins, failed tries and downloads of tax certificates. It records what was done,
        never the details (no passwords or amounts). Entries are kept for a year.
      </p>
      <div className="flex flex-wrap gap-2">
        <input className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Search (e.g. delete, invoice, a name)" aria-label="Search the activity log"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Person" value={person} onChange={(e) => { setPerson(e.target.value); setPage(0); }}>
          <option value="">Everyone</option>
          {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {isLoading ? <p className="text-sm text-slate-400">Loading...</p> : isError ? <p className="text-sm text-red-600">Could not load the log.</p>
        : data.items.length === 0 ? <p className="text-sm text-slate-400">Nothing logged{q || person ? " for that search" : " yet"}.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr><th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">Who</th><th className="py-2 pr-3 font-medium">What</th><th className="py-2 font-medium" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{when(row.at)}</td>
                    <td className="py-2 pr-3 text-slate-700">{row.user_name || <span className="text-slate-400">nobody signed in</span>}</td>
                    <td className="py-2 pr-3 text-slate-800">
                      {row.action}{row.entity_id ? <span className="text-slate-400"> #{row.entity_id}</span> : null}
                      {row.summary && row.user_id == null && <span className="block text-xs text-slate-400">{row.summary}</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {row.via === "phone" && <Smartphone size={14} className="mr-1 inline text-slate-400" aria-label="From a phone" />}
                      {RESULT[row.result] && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT[row.result][1]}`}>{RESULT[row.result][0]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{data ? `${data.total} ${data.total === 1 ? "entry" : "entries"}` : ""}</span>
        <span className="flex items-center gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">Newer</button>
          Page {page + 1} of {pages}
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-40">Older</button>
        </span>
      </div>
    </SettingsCard>
  );
};

export default ActivityLog;
