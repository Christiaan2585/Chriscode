package com.sandveldveedienste.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.InputStream;
import java.net.ServerSocket;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** What lets the phone find the office PC again must only ever accept the PC itself: a device on the network
 * that merely answers on the port, or that has some other certificate, is not it. These tests stand up a small
 * TLS server with a throwaway certificate and check Discovery against it. */
public class DiscoveryTest {
    private SSLServerSocket server;
    private String fingerprint;
    private int port;
    private Thread acceptor;

    @Before
    public void startServer() throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("test-pc.p12")) {
            store.load(in, "changeit".toCharArray());
        }
        fingerprint = PinnedHttp.sha256Hex(((X509Certificate) store.getCertificate("pc")).getEncoded());
        KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, "changeit".toCharArray());
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(keys.getKeyManagers(), null, null);
        server = (SSLServerSocket) context.getServerSocketFactory().createServerSocket(0, 20, java.net.InetAddress.getByName("127.0.0.1"));
        port = server.getLocalPort();
        acceptor = new Thread(() -> {
            while (!server.isClosed()) {
                try (SSLSocket client = (SSLSocket) server.accept()) {
                    client.startHandshake();
                } catch (Exception ignored) {
                    // a client that rejected the certificate ends here
                }
            }
        });
        acceptor.setDaemon(true);
        acceptor.start();
    }

    @After
    public void stopServer() throws Exception {
        server.close();
    }

    @Test
    public void thePcWithThePinnedCertificateIsRecognised() {
        assertTrue(Discovery.answersAsThePc("127.0.0.1", port, fingerprint, 800));
    }

    @Test
    public void aDeviceWithAnyOtherCertificateIsNot() {
        String other = "00" + fingerprint.substring(2);
        assertFalse(Discovery.answersAsThePc("127.0.0.1", port, other, 800));
    }

    @Test
    public void nothingListeningIsNot() throws Exception {
        int free;
        try (ServerSocket probe = new ServerSocket(0)) {
            free = probe.getLocalPort();
        }
        assertFalse(Discovery.answersAsThePc("127.0.0.1", free, fingerprint, 400));
    }

    @Test
    public void aPlainNonTlsServiceOnThePortIsNot() throws Exception {
        try (ServerSocket plain = new ServerSocket(0)) {
            Thread quiet = new Thread(() -> {
                try { plain.accept(); Thread.sleep(3000); } catch (Exception ignored) { }
            });
            quiet.setDaemon(true);
            quiet.start();
            assertFalse(Discovery.answersAsThePc("127.0.0.1", plain.getLocalPort(), fingerprint, 400));
        }
    }

    @Test
    public void onlyPrivateRangesAreEverScanned() {
        assertTrue(Discovery.isPrivate("192.168.1.5"));
        assertTrue(Discovery.isPrivate("10.1.2.3"));
        assertTrue(Discovery.isPrivate("172.16.0.1"));
        assertTrue(Discovery.isPrivate("172.31.255.1"));
        assertFalse(Discovery.isPrivate("172.32.0.1"));
        assertFalse(Discovery.isPrivate("100.64.0.1"));   // Tailscale: not scanned
        assertFalse(Discovery.isPrivate("8.8.8.8"));
        assertFalse(Discovery.isPrivate("office-pc.local"));
        assertFalse(Discovery.isPrivate("169.254.1.1"));
    }

    @Test
    public void aSubnetScanStaysInsideTheSameBlockOf254() {
        List<String> found = Discovery.subnetCandidates(Arrays.asList("192.168.1.55"), new HashSet<>(Arrays.asList("192.168.1.20", "192.168.1.55")));
        assertEquals(252, found.size());
        assertFalse(found.contains("192.168.1.20"));
        assertFalse(found.contains("192.168.1.55"));
        assertTrue(found.contains("192.168.1.1"));
        assertTrue(found.contains("192.168.1.254"));
        for (String ip : found) assertTrue(ip, ip.startsWith("192.168.1."));
        assertEquals(found.size(), new HashSet<>(found).size());
    }

    @Test
    public void severalNetworksAreCombinedAndPublicOrNamedOnesAreIgnored() {
        List<String> found = Discovery.subnetCandidates(Arrays.asList("192.168.1.55", "10.0.0.9", "100.88.1.2", "office-pc.local", "8.8.8.8"), new HashSet<String>());
        assertEquals(254 * 2, found.size());
        List<String> bad = new ArrayList<>();
        for (String ip : found) if (!ip.startsWith("192.168.1.") && !ip.startsWith("10.0.0.")) bad.add(ip);
        assertTrue(bad.toString(), bad.isEmpty());
    }
}
