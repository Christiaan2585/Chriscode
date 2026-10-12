import assert from "node:assert/strict";
import test from "node:test";
import { checkForAndroidUpdate, pickApk, shouldCheckNow } from "./androidUpdate.js";

const release = (tag, assets) => ({ tag_name: tag, draft: false, prerelease: false, assets });
const apk = (name, extra = {}) => ({
  name, size: 4700000, state: "uploaded",
  browser_download_url: `https://github.com/Christiaan2585/Chriscode/releases/download/v1/${name}`,
  digest: "sha256:" + "ab".repeat(32), ...extra,
});
const exe = { name: "sandveld-vee-dienste-Setup-1.0.11.exe", size: 1, state: "uploaded", browser_download_url: "https://github.com/x/y/releases/download/v1/a.exe" };
const fetchOf = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

test("the phone's file is the .apk among the release's files, with its version taken from the file name", () => {
  const picked = pickApk(release("v1.0.11", [exe, apk("SandveldVeeDienste-1.0.11-release.apk")]));
  assert.equal(picked.name, "SandveldVeeDienste-1.0.11-release.apk");
  assert.equal(picked.version, "1.0.11");
  assert.equal(picked.sha256, "ab".repeat(32));
  assert.equal(picked.size, 4700000);
});

test("a release with no .apk (only the PC installer) offers the phone nothing", () => {
  assert.equal(pickApk(release("v1.0.11", [exe])), null);
});

test("when the file name has no version the release tag is used", () => {
  assert.equal(pickApk(release("v1.0.12", [apk("sandveld.apk")])).version, "1.0.12");
});

test("only files from GitHub's own https addresses are accepted", () => {
  assert.equal(pickApk(release("v1.0.11", [apk("a-1.0.11.apk", { browser_download_url: "https://evil.example.com/a.apk" })])), null);
  assert.equal(pickApk(release("v1.0.11", [apk("a-1.0.11.apk", { browser_download_url: "http://github.com/a.apk" })])), null);
  assert.ok(pickApk(release("v1.0.11", [apk("a-1.0.11.apk", { browser_download_url: "https://objects.githubusercontent.com/a.apk" })])));
});

test("drafts, pre-releases and files still uploading are ignored", () => {
  assert.equal(pickApk({ ...release("v1.0.11", [apk("a-1.0.11.apk")]), draft: true }), null);
  assert.equal(pickApk({ ...release("v1.0.11", [apk("a-1.0.11.apk")]), prerelease: true }), null);
  assert.equal(pickApk(release("v1.0.11", [apk("a-1.0.11.apk", { state: "starter" })])), null);
});

test("a newer phone file is an update; the same or an older one is not", async () => {
  const newer = await checkForAndroidUpdate("1.0.10", fetchOf(release("v1.0.11", [apk("A-1.0.11-release.apk")])));
  assert.equal(newer.state, "available");
  assert.equal(newer.update.version, "1.0.11");
  assert.equal((await checkForAndroidUpdate("1.0.11", fetchOf(release("v1.0.11", [apk("A-1.0.11-release.apk")])))).state, "up-to-date");
  assert.equal((await checkForAndroidUpdate("1.0.12", fetchOf(release("v1.0.11", [apk("A-1.0.11-release.apk")])))).state, "up-to-date");
});

test("a release tagged newer but carrying no phone file is not an update (a mislabelled or PC-only release)", async () => {
  assert.equal((await checkForAndroidUpdate("1.0.10", fetchOf(release("v1.0.11", [exe])))).state, "up-to-date");
});

test("GitHub or the network failing is reported, never thrown at the screen", async () => {
  const down = await checkForAndroidUpdate("1.0.10", async () => { throw new Error("offline"); });
  assert.equal(down.state, "error");
  const limited = await checkForAndroidUpdate("1.0.10", fetchOf({ message: "rate limit" }, false, 403));
  assert.equal(limited.state, "error");
});

test("the automatic check runs at most every six hours", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  assert.equal(shouldCheckNow(null, now), true);
  assert.equal(shouldCheckNow(String(now - 5 * 3600e3), now), false);
  assert.equal(shouldCheckNow(String(now - 7 * 3600e3), now), true);
  assert.equal(shouldCheckNow("garbage", now), true);
});
