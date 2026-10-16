// Settings -> Email: the common email providers, so nobody has to know what "SMTP", "STARTTLS" or a port is.
// Picking one fills the server details in; "other" leaves them for the person to type.

export const PROVIDERS = [
  {
    id: "gmail", name: "Gmail", host: "smtp.gmail.com", port: 587, security: "starttls", appPassword: true,
    help: "Gmail needs an app password, not your normal password. Turn on 2-Step Verification for your Google account, then create an app password (name it Sandveld) and paste the 16 letters here.",
    link: { url: "https://myaccount.google.com/apppasswords", label: "Create a Google app password" },
  },
  {
    id: "outlook", name: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587, security: "starttls", appPassword: false,
    help: "Use your normal Microsoft sign-in. If it is refused, your Microsoft 365 administrator may need to allow sending from apps (called SMTP AUTH), or you can use an app password if you have 2-step sign-in on.",
    link: null,
  },
  {
    id: "yahoo", name: "Yahoo", host: "smtp.mail.yahoo.com", port: 465, security: "ssl", appPassword: true,
    help: "Yahoo needs an app password, not your normal password. Create one in your Yahoo account security settings and paste it here.",
    link: { url: "https://login.yahoo.com/account/security", label: "Open Yahoo account security" },
  },
  {
    id: "other", name: "Other (my own domain or web host)", host: "", port: 587, security: "starttls", appPassword: false,
    help: "Ask your web host or email provider for the outgoing mail (SMTP) server name. It is usually mail.yourdomain.co.za or smtp.yourdomain.co.za, with port 587, and your full email address as the user name.",
    link: null,
  },
];

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1];

// Which provider a saved server belongs to (anything unknown is "other").
export const detectProvider = (host) => {
  const h = (host || "").trim().toLowerCase();
  return (PROVIDERS.find((p) => p.host && p.host === h) || PROVIDERS[PROVIDERS.length - 1]).id;
};

// Choosing a provider fills in its server; "other" keeps whatever is typed.
export function applyProvider(form, id) {
  const p = providerById(id);
  if (id === "other") return { ...form, security: p.security, port: p.port };
  return { ...form, host: p.host, port: p.port, security: p.security };
}

// The user name is almost always the email address itself, so it is only asked for under "Server details".
export const effectiveUsername = (form) => (form.username || "").trim() || (form.from_address || "").trim();

// Turn the server's refusal into what to do about it.
export function friendlyMailError(text, providerId) {
  const t = String(text || "");
  const p = providerById(providerId);
  if (/user name or password/i.test(t)) {
    return p.appPassword
      ? `${p.name} refused the sign-in. It needs an app password, not your normal password - see the steps above.`
      : `${p.name === "Other (my own domain or web host)" ? "The mail server" : p.name} refused the user name or password. Check the email address and password, and that the user name is your full email address.`;
  }
  if (/refused that email address/i.test(t)) return "The mail server refused that address. Check it for typing mistakes.";
  if (/Couldn't send through the mail server/i.test(t)) {
    return "Couldn't reach the mail server. Check you are online and that the server name, port and security under \"Server details\" are right.";
  }
  if (/Enter the password again/i.test(t)) return "You changed the mail provider or user name, so please type the password again.";
  return t || "That didn't work.";
}
