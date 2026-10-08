import assert from "node:assert/strict";
import test from "node:test";
import axios, { AxiosError } from "axios";
import { base64ToBytes, bytesToBase64, createAdapter } from "./nativeHttp.js";

const text = (value) => new TextEncoder().encode(value);
const reply = (status, payload, headers = {}) => ({ status, headers, body: bytesToBase64(text(payload)) });

// An axios client that uses the adapter, with a fake phone plugin that records what it was asked.
const client = (respond) => {
  const seen = [];
  const http = axios.create({
    baseURL: "https://10.0.2.2:8443",
    adapter: createAdapter(async (options) => { seen.push(options); return respond(options); }),
  });
  return { http, seen };
};

test("base64 round trip, including big payloads", () => {
  const bytes = new Uint8Array(200000).map((_, i) => i % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test("a JSON post goes out as text and a JSON answer comes back parsed", async () => {
  const { http, seen } = client(() => reply(200, '{"ok":true}', { "content-type": "application/json" }));
  const result = await http.post("/devices/pair", { code: "ABCD-EFGH" }, { headers: { "X-Device-Token": "tok" } });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(seen[0].url, "https://10.0.2.2:8443/devices/pair");
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].headers["X-Device-Token"], "tok");
  assert.equal(new TextDecoder().decode(base64ToBytes(seen[0].body)), '{"code":"ABCD-EFGH"}');
});

test("query parameters are put on the address", async () => {
  const { http, seen } = client(() => reply(200, "[]"));
  await http.get("/audit", { params: { limit: 50, q: "a b" } });
  assert.equal(seen[0].url, "https://10.0.2.2:8443/audit?limit=50&q=a+b");
});

test("a refused request rejects with the answer attached, like a normal axios error", async () => {
  const { http } = client(() => reply(429, '{"detail":"Too many tries"}', { "content-type": "application/json" }));
  await assert.rejects(http.post("/auth/login", {}), (error) => {
    assert.ok(error instanceof AxiosError);
    assert.equal(error.response.status, 429);
    assert.equal(error.response.data.detail, "Too many tries");
    return true;
  });
});

test("no answer at all is a network error with no response (the outbox relies on that)", async () => {
  const { http } = client(() => { throw { code: "NETWORK" }; });
  await assert.rejects(http.get("/clients/"), (error) => error.code === "ERR_NETWORK" && !error.response && Boolean(error.request));
});

test("a timeout is reported as one", async () => {
  const { http } = client(() => { throw { code: "TIMEOUT" }; });
  await assert.rejects(http.get("/clients/", { timeout: 5000 }), (error) => error.code === "ECONNABORTED");
});

test("a file upload is sent as real multipart with its boundary", async () => {
  const { http, seen } = client(() => reply(200, "{}"));
  const form = new FormData();
  form.append("file", new Blob([text("%PDF-1.4 hello")], { type: "application/pdf" }), "cert.pdf");
  await http.put("/clients/1/tax-certificate", form);
  assert.match(seen[0].headers["Content-Type"], /^multipart\/form-data; boundary=/);
  const sent = new TextDecoder().decode(base64ToBytes(seen[0].body));
  assert.match(sent, /name="file"; filename="cert.pdf"/);
  assert.match(sent, /%PDF-1.4 hello/);
});

test("downloads come back as a Blob or an ArrayBuffer when asked", async () => {
  const { http } = client(() => reply(200, "%PDF-1.4", { "content-type": "application/pdf" }));
  const blob = (await http.get("/invoices/1/pdf", { responseType: "blob" })).data;
  assert.equal(blob.type, "application/pdf");
  assert.equal(blob.size, 8);
  const buffer = (await http.get("/invoices/1/pdf", { responseType: "arraybuffer" })).data;
  assert.equal(new TextDecoder().decode(buffer), "%PDF-1.4");
});
