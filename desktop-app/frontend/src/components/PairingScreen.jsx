import React, { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import axios from "axios";
import { decodePairingLink, savePairing, trustHost } from "../utils/pairing";
import { setDeviceConnection } from "../api/client";

// A readable name for Settings -> Phones' paired-phone list on the PC.
const deviceName = () => {
  try {
    return navigator.userAgent.match(/Android[^;]*;\s*([^)]+)\)/)?.[1]?.trim() || "Phone";
  } catch {
    return "Phone";
  }
};

// The office PC is only ever on the office network (or, later, a private
// VPN such as Tailscale's 100.64.0.0/10) - never an internet address. A
// pairing link pointing anywhere else is someone trying to get this phone's
// staff to type their password into their server.
// Whole-string matches only ("evil.com/x.local" must not pass), and the
// address is re-read by the URL parser so nothing in it (an "@", a port
// like "1@evil.com") can point the request anywhere else.
const PRIVATE_IP = /^(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01])|169\.254|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}$/;
const LOCAL_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.local$/i;
export const isOfficeAddress = (host, port = 8443) => {
  const h = String(host || "").trim();
  if (!PRIVATE_IP.test(h) && !LOCAL_NAME.test(h)) return false;
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) return false;
  try {
    const url = new URL(`https://${h}:${Number(port)}/`);
    return url.hostname === h.toLowerCase() && url.port === String(Number(port)) && !url.username;
  } catch {
    return false;
  }
};

// Tries each address the PC offered (it may have more than one network
// interface) until one actually answers.
async function pairAgainst(hosts, port, fingerprint, code) {
  let lastError = null;
  for (const host of hosts) {
    try {
      await trustHost(host, port, fingerprint);
      const response = await axios.post(
        `https://${host}:${port}/devices/pair`,
        { code, name: deviceName() },
        { timeout: 8000 }
      );
      return { host, token: response.data.device_token };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not reach the office PC");
}

// Android only: shown instead of the whole app until this phone is paired
// with the office PC (see app/api/devices.py). Pairing normally happens by
// tapping the PC's QR code open in this app (sandveld://pair?... - any
// camera app recognises it as a link); the manual form below is the
// fallback when that can't be scanned.
const PairingScreen = ({ onPaired }) => {
  const [status, setStatus] = useState("idle"); // idle | pairing | error
  const [error, setError] = useState(null);
  const [manual, setManual] = useState({ host: "", port: "8443", fingerprint: "", code: "" });

  const [offer, setOffer] = useState(null); // pairing details from a link, waiting for the user's OK

  const pair = async ({ hosts, port, fp, code }) => {
    setOffer(null);
    port = Number(port);
    const office = (hosts || []).map((h) => String(h).trim()).filter((h) => isOfficeAddress(h, port));
    if (!office.length) {
      setStatus("error");
      setError("That isn't an office network address, so this app won't pair with it. Only scan the QR code shown on the office PC.");
      return;
    }
    hosts = office;
    setStatus("pairing");
    setError(null);
    try {
      const { host, token } = await pairAgainst(hosts, port, fp, code);
      await savePairing(host, port, fp, token, deviceName());
      setDeviceConnection({ host, port, token });
      onPaired();
    } catch (e) {
      setStatus("error");
      setError(e?.response?.data?.detail || "Couldn't pair - check the code and that this phone is on the office Wi-Fi.");
    }
  };

  useEffect(() => {
    const subscription = App.addListener("appUrlOpen", ({ url }) => {
      const data = decodePairingLink(url);
      // Never pair straight from a link - anyone can send one. Show where it
      // points and let the user say yes.
      if (data) setOffer({ hosts: data.hosts, port: data.port, fp: data.fp, code: data.code });
    });
    return () => {
      subscription.then((handle) => handle.remove());
    };
  }, []);

  const submitManual = (e) => {
    e.preventDefault();
    pair({ hosts: [manual.host.trim()], port: Number(manual.port) || 8443, fp: manual.fingerprint.trim(), code: manual.code.trim() });
  };

  const field = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-800">Pair with the office PC</h1>
          <p className="mt-1 text-sm text-slate-500">
            On the PC, open Settings &gt; Phones &gt; "Pair a phone", then scan the QR code with this phone's camera
            and open it in Sandveld. Both devices must be on the office Wi-Fi.
          </p>
        </div>

        {offer && (
          <div role="alertdialog" aria-label="Confirm pairing" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              Pair with the office PC at <b>{(offer.hosts || []).join(" / ")}</b>? Only say yes if you just scanned the QR code
              on the office PC yourself.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOffer(null)} className="px-3 py-1.5 font-medium text-slate-600">Cancel</button>
              <button type="button" onClick={() => pair(offer)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700">Pair</button>
            </div>
          </div>
        )}
        {status === "pairing" && <p className="text-center text-sm text-emerald-700">Pairing...</p>}
        {status === "error" && <p role="alert" className="text-center text-sm text-red-600">{error}</p>}

        <details className="text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">Can't scan it? Enter it manually</summary>
          <form onSubmit={submitManual} className="mt-3 space-y-2">
            <input required placeholder="PC address (e.g. 192.168.1.20)" value={manual.host}
              onChange={(e) => setManual({ ...manual, host: e.target.value })} className={field} />
            <input required placeholder="Port (default 8443)" value={manual.port}
              onChange={(e) => setManual({ ...manual, port: e.target.value })} className={field} />
            <input required placeholder="Certificate fingerprint" value={manual.fingerprint}
              onChange={(e) => setManual({ ...manual, fingerprint: e.target.value })} className={`${field} font-mono text-xs`} />
            <input required placeholder="Pairing code" value={manual.code}
              onChange={(e) => setManual({ ...manual, code: e.target.value })} className={field} />
            <button type="submit" disabled={status === "pairing"}
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Pair
            </button>
          </form>
        </details>
      </div>
    </div>
  );
};

export default PairingScreen;
