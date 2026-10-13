import React, { useState } from "react";
import { Wifi } from "lucide-react";
import { PairingStorePlugin } from "../utils/pairing";
import { addressKind } from "../utils/addresses";
import { connectionAdvice } from "../utils/connectionAdvice";
import { setDeviceConnection } from "../api/client";
import { getPairing } from "../utils/pairing";

const KIND = { wifi: "Wi-Fi", tailscale: "Tailscale", name: "name", "this phone": "this phone", other: "" };
const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

// Android only (Settings -> Phones): "Why can't I connect?" Tries every address this phone knows for the office PC,
// says plainly what is wrong, and can look for the PC again if its address changed. The phone already does the same
// thing quietly whenever a call fails (PinnedHttp / Discovery); this is for when someone wants to see it.
const PhoneConnection = () => {
  const [busy, setBusy] = useState("");
  const [report, setReport] = useState(null);
  const [note, setNote] = useState("");

  const check = async () => {
    setBusy("check");
    setNote("");
    try {
      setReport(await PairingStorePlugin.diagnose());
    } catch {
      setNote("The check could not run.");
    } finally {
      setBusy("");
    }
  };

  const findAgain = async () => {
    setBusy("find");
    setNote("");
    try {
      const { found } = await PairingStorePlugin.rediscover();
      if (found) {
        setDeviceConnection(await getPairing()); // so the app's own address is the one that answered
        setNote(`Found the office PC at ${found}.`);
      } else {
        setNote("The office PC was not found on this network. If you know it is on, try once more - the first try can wake a Wi-Fi link that had gone quiet.");
      }
      setReport(await PairingStorePlugin.diagnose());
    } catch {
      setNote("The search could not run.");
    } finally {
      setBusy("");
    }
  };

  const advice = report ? connectionAdvice(report) : null;
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="flex items-center gap-2 font-semibold text-slate-800"><Wifi size={18} /> Connection to the office PC</h3>
      <p className="text-sm text-slate-500">
        If the office PC cannot be reached, this phone tries every address it knows for it and looks for the PC on the Wi-Fi by itself.
        Use these when you want to see what is going on.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={Boolean(busy)} onClick={check}>{busy === "check" ? "Checking..." : "Check connection"}</button>
        <button type="button" className={button} disabled={Boolean(busy)} onClick={findAgain}>{busy === "find" ? "Looking..." : "Find the PC again"}</button>
      </div>
      {note && <p role="status" className="text-sm text-slate-700">{note}</p>}
      {advice && (
        <div role="status" className={`space-y-2 rounded-lg border px-3 py-2 text-sm ${advice.level === "good" ? "border-emerald-300 text-emerald-800" : "border-amber-300 text-amber-900"}`}>
          <p className="font-medium">{advice.headline}</p>
          {advice.tips.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs">{advice.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
          <ul className="space-y-0.5 text-xs">
            {report.results.map((r) => (
              <li key={`${r.via || "lan"}-${r.host}`}>{r.ok ? "✔" : "✘"} {r.via === "relay" ? "Internet relay" : r.host} {r.via !== "relay" && KIND[addressKind(r.host)] && `(${KIND[addressKind(r.host)]})`} - {r.ok ? `${r.ms} ms` : r.problem}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">This phone: {report.phoneAddresses.length ? report.phoneAddresses.join(", ") : "not on Wi-Fi"}</p>
        </div>
      )}
    </div>
  );
};

export default PhoneConnection;
