package com.braingames.arcade;

import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.json.JSONObject;

/**
 * Finds a Brain Arcade server running on a computer on the same WiFi
 * (local-server/brain_arcade_server.py or the .exe), so the tablet can fall back
 * to it when the Render server is offline — without anyone typing an IP address.
 *
 * 1. Shout on the network: a UDP broadcast to port 41234. The local server answers
 *    with its HTTP port, and the reply's source address is the computer's IP.
 * 2. If nothing answers (some routers drop broadcasts), knock on port 8787 of every
 *    address in this device's /24 and keep the first one whose /api/ping says it is
 *    a Brain Arcade server.
 *
 * Runs on its own thread; the web layer asks for the result on its next poll.
 */
final class LanDiscovery {
    static final int UDP_PORT = 41234;
    static final int HTTP_PORT = 8787;
    private static final byte[] PROBE = "BRAIN_ARCADE_DISCOVER".getBytes(StandardCharsets.UTF_8);

    private static volatile String found = "";
    private static volatile boolean running = false;
    /** Human-readable account of the last search, shown in Settings to help fix problems. */
    private static volatile String report = "Not searched yet";

    private LanDiscovery() {}

    static String result() { return found; }
    static boolean busy() { return running; }
    static String lastReport() { return report; }

    static void start() { start(true); }

    /** full = also scan the /24 if nobody answers the broadcast; quick = broadcast only. */
    static synchronized void start(final boolean full) {
        if (running) return;
        running = true;
        report = "Searching\u2026";
        Thread t = new Thread(new Runnable() {
            public void run() {
                StringBuilder r = new StringBuilder();
                try {
                    List<Inet4Address> own = ownAddresses();
                    if (!own.isEmpty()) r.append("Tablet is ").append(own.get(0).getHostAddress()).append(". ");
                    String url = byBroadcast();
                    if (url != null) r.append("Server answered the WiFi broadcast.");
                    else {
                        r.append("No answer to the WiFi broadcast");
                        if (full) {
                            url = byScan();
                            r.append(url != null ? "; found it by scanning the network." : "; scanned the network on port " + HTTP_PORT + " and found nothing.");
                        } else r.append(".");
                    }
                    // A quick search that finds nothing keeps the last good answer: a
                    // dropped broadcast should not throw away a working server.
                    if (url == null && own.isEmpty()) r.append(" This tablet does not seem to be on a home WiFi network.");
                    if (url != null) found = url;
                    else if (full) found = "";
                } catch (Throwable e) {
                    r.append("Search failed: ").append(e.getClass().getSimpleName());
                    if (full) found = "";
                } finally {
                    report = r.toString();
                    running = false;
                }
            }
        }, "lan-discovery");
        t.setDaemon(true);
        t.start();
    }

    /** Is there a Brain Arcade server at this base URL? */
    static boolean ping(String base) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + "/api/ping").openConnection();
            c.setConnectTimeout(450);
            c.setReadTimeout(900);
            c.setUseCaches(false);
            if (c.getResponseCode() != 200) return false;
            InputStream in = c.getInputStream();
            byte[] buf = new byte[512];
            int n = in.read(buf);
            in.close();
            return n > 0 && new String(buf, 0, n, StandardCharsets.UTF_8).contains("brainArcade");
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static List<Inet4Address> ownAddresses() {
        List<Inet4Address> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add((Inet4Address) a);
                }
            }
        } catch (Exception ignored) {}
        return out;
    }

    private static String byBroadcast() {
        DatagramSocket s = null;
        try {
            s = new DatagramSocket();
            s.setBroadcast(true);
            s.setSoTimeout(300);
            Set<InetAddress> targets = new LinkedHashSet<>();
            targets.add(InetAddress.getByName("255.255.255.255"));
            try {
                for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                    if (!ni.isUp() || ni.isLoopback()) continue;
                    for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                        if (ia.getBroadcast() != null) targets.add(ia.getBroadcast());
                    }
                }
            } catch (Exception ignored) {}
            long deadline = System.currentTimeMillis() + 1600;
            int round = 0;
            byte[] buf = new byte[1024];
            while (System.currentTimeMillis() < deadline) {
                if (round++ < 3) {
                    for (InetAddress t : targets) {
                        try { s.send(new DatagramPacket(PROBE, PROBE.length, t, UDP_PORT)); } catch (Exception ignored) {}
                    }
                }
                try {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    s.receive(p);
                    String text = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                    JSONObject j = new JSONObject(text);
                    if (!j.optBoolean("brainArcade")) continue;
                    String base = "http://" + p.getAddress().getHostAddress() + ":" + j.optInt("port", HTTP_PORT);
                    if (ping(base)) return base;
                } catch (SocketTimeoutException again) {
                    // nobody yet — send another round
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {
        } finally {
            if (s != null) s.close();
        }
        return null;
    }

    private static String byScan() {
        final AtomicReference<String> hit = new AtomicReference<>(null);
        Set<String> seen = new LinkedHashSet<>();
        for (Inet4Address own : ownAddresses()) {
            byte[] b = own.getAddress();
            String prefix = (b[0] & 255) + "." + (b[1] & 255) + "." + (b[2] & 255) + ".";
            if (seen.add(prefix)) {
                ExecutorService pool = Executors.newFixedThreadPool(48);
                for (int i = 1; i < 255; i++) {
                    final String base = "http://" + prefix + i + ":" + HTTP_PORT;
                    pool.execute(new Runnable() {
                        public void run() {
                            if (hit.get() == null && ping(base)) hit.compareAndSet(null, base);
                        }
                    });
                }
                pool.shutdown();
                try {
                    long until = System.currentTimeMillis() + 9000;
                    while (hit.get() == null && System.currentTimeMillis() < until
                            && !pool.awaitTermination(100, TimeUnit.MILLISECONDS)) { /* wait */ }
                } catch (InterruptedException ignored) {}
                pool.shutdownNow();
                if (hit.get() != null) return hit.get();
            }
        }
        return hit.get();
    }
}
