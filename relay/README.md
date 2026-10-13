# Connection relay

Lets a phone reach an office PC that it cannot reach directly - another Wi-Fi point, mobile data, another town -
without anybody installing or signing in to anything. The customer only switches **Settings -> Phones -> Connect from
anywhere** on.

## How it works

```
 phone ──(1) outbound──►  RELAY  ◄──(2) outbound── office PC
                            │
        (3) relay tells the PC "a phone is waiting"; the PC opens a second outbound connection for that phone
        (4) relay joins the two; what flows is TLS between the phone and the PC
```

* The PC keeps **one outbound connection** open to the relay, so no router settings or open ports are needed.
* What passes through the relay is **TLS between the phone and the PC**; the phone checks the PC's certificate
  fingerprint (pinned at pairing). The relay can neither read nor change it, and keeps no data.
* A phone needs the office id **and** a 256-bit key (given to it at pairing, only a hash is registered with the relay).
  The first PC to register an office id owns it with its own secret. Wrong key and unknown office look the same.
* The hop phone <-> relay and PC <-> relay is also TLS (certificate checked) unless the relay is on a private address
  (testing), so the key never travels in the clear.
* Protections: handshake time limit, 256-byte handshake line, failed-handshake rate limit per address, limits on
  waiting/active tunnels per office and overall, idle tunnels closed after 15 minutes, silent PCs dropped.

Protocol (one text line, then raw bytes) is documented at the top of `relay/server.py`.

## Run it

Needs only Python 3.10+ (standard library, nothing to install):

```bash
python -m relay.server --port 8447 --state /var/lib/sandveld-relay/state.json \
   --cert /etc/letsencrypt/live/relay.example.com/fullchain.pem --key /etc/letsencrypt/live/relay.example.com/privkey.pem
```

* Without `--cert/--key` it speaks plain TCP: **use that only on a private network or behind something that adds TLS.**
* Get a certificate for the relay's name (for example with `certbot certonly --standalone -d relay.example.com`) and
  renew it before it expires (certbot does this; restart the relay after a renewal).
* Open the port (default **8447**; any port works, 443 is the least likely to be blocked on a customer's network - run
  with `--port 443`, which may need root or `setcap cap_net_bind_service`).
* It is small: a thousand concurrent phones is a few megabytes of memory. A cheap VPS is enough.

### Docker

```bash
docker build -t sandveld-relay -f relay/Dockerfile .
docker run -d --restart unless-stopped -p 8447:8447 -v /etc/letsencrypt:/certs:ro sandveld-relay \
   --cert /certs/live/relay.example.com/fullchain.pem --key /certs/live/relay.example.com/privkey.pem
```

### systemd

```ini
[Unit]
Description=Sandveld relay
After=network.target

[Service]
User=relay
WorkingDirectory=/opt/sandveld
ExecStart=/usr/bin/python3 -m relay.server --port 8447 --cert /etc/ssl/relay/fullchain.pem --key /etc/ssl/relay/privkey.pem
Restart=always

[Install]
WantedBy=multi-user.target
```

## Pointing the app at it

* **For all customers:** put the address in `desktop-app/frontend/src/config/relay.js`
  (`DEFAULT_RELAY_ADDRESS = "relay.example.com"`), rebuild, and customers only flip the switch.
* **For one customer:** an administrator types the address under Settings -> Phones -> Connect from anywhere.

## Good to know

* `--state` keeps (only) a hash of each PC's secret on disk, so after a restart nobody who learnt an office id can take
  the office over; without it a restart forgets who owns what. Offices unused for 30 days are forgotten, and one
  address can create only 10 new offices an hour.
* If the relay restarts, PCs reconnect by themselves within a few seconds (they back off up to 30 s);
  phones in the middle of a request see an error and the next call works.
* Who the relay sees: network addresses and connection times of PCs and phones, never what they say.
* A phone that was removed or lost still holds the relay key. Removing it on the PC already stops it using the PC
  (it has no device token any more); "Make a new key for phones" under the same settings also stops it using the relay.
* Run it where you would run any small public service: keep the OS updated and use the host's firewall.
* Tests: `venv\Scripts\python.exe -m unittest tests.test_relay tests.test_relay_agent tests.test_relay_settings`.
