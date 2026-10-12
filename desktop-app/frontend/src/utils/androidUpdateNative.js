// The native half of the Android self-update (AppUpdatePlugin.java): download, verify and hand over to Android's installer.
import { registerPlugin } from "@capacitor/core";

const AppUpdate = registerPlugin("AppUpdate");

export const appInfo = () => AppUpdate.getInfo(); // {versionName, versionCode, debuggable, canInstall, downloaded}
export const downloadUpdate = (update) => AppUpdate.download({ url: update.url, sha256: update.sha256 });
export const installUpdate = () => AppUpdate.install(); // {started} or {needsPermission}
export const discardUpdate = () => AppUpdate.discard();
export const onDownloadProgress = (callback) => AppUpdate.addListener("progress", callback); // returns a handle with remove()
