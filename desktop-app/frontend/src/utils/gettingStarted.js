// The Getting started checklist on the Dashboard: what a new business still has to do, ticked off from what actually
// exists. Pure (tested in gettingStarted.test.mjs); the card is components/dashboard/GettingStarted.jsx.

export function buildChecklist({ isAdmin, businessMissing, user, mailConfigured, counts, extraBackup }) {
  const all = [
    { id: "company", label: "Fill in your company and banking details", why: "They are printed on every invoice and quote.", link: "/settings/company", adminOnly: true, done: (businessMissing || []).length === 0 },
    { id: "me", label: "Add your phone number and a photo", why: "Your number is printed as the sales rep on what you make.", link: "/settings/my-details", done: Boolean(user?.phone && user?.avatar_url) },
    { id: "email", label: "Set up email", why: "So quotes, invoices and statements can be sent from the app.", link: "/settings/email", adminOnly: true, done: Boolean(mailConfigured) },
    { id: "client", label: "Add your first client", why: "Everything else hangs off a client.", link: "/clients?new=1", done: (counts?.clients || 0) > 0 },
    { id: "quote", label: "Make your first quote or invoice", why: "", link: "/programs?new=1", done: ((counts?.quotes || 0) + (counts?.invoices || 0)) > 0 },
    { id: "backup", label: "Keep a second copy of your data safe", why: "Choose a OneDrive folder or a USB drive under Settings > Data & Backups.", link: "/settings/backups", adminOnly: true, done: extraBackup === true },
  ];
  const steps = all.filter((s) => isAdmin || !s.adminOnly);
  const doneCount = steps.filter((s) => s.done).length;
  // Not ready until what it depends on has loaded, so nothing is claimed (or shown as missing) too early.
  const ready = counts !== undefined && (!isAdmin || extraBackup !== null);
  return { steps, doneCount, total: steps.length, complete: doneCount === steps.length, ready };
}
