import apiClient from "../api/client";
import { PairingStorePlugin, isNative, keepRelay } from "./pairing";
import { acceptableAddresses } from "./addresses";

// Phone only. While the office PC answers, ask it for its addresses right now and keep any new ones: so a new address
// from the router - or Tailscale installed on the PC later - reaches this phone without pairing again, and the phone
// then still finds the PC from anywhere. The answer only comes over the already-trusted connection, and both here and
// in the phone's own code only office-network / Tailscale / .local addresses are kept.
const KEY = "sandveld_addresses_checked";
const EVERY_MS = 6 * 60 * 60 * 1000;

const lastChecked = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
const markChecked = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* asked again next time */ } };

export async function refreshKnownAddresses({ force = false } = {}) {
  if (!isNative() || (!force && Date.now() - lastChecked() < EVERY_MS)) return null;
  try {
    const { data } = await apiClient.get("/devices/addresses", { silent: true, queueable: true, timeout: 8000, fast: true });
    const hosts = acceptableAddresses(data?.addresses, data?.port);
    if (hosts.length) await PairingStorePlugin.addHosts({ hosts });
    if ("relay" in (data || {})) await keepRelay(data.relay); // new, changed or switched off on the PC
    markChecked();
    return hosts;
  } catch {
    return null; // the PC is not answering right now; asked again when it is
  }
}
