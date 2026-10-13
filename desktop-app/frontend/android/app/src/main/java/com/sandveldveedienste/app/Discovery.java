package com.sandveldveedienste.app;

import android.content.Context;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLSocket;

/** Finds the office PC again when none of the addresses this phone remembers answers - the usual cause is that the
 * PC was given a new address by the router. It looks at the other devices on the phone's own network (the same
 * /24 as the phone, and as each remembered address) for one that answers on the PC port with a certificate whose
 * SHA-256 fingerprint is the pinned one. Nothing is sent to a device until its certificate matches, so only the
 * paired PC can ever be "found". Never goes outside private ranges and never further than a /24. */
final class Discovery {
    private static final long MIN_GAP_MS = 30_000; // a scan is only tried this often on its own
    private static final int THREADS = 64;
    private static final int TCP_TIMEOUT_MS = 1200; // an idle Wi-Fi link can need a second to answer the first packet
    private static final int TLS_TIMEOUT_MS = 1500;
    private static final long BUDGET_MS = 10000;
    private static volatile long lastScan = 0;

    private Discovery() {}

    static boolean isPrivate(String ip) {
        String[] p = ip.split("\\.");
        if (p.length != 4) return false;
        try {
            int a = Integer.parseInt(p[0]);
            int b = Integer.parseInt(p[1]);
            return a == 10 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** This phone's own private IPv4 addresses (its Wi-Fi address, normally one). */
    static List<String> phoneAddresses() {
        List<String> found = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> all = NetworkInterface.getNetworkInterfaces();
            while (all != null && all.hasMoreElements()) {
                NetworkInterface nif = all.nextElement();
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InetAddress address : Collections.list(nif.getInetAddresses())) {
                    if (address instanceof Inet4Address && isPrivate(address.getHostAddress())) found.add(address.getHostAddress());
                }
            }
        } catch (Exception ignored) {
            // no network information: nothing to scan
        }
        return found;
    }

    /** Every address of the /24 of each private address given, except the ones in `skip`. */
    static List<String> subnetCandidates(List<String> bases, Set<String> skip) {
        Set<String> out = new LinkedHashSet<>();
        for (String base : bases) {
            if (!isPrivate(base)) continue;
            String prefix = base.substring(0, base.lastIndexOf('.') + 1);
            for (int i = 1; i <= 254; i++) {
                String candidate = prefix + i;
                if (!skip.contains(candidate)) out.add(candidate);
            }
        }
        return new ArrayList<>(out);
    }

    /** True when something at ip:port answers a TLS handshake with the pinned certificate. */
    static boolean answersAsThePc(String ip, int port, String fingerprint, int tcpTimeoutMs) {
        try (Socket plain = new Socket()) {
            plain.connect(new InetSocketAddress(ip, port), tcpTimeoutMs);
            plain.setSoTimeout(TLS_TIMEOUT_MS);
            try (SSLSocket tls = (SSLSocket) PinnedHttp.pinnedFactory(fingerprint).createSocket(plain, ip, port, true)) {
                tls.setSoTimeout(TLS_TIMEOUT_MS);
                tls.startHandshake(); // throws unless the certificate's fingerprint is the pinned one
                return true;
            }
        } catch (Exception e) {
            return false;
        }
    }

    /** The first candidate that is the PC, or null. `force` ignores the minimum gap between scans. */
    static String find(Context ctx, List<String> known, boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastScan < MIN_GAP_MS) return null;
        lastScan = now;
        final int port = PairingStore.getPort(ctx);
        final String fingerprint = PairingStore.getFingerprint(ctx);
        if (port <= 0 || fingerprint == null) return null;

        List<String> candidates = debugCandidates(ctx);
        if (candidates == null) {
            List<String> bases = new ArrayList<>(phoneAddresses());
            bases.addAll(known);
            Set<String> skip = new LinkedHashSet<>(known);
            skip.addAll(phoneAddresses());
            candidates = subnetCandidates(bases, skip);
        }
        if (candidates.isEmpty()) return null;

        ExecutorService pool = Executors.newFixedThreadPool(Math.min(THREADS, candidates.size()));
        ExecutorCompletionService<String> done = new ExecutorCompletionService<>(pool);
        final int tcpTimeout = TCP_TIMEOUT_MS;
        for (final String candidate : candidates) {
            done.submit(() -> answersAsThePc(candidate, port, fingerprint, tcpTimeout) ? candidate : null);
        }
        String found = null;
        long deadline = System.currentTimeMillis() + BUDGET_MS;
        try {
            for (int i = 0; i < candidates.size() && found == null; i++) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) break;
                Future<String> next = done.poll(left, TimeUnit.MILLISECONDS);
                if (next == null) break;
                try {
                    found = next.get();
                } catch (Exception ignored) {
                    // that candidate failed; the others carry on
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            pool.shutdownNow();
        }
        if (found != null) PairingStore.promote(ctx, found);
        return found;
    }

    /** True in a debuggable (test) build, never in the signed release app. */
    static boolean debuggable(Context ctx) {
        return (ctx.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /** Debug builds only: a comma-separated list of addresses to try instead of the real subnet (for testing on a
     * phone that cannot reach the PC over Wi-Fi). Release builds ignore it. */
    private static List<String> debugCandidates(Context ctx) {
        if (!debuggable(ctx)) return null;
        String list = ctx.getSharedPreferences("sandveld_debug", Context.MODE_PRIVATE).getString("scan_candidates", null);
        if (list == null || list.trim().isEmpty()) return null;
        List<String> out = new ArrayList<>();
        for (String item : list.split(",")) if (!item.trim().isEmpty()) out.add(item.trim());
        return out;
    }
}
