import test from "node:test";
import assert from "node:assert/strict";
import { applyProvider, detectProvider, effectiveUsername, friendlyMailError, providerById } from "./mailProviders.js";

test("picking Gmail fills in its server, port and security", () => {
  const form = applyProvider({ host: "", port: 25, security: "ssl", from_address: "a@b.co" }, "gmail");
  assert.deepEqual([form.host, form.port, form.security, form.from_address], ["smtp.gmail.com", 587, "starttls", "a@b.co"]);
});

test("Yahoo uses SSL on 465, and 'other' keeps the typed server", () => {
  const y = applyProvider({ host: "x" }, "yahoo");
  assert.deepEqual([y.host, y.port, y.security], ["smtp.mail.yahoo.com", 465, "ssl"]);
  assert.equal(applyProvider({ host: "mail.mijnplaas.co.za", port: 25 }, "other").host, "mail.mijnplaas.co.za");
});

test("a saved server is recognised, anything else is 'other'", () => {
  assert.equal(detectProvider("SMTP.Gmail.com "), "gmail");
  assert.equal(detectProvider("smtp.office365.com"), "outlook");
  assert.equal(detectProvider("mail.myfarm.co.za"), "other");
  assert.equal(detectProvider(""), "other");
});

test("the user name defaults to the email address", () => {
  assert.equal(effectiveUsername({ username: "", from_address: " me@x.co " }), "me@x.co");
  assert.equal(effectiveUsername({ username: "bob", from_address: "me@x.co" }), "bob");
});

test("a refused Gmail sign-in tells you about app passwords; a dead server tells you to check the details", () => {
  assert.match(friendlyMailError("The mail server refused the user name or password", "gmail"), /app password/);
  assert.match(friendlyMailError("The mail server refused the user name or password", "other"), /full email address/);
  assert.match(friendlyMailError("Couldn't send through the mail server (gaierror). Check...", "other"), /Server details/);
  assert.match(friendlyMailError("Enter the password again when you change the mail server or user name", "gmail"), /type the password again/);
  assert.equal(providerById("nope").id, "other");
});
