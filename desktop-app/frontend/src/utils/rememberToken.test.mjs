import assert from "node:assert/strict";
import test from "node:test";
import { createTokenStore } from "./rememberToken.js";

const KEY = "sandveld_remember_token";
const memoryLocal = (start = {}) => {
  const data = { ...start };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
};
const memorySecure = (start = {}, { failSet = false } = {}) => {
  const data = { ...start };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => { if (failSet) throw new Error("no encryption"); data[k] = v; },
    remove: async (k) => { delete data[k]; },
  };
};

test("a token saved on this device goes to the protected store, never into plain browser storage", async () => {
  const local = memoryLocal(), secure = memorySecure();
  const store = createTokenStore({ secure, local });
  await store.load();
  await store.set("abc");
  assert.equal(store.get(), "abc");
  assert.equal(secure.data[KEY], "abc");
  assert.equal(local.data[KEY], undefined);
});

test("a token an older version left in plain storage is moved across, then removed from plain storage", async () => {
  const local = memoryLocal({ [KEY]: "old-token" }), secure = memorySecure();
  const store = createTokenStore({ secure, local });
  assert.equal(await store.load(), "old-token");
  assert.equal(secure.data[KEY], "old-token");
  assert.equal(local.data[KEY], undefined);
});

test("if the protected store cannot be written, the token is kept in plain storage rather than lost", async () => {
  const local = memoryLocal({ [KEY]: "old-token" }), secure = memorySecure({}, { failSet: true });
  const store = createTokenStore({ secure, local });
  assert.equal(await store.load(), "old-token");
  assert.equal(local.data[KEY], "old-token"); // not removed: the move failed
  await store.set("new-token");
  assert.equal(local.data[KEY], "new-token");
  assert.equal(store.get(), "new-token");
});

test("with no protected store at all (a plain browser) it works from plain storage", async () => {
  const local = memoryLocal();
  const store = createTokenStore({ secure: null, local });
  assert.equal(await store.load(), null);
  await store.set("t");
  assert.equal(local.data[KEY], "t");
  await store.remove();
  assert.equal(store.get(), null);
  assert.equal(local.data[KEY], undefined);
});

test("removing forgets it everywhere", async () => {
  const local = memoryLocal({ [KEY]: "x" }), secure = memorySecure({ [KEY]: "x" });
  const store = createTokenStore({ secure, local });
  await store.load();
  await store.remove();
  assert.equal(store.get(), null);
  assert.equal(secure.data[KEY], undefined);
  assert.equal(local.data[KEY], undefined);
});

test("if both hold a token, the protected one wins and the plain copy is cleared", async () => {
  const local = memoryLocal({ [KEY]: "stale" }), secure = memorySecure({ [KEY]: "fresh" });
  const store = createTokenStore({ secure, local });
  assert.equal(await store.load(), "fresh");
  assert.equal(local.data[KEY], undefined);
});
