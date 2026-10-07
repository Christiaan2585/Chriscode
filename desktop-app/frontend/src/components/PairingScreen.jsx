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

  const pair = async ({ hosts, port, fp, code }) => {
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
      if (data) pair({ hosts: data.hosts, port: data.port, fp: data.fp, code: data.code });
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
