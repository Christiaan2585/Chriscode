import React from "react";
import { describeSend } from "../utils/sends";

// "Sent by email · 16 Oct" under a document's number in a list (hover for who, to what address and the full date).
const SentNote = ({ entry, kind }) => {
  const d = describeSend(entry, kind);
  return d ? <span className="block text-xs font-normal text-slate-400" title={d.long}>{d.short}</span> : null;
};

export default SentNote;
