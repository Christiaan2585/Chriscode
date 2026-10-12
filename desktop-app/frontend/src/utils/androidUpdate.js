// Android self-update, the phone's counterpart of the PC's electron-updater: the app asks GitHub Releases (a public
// repository, so no sign-in) whether a newer .apk is attached to the latest release, downloads it and hands it to
// Android's installer. This file is the pure part (what to ask, how to read the answer); the download and the
// install itself are native (AppUpdatePlugin.java, wrapped by androidUpdateNative.js). Android refuses to install an
// update that is not signed with the same key as the installed app, and the plugin checks that too before it asks.
import { compareVersions } from "./whatsNew.js";

export const RELEASE_API = "https://api.github.com/repos/Christiaan2585/Chriscode/releases/latest";
export const CHECK_EVERY_MS = 6 * 3600e3;
export const CHECKED_KEY = "sandveld_update_checked_at";

// Where a phone file may come from: GitHub's own addresses, over https. (Release files are served from github.com and
// redirected to githubusercontent.com hosts.)
export function isGithubAddress(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname.endsWith(".githubusercontent.com"));
  } catch {
    return false;
  }
}

/** The .apk of a release, as {name, url, size, sha256, version}, or null if it has none the phone may use. The version
 * comes from the file name (SandveldVeeDienste-1.0.11-release.apk), else from the release tag. */
export function pickApk(release, anyAddress = false) {
  if (!release || release.draft || release.prerelease) return null;
  const asset = (release.assets || []).find((a) => /\.apk$/i.test(a.name || "") && a.state === "uploaded" && (anyAddress || isGithubAddress(a.browser_download_url)));
  if (!asset) return null;
  const fromName = /(\d+\.\d+\.\d+(?:\.\d+)?)/.exec(asset.name);
  const fromTag = /(\d+\.\d+\.\d+(?:\.\d+)?)/.exec(release.tag_name || "");
  const version = (fromName || fromTag || [])[1];
  if (!version) return null;
  const digest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || "");
  return { name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256: digest ? digest[1].toLowerCase() : null, version };
}

/** Asks GitHub and compares with the running version (`anyAddress`/`url` only ever used by a debug build's own test server). Never throws: {state: "available", update} | {state:
 * "up-to-date"} | {state: "error", message}. `fetchImpl` is injectable for tests and for the debug-only test server. */
export async function checkForAndroidUpdate(current, fetchImpl = globalThis.fetch, url = RELEASE_API, anyAddress = false) {
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) return { state: "error", message: `GitHub answered ${response.status}` };
    const update = pickApk(await response.json(), anyAddress);
    if (update && compareVersions(update.version, current) > 0) return { state: "available", update };
    return { state: "up-to-date" };
  } catch (error) {
    return { state: "error", message: "Couldn't reach GitHub to check for an update." };
  }
}

/** The automatic check runs at most every six hours (`lastChecked` is the saved time in ms, as text). */
export function shouldCheckNow(lastChecked, now = Date.now()) {
  const last = Number(lastChecked);
  return !Number.isFinite(last) || last <= 0 || now - last >= CHECK_EVERY_MS;
}
