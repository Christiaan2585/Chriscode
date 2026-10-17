// Making "Sign in with Google" easy to set up: Google hands you a Client ID and secret either as two values to copy or as a
// downloaded .json file. Whatever the person pastes or drops in, find the two values - they never have to pick them apart.

const ID_PATTERN = /\b\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com\b/;
const SECRET_PATTERN = /\bGOCSPX-[A-Za-z0-9_-]{10,}\b/;

/** { clientId, clientSecret } with "" for what could not be found. Accepts Google's downloaded JSON ("installed" or "web"), or any
 * text that contains the two values (a copied email, the console page, two lines). */
export function parseGoogleCredentials(text) {
  const raw = String(text || "");
  try {
    const parsed = JSON.parse(raw);
    const block = parsed?.installed || parsed?.web || parsed;
    if (block && (block.client_id || block.client_secret)) {
      return { clientId: String(block.client_id || "").trim(), clientSecret: String(block.client_secret || "").trim() };
    }
  } catch {
    // not JSON: look for the values in the text
  }
  return { clientId: (raw.match(ID_PATTERN) || [""])[0], clientSecret: (raw.match(SECRET_PATTERN) || [""])[0] };
}

/** What is still missing, in plain words (empty when both look right). */
export function credentialProblems({ clientId, clientSecret }) {
  const problems = [];
  if (!ID_PATTERN.test(`${clientId || ""}`.trim()) || !`${clientId}`.trim().endsWith(".apps.googleusercontent.com")) {
    problems.push("The Client ID is missing or incomplete. It is a long number that ends in .apps.googleusercontent.com");
  }
  const secret = `${clientSecret || ""}`.trim();
  if (secret.length < 10 || /\s/.test(secret)) problems.push("The Client secret is missing. It usually starts with GOCSPX-");
  return problems;
}
