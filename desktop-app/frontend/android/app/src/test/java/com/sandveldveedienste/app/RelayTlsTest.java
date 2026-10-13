package com.sandveldveedienste.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.io.InputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManagerFactory;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** The hop from the phone to a real relay is encrypted and the relay's certificate must be for the relay's name:
 * the PHONE line carries the key that lets someone in, so it must never travel in the clear or to an impostor. */
public class RelayTlsTest {
    private static final String OFFICE = "a".repeat(32);
    private static final String KEY = "b".repeat(64);

    private SSLServerSocket relay;
    private volatile String lineReceived;
    private SSLContext trustingTheRelay;

    @Before
    public void startTlsRelay() throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("test-relay.p12")) {
            store.load(in, "changeit".toCharArray());
        }
        KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, "changeit".toCharArray());
        SSLContext server = SSLContext.getInstance("TLS");
        server.init(keys.getKeyManagers(), null, null);
        relay = (SSLServerSocket) server.getServerSocketFactory().createServerSocket(0, 10, java.net.InetAddress.getByName("127.0.0.1"));

        TrustManagerFactory trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trust.init(store); // this phone, for the test, trusts exactly this relay certificate
        trustingTheRelay = SSLContext.getInstance("TLS");
        trustingTheRelay.init(null, trust.getTrustManagers(), null);

        Thread acceptor = new Thread(() -> {
            while (!relay.isClosed()) {
                try (SSLSocket client = (SSLSocket) relay.accept()) {
                    client.startHandshake();
                    StringBuilder line = new StringBuilder();
                    int b;
                    while ((b = client.getInputStream().read()) >= 0 && b != '\n') line.append((char) b);
                    lineReceived = line.toString();
                    client.getOutputStream().write("READY\n".getBytes(StandardCharsets.US_ASCII));
                    client.getOutputStream().flush();
                    Thread.sleep(100);
                } catch (Exception ignored) {
                    // a phone that rejected the certificate ends here
                }
            }
        });
        acceptor.setDaemon(true);
        acceptor.start();
    }

    @After
    public void stop() throws Exception {
        RelayTunnel.outerTlsFactory = null;
        relay.close();
    }

    @Test
    public void aRelayWithTheRightCertificateGetsTheKeyOverTls() throws Exception {
        RelayTunnel.outerTlsFactory = trustingTheRelay.getSocketFactory();
        try (Socket plain = new Socket("127.0.0.1", relay.getLocalPort())) {
            Socket carried = RelayTunnel.handshake(plain, "relay.test", relay.getLocalPort(), OFFICE, KEY);
            assertNotNull(carried);
            assertTrue("the hop to the relay must be TLS", carried instanceof SSLSocket);
            assertEquals("PHONE " + OFFICE + " " + KEY, lineReceived);
        }
    }

    @Test
    public void aCertificateForAnotherNameIsRefusedAndTheKeyIsNeverSent() throws Exception {
        RelayTunnel.outerTlsFactory = trustingTheRelay.getSocketFactory();
        try (Socket plain = new Socket("127.0.0.1", relay.getLocalPort())) {
            RelayTunnel.handshake(plain, "someone-else.example.com", relay.getLocalPort(), OFFICE, KEY);
            fail("a relay whose certificate is not for the name must be refused");
        } catch (IOException expected) {
            assertTrue(expected.getMessage(), expected.getMessage() != null);
        }
        Thread.sleep(200);
        assertEquals(null, lineReceived);
    }

    @Test
    public void aCertificateThePhoneDoesNotTrustIsRefusedToo() throws Exception {
        RelayTunnel.outerTlsFactory = null; // the phone's normal trust store knows nothing about this throwaway certificate
        try (Socket plain = new Socket("127.0.0.1", relay.getLocalPort())) {
            RelayTunnel.handshake(plain, "relay.test", relay.getLocalPort(), OFFICE, KEY);
            fail("an untrusted certificate must be refused");
        } catch (IOException expected) {
            // refused, as it should be
        }
        Thread.sleep(200);
        assertEquals(null, lineReceived);
    }
}
