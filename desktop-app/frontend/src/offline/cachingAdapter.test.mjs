import assert from "node:assert/strict";
import test from "node:test";
import axios, { AxiosError } from "axios";
import { cacheKey, isCacheable, withOfflineCache } from "./cachingAdapter.js";

const memory = () => {
  const map = new Map();
  return { map, get: async (k) => map.get(k), put: async (k, v) => void map.set(k, v) };
};
const ok = (data) => async (config) => ({ data: JSON.stringify(data), status: 200, statusText: "", headers: { "content-type": "application/json" }, config, request: {} });
const noAnswer = async (config) => { throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, {}); };
const refused = (status) => async (config) => {
  throw new AxiosError("bad", AxiosError.ERR_BAD_REQUEST, config, {}, { data: "{}", status, headers: {}, config });
};

const client = (inner, store, events = []) =>
  axios.create({ baseURL: "https://10.0.2.2:8443", adapter: withOfflineCache(inner, { store, onReachable: (v) => events.push(v) }) });

test("which requests are kept", () => {
  assert.equal(isCacheable({ method: "get", url: "/clients/" }), true);
  assert.equal(isCacheable({ method: "get", url: "/clients/3/summary" }), true);
  assert.equal(isCacheable({ method: "post", url: "/clients/" }), false);
  assert.equal(isCacheable({ method: "get", url: "/auth/me" }), false);
  assert.equal(isCacheable({ method: "get", url: "/backups/" }), false);
  assert.equal(isCacheable({ method: "get", url: "/audit" }), false);
  assert.equal(isCacheable({ method: "get", url: "/devices/" }), false);
  assert.equal(isCacheable({ method: "get", url: "/invoices/1/pdf", responseType: "blob" }), false);
});

test("the key is the address without the host, with the query", () => {
  assert.equal(cacheKey({ baseURL: "https://10.0.2.2:8443", url: "/audit", params: { q: "a b", limit: 5 } }), "/audit?q=a+b&limit=5");
  assert.equal(cacheKey({ baseURL: "https://192.168.1.5:8443", url: "/clients/" }), "/clients/");
});

test("an answer from the PC is kept and still returned normally", async () => {
  const store = memory();
  const events = [];
  const http = client(ok([{ id: 1 }]), store, events);
  const r = await http.get("/clients/");
  assert.deepEqual(r.data, [{ id: 1 }]);
  assert.ok(store.map.has("/clients/"));
  assert.deepEqual(events, [true]);
});

test("with no answer from the PC the kept copy is used", async () => {
  const store = memory();
  await client(ok([{ id: 1 }]), store).get("/clients/");
  const events = [];
  const r = await client(noAnswer, store, events).get("/clients/");
  assert.deepEqual(r.data, [{ id: 1 }]);
  assert.equal(r.headers["x-from-saved-copy"], "1");
  assert.deepEqual(events, [false]);
});

test("nothing kept and no answer is still an error", async () => {
  await assert.rejects(client(noAnswer, memory()).get("/clients/"), (e) => e.code === "ERR_NETWORK" && !e.response);
});

test("a refusal from the PC is never replaced by old data", async () => {
  const store = memory();
  await client(ok([{ id: 1 }]), store).get("/clients/");
  const events = [];
  await assert.rejects(client(refused(401), store, events).get("/clients/"), (e) => e.response.status === 401);
  assert.deepEqual(events, [true]); // the PC answered, so it is reachable
});

test("changes are never answered from the kept copy", async () => {
  const store = memory();
  await client(ok({}), store).get("/clients/");
  await assert.rejects(client(noAnswer, store).post("/clients/", { name: "x" }), (e) => e.code === "ERR_NETWORK");
});

test("files are not kept", async () => {
  const store = memory();
  const inner = async (config) => ({ data: new Blob(["%PDF"]), status: 200, statusText: "", headers: {}, config, request: {} });
  await client(inner, store).get("/invoices/1/pdf", { responseType: "blob" });
  assert.equal(store.map.size, 0);
});

test("a failing store never breaks a request", async () => {
  const broken = { get: async () => { throw new Error("disk"); }, put: async () => { throw new Error("disk"); } };
  assert.deepEqual((await client(ok([1]), broken).get("/clients/")).data, [1]);
});

test("when the PC is known to be out of reach the kept copy is used at once, without trying the PC", async () => {
  const store = memory();
  await client(ok([{ id: 1 }]), store).get("/clients/");
  let tried = 0;
  const inner = async (config) => { tried += 1; return ok([])(config); };
  const http = axios.create({ baseURL: "https://10.0.2.2:8443", adapter: withOfflineCache(inner, { store, preferSaved: () => true }) });
  assert.deepEqual((await http.get("/clients/")).data, [{ id: 1 }]);
  assert.equal(tried, 0);
  // nothing kept for this one, and a change: both fail at once, without waiting on the PC
  await assert.rejects(http.get("/products/"), (e) => e.code === "ERR_NETWORK" && !e.response);
  await assert.rejects(http.post("/clients/", {}), (e) => e.code === "ERR_NETWORK");
  assert.equal(tried, 0);
  // only the quick probe still asks the PC
  await http.get("/version", { fast: true });
  assert.equal(tried, 1);
});
