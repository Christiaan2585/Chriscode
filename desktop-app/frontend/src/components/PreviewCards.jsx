import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Phone } from "lucide-react";
import apiClient from "../api/client";
import HoverCard from "./HoverCard";
import { fetchDocumentItems } from "../utils/documents";
import { farmLabel, money, shortDate, statusStyle } from "../utils/format";

const MAX_LINES = 6;

const Stat = ({ label, value, note }) => (
  <div className="rounded-lg bg-slate-50 px-3 py-2">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="font-semibold text-slate-800">{value}</div>
    {note && <div className="text-xs text-slate-500">{note}</div>}
  </div>
);

const ClientCardContent = ({ client }) => {
  const { data: summary, isError } = useQuery({
    queryKey: ["clients", client.id, "summary"],
    queryFn: async () => (await apiClient.get(`/clients/${client.id}/summary`)).data,
  });

  const contact = [
    [Phone, client.phone],
    [Mail, client.email],
    [MapPin, client.address],
  ].filter(([, value]) => value);

  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-slate-800">{farmLabel(client)}</div>
        {client.farm_name && <div className="text-xs text-slate-500">{client.name}</div>}
      </div>
      {contact.length > 0 && (
        <ul className="space-y-1 text-slate-600">
          {contact.map(([Icon, value]) => (
            <li key={value} className="flex items-start gap-2">
              <Icon size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="break-words">{value}</span>
            </li>
          ))}
        </ul>
      )}
      {isError ? (
        <p className="text-xs text-red-600">Couldn't load this client's summary.</p>
      ) : !summary ? (
        <p className="text-xs text-slate-400">Loading summary…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Animals on the farm" value={summary.farm_animal_total || summary.animal_count} />
          <Stat
            label="Owed"
            value={money(summary.outstanding)}
            note={`${summary.unpaid_invoice_count} unpaid invoice${summary.unpaid_invoice_count === 1 ? "" : "s"}`}
          />
          <Stat label="Last invoice" value={shortDate(summary.last_invoice_date)} />
          <Stat label="Open quotes" value={summary.open_quote_count} />
        </div>
      )}
    </div>
  );
};

const LABEL = { invoice: "Invoice", quote: "Quote" };

const DocumentCardContent = ({ kind, doc, clientName }) => {
  const { data: items, isError } = useQuery({
    queryKey: [`${kind}s`, doc.id, "items"],
    queryFn: () => fetchDocumentItems(kind, doc.id),
  });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await apiClient.get("/products/")).data,
  });
  const lineName = (item) =>
    products?.find((p) => p.id === item.product_id)?.name || item.description || `Product #${item.product_id}`;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-800">{LABEL[kind]} {doc.number || `#${doc.id}`}</div>
          <div className="text-xs text-slate-500">
            {shortDate(doc.date)}
            {clientName ? ` • ${clientName}` : ""}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusStyle(doc.status)}`}>{doc.status}</span>
      </div>
      {isError ? (
        <p className="text-xs text-red-600">Couldn't load the line items.</p>
      ) : !items ? (
        <p className="text-xs text-slate-400">Loading items…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400">No line items.</p>
      ) : (
        <ul className="space-y-1 text-slate-600">
          {items.slice(0, MAX_LINES).map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {item.quantity} × {lineName(item)}
              </span>
              <span className="shrink-0 tabular-nums">{money(item.subtotal)}</span>
            </li>
          ))}
          {items.length > MAX_LINES && (
            <li className="text-xs text-slate-400">+ {items.length - MAX_LINES} more</li>
          )}
        </ul>
      )}
      <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-800">
        <span>Total</span>
        <span className="tabular-nums">{money(doc.total_amount)}</span>
      </div>
    </div>
  );
};

export const ClientHover = ({ client, children, className }) =>
  client ? (
    <HoverCard className={className} renderContent={() => <ClientCardContent client={client} />}>
      {children}
    </HoverCard>
  ) : (
    children
  );

export const DocumentHover = ({ kind, doc, clientName, children, className }) => (
  <HoverCard
    className={className}
    renderContent={() => <DocumentCardContent kind={kind} doc={doc} clientName={clientName} />}
  >
    {children}
  </HoverCard>
);
