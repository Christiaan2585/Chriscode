import { t } from "../utils/i18n";
import React from "react";
import { MessageCircle, Phone } from "lucide-react";
import { toTelLink, toWhatsAppLink } from "../utils/contact";

// Two small buttons beside a client's name in a list: call, or open a WhatsApp chat. Nothing when there is no number.
const ContactLinks = ({ client }) => {
  const tel = toTelLink(client?.phone);
  const wa = toWhatsAppLink(client?.phone);
  if (!tel && !wa) return null;
  const cls = "inline-flex rounded-md p-1.5 text-slate-400 transition-colors hover:text-emerald-600";
  return (
    <span className="ml-1 inline-flex items-center align-middle">
      {tel && <a href={tel} className={cls} title={t("Call {name}", { name: client.name })} aria-label={t("Call {name}", { name: client.name })}><Phone size={15} /></a>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={cls} title={`WhatsApp ${client.name}`} aria-label={`WhatsApp ${client.name}`}><MessageCircle size={15} /></a>}
    </span>
  );
};

export default ContactLinks;
