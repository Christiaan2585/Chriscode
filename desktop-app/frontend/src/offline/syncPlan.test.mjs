import assert from "node:assert/strict";
import test from "node:test";
import { BASE_ENDPOINTS, downloadEverything } from "./syncPlan.js";

const world = () => {
  const asked = [];
  const data = {
    "/clients/": [{ id: 1 }, { id: 2 }],
    "/invoices/": [{ id: 10 }],
    "/quotes/": [{ id: 20 }, { id: 21 }],
    "/programs/client/1": [{ id: 7 }],
    "/programs/client/2": [],
  };
  const get = async (url, params) => {
    asked.push(params ? `${url}?${new URLSearchParams(params)}` : url);
    if (url === "/orders/") throw new Error("boom"); // one failing list must not stop the rest
    return data[url] ?? [];
  };
  return { asked, get };
};

test("everything the phone shows is downloaded, including each client's own pages", async () => {
  const { asked, get } = world();
  const result = await downloadEverything({ get });
  for (const url of BASE_ENDPOINTS) assert.ok(asked.some((a) => a.startsWith(url)), url);
  for (const url of ["/clients/1", "/clients/1/summary", "/animals/client/1", "/notes/client/1", "/quotes/client/1", "/orders/client/1",
    "/invoices/client/1", "/appointments/client/1", "/rams/client/1", "/programs/client/1", "/clients/2/summary", "/programs/7/schedule",
    "/invoices/10/items", "/quotes/20/items", "/quotes/21/items"]) {
    assert.ok(asked.includes(url), url);
  }
  assert.equal(result.failed, 1);
  assert.equal(result.done, result.total);
});

test("progress is reported and ends at the total", async () => {
  const { get } = world();
  const seen = [];
  const result = await downloadEverything({ get, onProgress: (p) => seen.push(p) });
  assert.ok(seen.length > 5);
  assert.deepEqual(seen.at(-1), { done: result.total, total: result.total });
  assert.ok(seen.every((p, i) => i === 0 || p.done >= seen[i - 1].done));
});

test("a quick refresh only fetches the lists, not every client's pages", async () => {
  const { asked, get } = world();
  await downloadEverything({ get, deep: false });
  assert.ok(asked.includes("/clients/"));
  assert.ok(!asked.some((a) => a.includes("/summary")));
});

test("it stops when asked to", async () => {
  const { asked, get } = world();
  const controller = new AbortController();
  controller.abort();
  const result = await downloadEverything({ get, signal: controller.signal });
  assert.equal(asked.length, 0);
  assert.equal(result.aborted, true);
});
