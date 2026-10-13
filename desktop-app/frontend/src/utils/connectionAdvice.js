import { addressKind } from "./addresses.js";

// Turns the phone's connection check (PairingStore.diagnose) into plain words: what is wrong and what to try.
const sameNetwork = (a, b) => a.split(".").slice(0, 3).join(".") === b.split(".").slice(0, 3).join(".");

export function connectionAdvice({ results = [], phoneAddresses = [] }) {
  const working = results.find((r) => r.ok);
  if (working) {
    const kind = addressKind(working.host);
    const dead = results.filter((r) => !r.ok);
    const tips = [];
    if (kind !== "tailscale" && !results.some((r) => addressKind(r.host) === "tailscale")) {
      tips.push("For a connection that also works away from the office and across Wi-Fi points, install Tailscale on the PC and this phone.");
    }
    if (dead.length && kind !== "tailscale") tips.push(`${dead.map((r) => r.host).join(", ")} did not answer - the phone uses the one that does.`);
    return { level: "good", headline: `Connected to the office PC at ${working.host}${kind === "tailscale" ? " (Tailscale)" : ""} - ${working.ms} ms.`, tips };
  }

  const known = results.map((r) => r.host);
  const impostor = results.some((r) => /not the office PC/.test(r.problem || ""));
  if (!phoneAddresses.length) {
    return { level: "bad", headline: "This phone is not on Wi-Fi.", tips: ["Connect to the office Wi-Fi, then check again. Mobile data cannot reach the office PC unless Tailscale is installed on both."] };
  }
  const local = known.filter((h) => addressKind(h) === "wifi");
  if (local.length && !local.some((h) => phoneAddresses.some((p) => sameNetwork(p, h))) && !known.some((h) => addressKind(h) === "tailscale")) {
    return {
      level: "bad", headline: "This phone is on a different network from the office PC.",
      tips: ["Join the same Wi-Fi as the PC, or install Tailscale on both so they find each other anywhere."],
    };
  }
  const tips = [
    "Check that the Sandveld app is running on the office PC (it must be open, or set to stay in the tray) and that the PC is not asleep.",
    "If it is running: this Wi-Fi may stop devices from talking to each other (\"AP isolation\" or a different Wi-Fi point of the mesh). Try the PC on a cable, or install Tailscale on both.",
  ];
  if (impostor) tips.unshift("Something answers at the saved address but it is not the office PC (another device took that address). Use Find the PC again, or pair the phone again.");
  return { level: "bad", headline: "The office PC does not answer.", tips };
}
