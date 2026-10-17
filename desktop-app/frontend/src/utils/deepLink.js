// sandveld://go/<page>[?new=1]: the phone's home-screen shortcuts ("New client", "New invoice") open the app on that page. Only
// the pages below are accepted, and only the one `new=1` option - a link from outside can never reach anything else.

const PAGES = new Set(["", "clients", "invoices", "programs", "calendar"]);

export function goPath(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "sandveld:" || parsed.hostname !== "go") return null;
  const page = parsed.pathname.replace(/^\/+|\/+$/g, "");
  if (!PAGES.has(page)) return null;
  const wantsNew = parsed.searchParams.get("new") === "1" && page !== "" && page !== "calendar";
  return `/${page}${wantsNew ? "?new=1" : ""}`;
}
