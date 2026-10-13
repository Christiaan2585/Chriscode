package com.sandveldveedienste.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.cert.X509Certificate;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** The relay handshake and what rides on it. A small fake relay (and, behind it, a fake office PC with a throwaway
 * certificate) stands in for the real ones. */
public class RelayTunnelTest {
    private static final String OFFICE = "a".repeat(32);
    private static final String KEY = "b".repeat(64);

    private ServerSocket relay;
    private volatile String lineReceived;
    private volatile String reply = "READY";
    private volatile boolean letPcAnswer = false;
    private SSLContext pcContext;
    private String fingerprint;
    private Thread acceptor;

    @Before
    public void startFakeRelay() throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("test-pc.p12")) {
            store.load(in, "changeit".toCharArray());
        }
        fingerprint = PinnedHttp.sha256Hex(((X509Certificate) store.getCertificate("pc")).getEncoded());
        KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, "changeit".toCharArray());
        pcContext = SSLContext.getInstance("TLS");
        pcContext.init(keys.getKeyManagers(), null, null);

        relay = new ServerSocket(0, 10, java.net.InetAddress.getByName("127.0.0.1"));
        acceptor = new Thread(() -> {
            while (!relay.isClosed()) {
                try {
                    Socket client = relay.accept();
                    new Thread(() -> serve(client)).start();
                } catch (IOException ignored) {
                    return;
                }
            }
        });
        acceptor.setDaemon(true);
        acceptor.start();
    }

    @After
    public void stopFakeRelay() throws Exception {
        relay.close();
    }

    private void serve(Socket client) {
        try (Socket s = client) {
            StringBuilder line = new StringBuilder();
            int b;
            while ((b = s.getInputStream().read()) >= 0 && b != '\n') line.append((char) b);
            lineReceived = line.toString();
            s.getOutputStream().write((reply + "\n").getBytes(StandardCharsets.US_ASCII));
            s.getOutputStream().flush();
            if (letPcAnswer && reply.equals("READY")) { // from here on the fake relay IS the office PC: TLS, then ping -> pong
                SSLSocket tls = (SSLSocket) pcContext.getSocketFactory().createSocket(s, null, s.getPort(), true);
                tls.setUseClientMode(false);
                tls.startHandshake();
                byte[] ping = new byte[4];
                int got = 0;
                while (got < 4) {
                    int n = tls.getInputStream().read(ping, got, 4 - got);
                    if (n < 0) return;
                    got += n;
                }
                tls.getOutputStream().write("pong".getBytes(StandardCharsets.US_ASCII));
                tls.getOutputStream().flush();
                Thread.sleep(200);
            }
        } catch (Exception ignored) {
            // a client that rejected the certificate ends here
        }
    }

    private int port() { return relay.getLocalPort(); }

    @Test
    public void theHandshakeSendsTheOfficeAndKeyAndGetsTheSocketBackOnReady() throws Exception {
        try (Socket plain = new Socket("127.0.0.1", port())) {
            Socket carried = RelayTunnel.handshake(plain, "127.0.0.1", port(), OFFICE, KEY);
            assertNotNull(carried);
            assertEquals("PHONE " + OFFICE + " " + KEY, lineReceived);
        }
    }

    @Test
    public void everyRefusalIsSaidInPlainWords() throws Exception {
        String[][] cases = {{"OFFLINE", "not connected"}, {"TIMEOUT", "did not answer"}, {"BUSY", "busy"}};
        for (String[] c : cases) {
            reply = c[0];
            try (Socket plain = new Socket("127.0.0.1", port())) {
                RelayTunnel.handshake(plain, "127.0.0.1", port(), OFFICE, KEY);
                fail("should have been refused: " + c[0]);
            } catch (RelayTunnel.RelayException e) {
                assertTrue(e.getMessage(), e.getMessage().contains(c[1]));
            }
        }
    }

    @Test
    public void somethingThatIsNotARelayIsNotTrusted() throws Exception {
        reply = "HTTP/1.1 400 Bad Request";
        try (Socket plain = new Socket("127.0.0.1", port())) {
            RelayTunnel.handshake(plain, "127.0.0.1", port(), OFFICE, KEY);
            fail("should not accept a stranger's answer");
        } catch (IOException e) {
            assertFalse(e instanceof RelayTunnel.RelayException);
        }
    }

    @Test
    public void thePhoneStillChecksThePcCertificateThroughTheRelay() throws Exception {
        letPcAnswer = true;
        // right fingerprint: TLS to the "PC" works and bytes flow
        try (Socket plain = new Socket("127.0.0.1", port())) {
            SSLSocketFactory factory = new RelayTunnel.RelaySocketFactory(PinnedHttp.pinnedFactory(fingerprint), OFFICE, KEY);
            try (SSLSocket tls = (SSLSocket) factory.createSocket(plain, "127.0.0.1", port(), true)) {
                tls.setSoTimeout(5000);
                OutputStream out = tls.getOutputStream();
                out.write("ping".getBytes(StandardCharsets.US_ASCII));
                out.flush();
                byte[] pong = new byte[4];
                int got = 0;
                while (got < 4) got += tls.getInputStream().read(pong, got, 4 - got);
                assertEquals("pong", new String(pong, StandardCharsets.US_ASCII));
            }
        }
        // wrong fingerprint: whoever is on the other end is not the paired PC, so it is refused
        try (Socket plain = new Socket("127.0.0.1", port())) {
            SSLSocketFactory factory = new RelayTunnel.RelaySocketFactory(PinnedHttp.pinnedFactory("00" + fingerprint.substring(2)), OFFICE, KEY);
            ((SSLSocket) factory.createSocket(plain, "127.0.0.1", port(), true)).startHandshake();
            fail("a different certificate must be refused");
        } catch (IOException expected) {
            // refused, as it should be
        }
    }

    @Test
    public void theConnectionCheckReportsEachProblemInWords() throws Exception {
        letPcAnswer = true;
        assertNull(RelayTunnel.check("127.0.0.1", port(), OFFICE, KEY, fingerprint));
        assertTrue(RelayTunnel.check("127.0.0.1", port(), OFFICE, KEY, "00" + fingerprint.substring(2)).contains("not the office PC"));
        reply = "OFFLINE";
        assertTrue(RelayTunnel.check("127.0.0.1", port(), OFFICE, KEY, fingerprint).contains("not connected"));
        int dead;
        try (ServerSocket probe = new ServerSocket(0)) { dead = probe.getLocalPort(); }
        assertTrue(RelayTunnel.check("127.0.0.1", dead, OFFICE, KEY, fingerprint).contains("cannot be reached"));
    }

    @Test
    public void onlyWellFormedRelayDetailsAreKept() {
        assertTrue(RelayTunnel.isAcceptableRelay("relay.example.com", 8447, OFFICE, KEY));
        assertTrue(RelayTunnel.isAcceptableRelay("192.168.1.9", 8447, OFFICE, KEY));
        assertFalse(RelayTunnel.isAcceptableRelay("bad host", 8447, OFFICE, KEY));
        assertFalse(RelayTunnel.isAcceptableRelay("http://relay.example.com", 8447, OFFICE, KEY));
        assertFalse(RelayTunnel.isAcceptableRelay("a@b.com", 8447, OFFICE, KEY));
        assertFalse(RelayTunnel.isAcceptableRelay("relay.example.com", 0, OFFICE, KEY));
        assertFalse(RelayTunnel.isAcceptableRelay("relay.example.com", 70000, OFFICE, KEY));
        assertFalse(RelayTunnel.isAcceptableRelay("relay.example.com", 8447, "short", KEY));
        assertFalse(RelayTunnel.isAcceptableRelay("relay.example.com", 8447, OFFICE, "Z".repeat(64)));
        assertFalse(RelayTunnel.isAcceptableRelay(null, 8447, OFFICE, KEY));
    }

    @Test
    public void theRelayHopIsEncryptedExceptOnThisPhonesOwnSide() {
        assertTrue(RelayTunnel.needsTls("relay.example.com"));
        assertTrue(RelayTunnel.needsTls("8.8.8.8"));
        assertFalse(RelayTunnel.needsTls("127.0.0.1"));
        assertFalse(RelayTunnel.needsTls("192.168.1.9"));
        assertFalse(RelayTunnel.needsTls("localhost"));
    }
}
