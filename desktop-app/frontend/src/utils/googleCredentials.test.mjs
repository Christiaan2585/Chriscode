import test from "node:test";
import assert from "node:assert/strict";
import { parseGoogleCredentials, credentialProblems } from "./googleCredentials.js";

// built from parts so no real-looking Google key is written out in the repository
const ID = ["123456789012-abcdefghijklmnop", "apps", "googleusercontent", "com"].join(".");
const SECRET = ["GOCSPX", "abcdefghijklmnopqrstuvwxyz12"].join("-");

test("Google's downloaded JSON file is understood (installed or web)", () => {
  const installed = JSON.stringify({ installed: { client_id: ID, client_secret: SECRET, project_id: "x" } });
  assert.deepEqual(parseGoogleCredentials(installed), { clientId: ID, clientSecret: SECRET });
  const web = JSON.stringify({ web: { client_id: ID, client_secret: SECRET } });
  assert.deepEqual(parseGoogleCredentials(web), { clientId: ID, clientSecret: SECRET });
});

test("two values pasted as text are found, whatever is around them", () => {
  const text = `Your OAuth client\nClient ID: ${ID}\nClient secret:  ${SECRET}\nCreated Oct 17`;
  assert.deepEqual(parseGoogleCredentials(text), { clientId: ID, clientSecret: SECRET });
});

test("only one value pasted gives the other as empty", () => {
  assert.deepEqual(parseGoogleCredentials(ID), { clientId: ID, clientSecret: "" });
  assert.deepEqual(parseGoogleCredentials(SECRET), { clientId: "", clientSecret: SECRET });
  assert.deepEqual(parseGoogleCredentials(""), { clientId: "", clientSecret: "" });
  assert.deepEqual(parseGoogleCredentials(undefined), { clientId: "", clientSecret: "" });
});

test("problems are listed in plain words", () => {
  assert.deepEqual(credentialProblems({ clientId: ID, clientSecret: SECRET }), []);
  assert.equal(credentialProblems({ clientId: "", clientSecret: SECRET }).length, 1);
  assert.match(credentialProblems({ clientId: ID, clientSecret: "short" })[0], /Client secret/);
  assert.equal(credentialProblems({ clientId: "nope", clientSecret: "" }).length, 2);
});
