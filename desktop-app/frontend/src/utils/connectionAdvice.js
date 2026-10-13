import { addressKind } from "./addresses.js";

// Turns the phone's connection check (PairingStore.diagnose) into plain words: what is wrong and what to try.
// `results` has one row per address the phone knows, plus (if the office PC offers it) one row with via: "relay" for the
// internet relay ("Connect from anywhere" on the PC).
const sameNetwork = (a, b) => a.split(".").slice(0, 3).join(".") === b.split(".").slice(0, 3).join(".");

const SWITCH_ON_RELAY = "An administrator can switch on \"Connect from anywhere\" under Settings > Phones on the office PC, so phones connect from any network.";

export function connectionAdvice({ results = [], phoneAddresses = [], tailnetPhoneAddresses = [], hasRelay }) {
  const lan = results.filter((r) => r.via !== "relay");
  const relay = results.find((r) => r.via === "relay");
  const relayKnown = hasRelay ?? Boolean(relay);

  const workingLan = lan.find((r) => r.ok);
  if (workingLan) {
    const kind = addressKind(workingLan.host);
    const dead = lan.filter((r) => !r.ok);
    const tips = [];
    if (!relayKnown && kind !== "tailscale") tips.push(`To connect away from the office too: ${SWITCH_ON_RELAY}`);
    if (dead.length && kind !== "tailscale") tips.push(`${dead.map((r) => r.host).join(", ")} did not answer - the phone uses the one that does.`);
    return { level: "good", headline: `Connected to the office PC at ${workingLan.host}${kind === "tailscale" ? " (Tailscale)" : ""} - ${workingLan.ms} ms.`, tips };
  }
  if (relay?.ok) {
    return { level: "good", headline: `Connected to the office PC through the internet relay - ${relay.ms} ms (the office Wi-Fi is not needed).`, tips: [] };
  }

  const known = lan.map((r) => r.host);
  const impostor = lan.some((r) => /not the office PC/.test(r.problem || ""));
  const relayTips = [];
  if (relay && /not connected/.test(relay.problem || "")) {
    relayTips.push("The relay answers, but the office PC is not connected to it: make sure the Sandveld app is running on the PC (it must be open or in the tray), the PC is awake and it has internet.");
  } else if (relay) {
    relayTips.push("This phone cannot reach the relay either: check that its internet connection (Wi-Fi or mobile data) works.");
  } else if (!relayKnown) {
    relayTips.push(SWITCH_ON_RELAY);
  }

  const knowsTailnet = known.some((h) => addressKind(h) === "tailscale");
  const phoneOnTailnet = tailnetPhoneAddresses.length > 0;
  if (knowsTailnet && !phoneOnTailnet) {
    return { level: "bad", headline: "Tailscale is not turned on for this phone.", tips: ["Open Tailscale on this phone and turn it on, then check again - the PC is reachable through it from anywhere.", ...relayTips] };
  }
  // Tailscale is on for the phone but the phone has never been told the PC's Tailscale address.
  const finishPc = phoneOnTailnet && !knowsTailnet
    ? ["Tailscale is on for this phone, but it does not know the PC's Tailscale address yet: install Tailscale on the PC and sign in (same account), then open this app once on the office Wi-Fi - it learns the address by itself."]
    : [];

  if (!phoneAddresses.length && !phoneOnTailnet) {
    return { level: "bad", headline: relay ? "The office PC cannot be reached from here." : "This phone is not on Wi-Fi.", tips: ["Connect to the office Wi-Fi or turn on mobile data, then check again.", ...relayTips] };
  }
  const local = known.filter((h) => addressKind(h) === "wifi");
  if (local.length && !local.some((h) => phoneAddresses.some((p) => sameNetwork(p, h))) && !knowsTailnet) {
    return {
      level: "bad", headline: "This phone is on a different network from the office PC.",
      tips: [...finishPc, "Join the same Wi-Fi as the PC.", ...relayTips],
    };
  }
  const tips = [
    ...finishPc,
    "Check that the Sandveld app is running on the office PC (it must be open, or set to stay in the tray) and that the PC is not asleep.",
    ...relayTips,
    "If it is running and nothing helps: this Wi-Fi may stop devices from talking to each other (\"AP isolation\" or a different Wi-Fi point of the mesh). The PC on a cable usually fixes that.",
  ];
  if (impostor) tips.unshift("Something answers at the saved address but it is not the office PC (another device took that address). Use Find the PC again, or pair the phone again.");
  return { level: "bad", headline: "The office PC does not answer.", tips };
}
