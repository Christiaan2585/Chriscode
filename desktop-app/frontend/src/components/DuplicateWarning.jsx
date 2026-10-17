import { t } from "../utils/i18n";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import apiClient from "../api/client";
import { farmLabel } from "../utils/format";

const digits = (v) => (v || "").replace(/\D/g, "");

// Only ask when there is something worth matching: a name of 3+ letters, a phone of 7+ digits, an email, or a farm name.
export const worthChecking = ({ name, phone, email, farm_name }) =>
  (name || "").trim().length >= 3 || digits(phone).length >= 7 || /.+@.+/.test((email || "").trim()) || (farm_name || "").trim().length >= 3;

// "This looks like someone you already have": shown while a client is being added (or edited) when the phone, email, farm
// name or name matches a client already on file. Only a warning - saving is never blocked.
const DuplicateWarning = ({ fields, excludeId }) => {
  const [settled, setSettled] = useState(fields);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(fields), 450); // wait until the typing pauses
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.name, fields.phone, fields.email, fields.farm_name]);
  const { data } = useQuery({
    queryKey: ["clients", "duplicates", settled.name, settled.phone, settled.email, settled.farm_name, excludeId],
    queryFn: async () => (await apiClient.get("/clients/duplicates", { params: { ...settled, exclude_id: excludeId }, silent: true })).data,
    enabled: worthChecking(settled),
    staleTime: 10000,
    retry: false,
  });
  if (!data?.length) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-medium"><Copy size={15} /> {t("This looks like a client you already have")}</p>
      <ul className="mt-1 space-y-0.5">
        {data.slice(0, 4).map((m) => (
          <li key={m.id}>
            <Link to={`/clients/${m.id}`} className="font-medium underline">{farmLabel(m)}</Link>
            <span className="text-amber-800"> - {m.why.join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DuplicateWarning;
