# Lyra Connect audit (roadmap item 6)

Scope: host (`src/main/connect`), pure core (`src/core/connect`), Devices panel, viewer page, overlay page, Android TV
client. Method: read the code and tests, threat-model it, fix what is cheap and safe, list what is not.
The protocol and the first hardening pass are described in `connect-protocol.md` and `connect-redesign.md`; this file
only records what this review found and did.

## Verdict

The foundation is sound (LAN-only bind, per-device tokens, HMAC handshake, signed commands, Host and Origin checks, no
data before pairing, encrypted tokens at rest, off by default). The gaps were mostly **operational**: the host did not
notice network changes, nothing told the user why a phone could not connect, there was no way to rename, wipe or time
out access, and the viewer page had one real bug.

## Findings

| # | Area | Finding | Severity | Status |
| - | --- | --- | --- | --- |
| 1 | Viewer | After a wrong, expired or rate-limited code the page kept `pendingPair`, so its reconnect loop re-sent the same bad code forever. That burns the host's failure budget (which locks pairing for everybody) and floods the host. | High (self-inflicted lockout) | Fixed |
| 2 | Security | The wrong-code budget was global: any one device on the Wi-Fi could send 5 bad codes and kill the live code, or 10 a minute and block pairing for everyone (cheap denial of service). | Medium | Fixed: per-peer lockout (4 misses, 5 min), the per-code budget is 8, the global limit is a backstop |
| 3 | Security | The 40-session cap had no per-address limit: one peer could fill it and lock every real device out. | Medium | Fixed (6 sockets per address) |
| 4 | Security | HTTP server used Node defaults for header and request timeouts (slow-loris could hold sockets). | Low | Fixed (tight timeouts) |
| 5 | Security | `ping` was answered without any rate limit once authenticated (CPU and bandwidth amplification by a paired device). | Low | Fixed (token bucket) |
| 6 | Reliability | The host stayed bound to the old IP after the PC changed network (laptop moved, VPN, Wi-Fi roam). The QR and the URL then pointed at a dead address, and mDNS advertised it. | High | Fixed: the host watches the LAN address, re-binds, re-advertises and drops stale pairing codes |
| 7 | Security | On public Wi-Fi (cafe, hotel, campus) the host would simply start serving on whatever private address it finds. Nothing is exposed without a code, but the pages and the pairing door are reachable by strangers, and a sniffed token lets them watch. | Medium | Mitigated: codes are dropped on a network change, the panel names the network and warns, optional auto-stop. Cannot be fully fixed without TLS (see below) |
| 8 | Reliability | Neither the web viewer nor the Android client noticed a silently dead connection (host asleep, Wi-Fi gone) until the OS timed out the TCP socket. | Medium | Fixed (no message for 25 s: reconnect) |
| 9 | UX | No way to know why a phone cannot connect (Windows Firewall is the usual cause) and no test. | High for a product | Added: "Check this setup", firewall help |
| 10 | UX | Devices could not be renamed, no "remove all", no last-seen, no idle auto-stop, nothing in the tray. | Medium | Added |
| 11 | A11y | Pairing input had no label, status chip not announced, no reduced-motion handling in the viewer. | Medium | Fixed |
| 12 | Security | Token crosses the LAN once in clear text at pairing, and server messages are not encrypted. | Known | Not fixed: needs TLS with a pinned fingerprint (plan in the protocol doc). Documented honestly in the panel and PRIVACY.md |
| 13 | Security | A paired controller can skip and change volume until removed; viewer role cannot. | By design | Panel now says so per device |
| 14 | Robustness | IPv6-only networks: the host binds IPv4 private addresses only. | Limit | Documented, not changed |
| 15 | Robustness | Several adapters: the host picks one (real NIC over virtual ones). | Limit | The panel now shows which adapter and address was picked |

## Threat model, short

Attacker on the same network, no code: can fetch the static pages (no secrets, no data), open at most 6 sockets, try
codes at 4 misses per 5 minutes per address. 40 bits of code against that is out of reach. Attacker with a visible
code (shoulder surfing, 2 minute window): pairs once; the owner sees the device and can remove it. Attacker who sniffs
the pairing moment: gets the token (no TLS); mitigation is pairing on a trusted network and the revoke button.
Malicious web page in the owner's browser: Host and Origin checks refuse the WebSocket and the rebinding case.
Another local user on the PC: can read `connect-devices.json` but tokens are encrypted with the user's credential
store.

## NOT verified here

No real phone, TV, second PC, Electron run or OBS. mDNS on a real network, the Windows Firewall prompt and Android
compile were not exercised. Behaviour is covered by vitest over real loopback sockets and, for the viewer page, by
reading the code plus the existing Chromium script (`scripts/ui-test/overlay-check.mjs`).
