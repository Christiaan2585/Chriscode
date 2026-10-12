package com.sandveldveedienste.app;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** The phone's self-update: downloads the new .apk from GitHub Releases and hands it to Android's installer.
 *
 * Nothing here can install anything by itself - Android shows its own "Update this app?" screen and the person taps
 * Install. Before that, the file is checked: it must come from a GitHub address over https (debug builds only may use
 * another address, for testing), match the SHA-256 GitHub published for it, be this same app (package name), be a newer
 * version, and be signed with the SAME key as the installed app. Android enforces the key rule again when it installs. */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String FILE_NAME = "update.apk";
    private static final long MAX_BYTES = 200L * 1024 * 1024;
    private final java.util.concurrent.ExecutorService worker = java.util.concurrent.Executors.newSingleThreadExecutor();

    private boolean debuggable() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private File updateFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, FILE_NAME);
    }

    private boolean addressAllowed(URL url) {
        String host = url.getHost().toLowerCase(Locale.ROOT);
        boolean github = "https".equals(url.getProtocol()) && (host.equals("github.com") || host.endsWith(".githubusercontent.com"));
        return github || debuggable();
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("versionName", info.versionName);
            ret.put("versionCode", versionCode(info));
            ret.put("debuggable", debuggable());
            ret.put("canInstall", canInstall());
            ret.put("downloaded", updateFile().isFile());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read this app's version");
        }
    }

    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** download({url, sha256?}) -> {versionName, versionCode}. Sends "progress" events {received, total}. */
    @PluginMethod
    public void download(PluginCall call) {
        final String address = call.getString("url");
        final String sha256 = call.getString("sha256");
        if (address == null) {
            call.reject("url is required");
            return;
        }
        worker.execute(() -> {
            File target = updateFile();
            try {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
                fetch(address, target);
                if (sha256 != null && !sha256.equalsIgnoreCase(hex(digestOf(target)))) {
                    throw new IllegalStateException("The downloaded file doesn't match the checksum GitHub published for it.");
                }
                JSObject ret = verify(target);
                call.resolve(ret);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
                call.reject(e.getMessage() == null ? "The update could not be downloaded." : e.getMessage());
            }
        });
    }

    private void fetch(String address, File target) throws Exception {
        URL url = new URL(address);
        HttpURLConnection connection = null;
        for (int hop = 0; hop < 6; hop++) {
            if (!addressAllowed(url)) throw new IllegalStateException("That update isn't from GitHub, so it was not downloaded.");
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false); // every hop is checked above
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = connection.getHeaderField("Location");
                connection.disconnect();
                if (next == null) throw new IllegalStateException("GitHub sent the update to nowhere.");
                url = new URL(url, next);
                connection = null;
                continue;
            }
            if (code != 200) throw new IllegalStateException("GitHub answered " + code + " for the update file.");
            break;
        }
        if (connection == null) throw new IllegalStateException("Too many redirects fetching the update.");
        long total = connection.getContentLengthLong();
        if (total > MAX_BYTES) throw new IllegalStateException("The update file is unexpectedly large.");
        long received = 0;
        long lastReported = 0;
        try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
                received += n;
                if (received > MAX_BYTES) throw new IllegalStateException("The update file is unexpectedly large.");
                if (received - lastReported > 256 * 1024) {
                    lastReported = received;
                    JSObject progress = new JSObject();
                    progress.put("received", received);
                    progress.put("total", total);
                    notifyListeners("progress", progress);
                }
            }
        } finally {
            connection.disconnect();
        }
    }

    private static byte[] digestOf(File file) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) sha.update(buffer, 0, n);
        }
        return sha.digest();
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    /** The downloaded file must be THIS app, newer, and signed with the installed app's own key. */
    private JSObject verify(File file) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        String own = getContext().getPackageName();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo downloaded = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (downloaded == null) throw new IllegalStateException("The downloaded file isn't a readable Android app.");
        if (!own.equals(downloaded.packageName)) throw new IllegalStateException("The downloaded file is a different app.");
        PackageInfo installed = pm.getPackageInfo(own, flags);
        if (versionCode(downloaded) <= versionCode(installed)) throw new IllegalStateException("The downloaded file is not newer than this app.");
        if (!signers(installed).equals(signers(downloaded))) throw new IllegalStateException("The downloaded file is not signed by the same publisher as this app, so it was not installed.");
        JSObject ret = new JSObject();
        ret.put("versionName", downloaded.versionName);
        ret.put("versionCode", versionCode(downloaded));
        return ret;
    }

    private static Set<String> signers(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            signatures = info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        Set<String> out = new HashSet<>();
        if (signatures != null) {
            for (Signature s : signatures) out.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));
        }
        if (out.isEmpty()) throw new IllegalStateException("Couldn't read who signed the app.");
        return out;
    }

    /** install() opens Android's installer for the downloaded file, or - the first time - the screen where this app is
     * allowed to install updates ({needsPermission: true}; come back and call install() again). */
    @PluginMethod
    public void install(PluginCall call) {
        File file = updateFile();
        if (!file.isFile()) {
            call.reject("There is no downloaded update to install.");
            return;
        }
        try {
            if (!canInstall()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                JSObject ret = new JSObject();
                ret.put("needsPermission", true);
                call.resolve(ret);
                return;
            }
            verify(file); // again, right before handing it over
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Could not start the installer." : e.getMessage());
        }
    }

    /** Removes the downloaded file (after an update, or when the person gives up). */
    @PluginMethod
    public void discard(PluginCall call) {
        //noinspection ResultOfMethodCallIgnored
        updateFile().delete();
        call.resolve();
    }
}
