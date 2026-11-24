import { useEffect, useState } from "react";
import type { ConnectTestResult } from "@shared/ipc";
import { useConnect } from "@/store/connect";

/**
 * Settings > Devices: pair phones, tablets, TVs and other PCs on the same network, see who is connected, choose
 * what each may do, and remove any with one click. Self-contained; Settings only mounts it.
 */
function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.round((until - now) / 1000));
  return (
    <>
      {s >= 3600
        ? `${Math.floor(s / 3600)} h left`
        : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left`}
    </>
  );
}

/** "just now", "5 min ago", "2 h ago", "3 days ago" */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

const IDLE_CHOICES: Array<[number, string]> = [
  [0, "Never"],
  [1, "After 1 hour"],
  [4, "After 4 hours"],
  [12, "After 12 hours"],
  [24, "After 24 hours"],
];

export function DevicesPanel() {
  const status = useConnect((s) => s.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = window.lyra.connect;
  const run = (p: Promise<unknown>): void => {
    setBusy(true);
    setError(null);
    p.catch(() =>
      setError("That did not work. Try again, or turn Connect off and on."),
    ).finally(() => setBusy(false));
  };
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (
    key: string,
    text: string | null | Promise<string | null>,
  ): void => {
    void Promise.resolve(text).then(async (t) => {
      if (t && (await window.lyra.app.copy(t))) {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 2500);
      }
    });
  };
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [confirmAll, setConfirmAll] = useState(false);
  const [test, setTest] = useState<ConnectTestResult | "running" | null>(null);
  const runTest = (): void => {
    setTest("running");
    void api
      .test()
      .then(setTest, () =>
        setTest({
          ok: false,
          message: "The check could not run.",
          ms: null,
          ip: null,
          port: 0,
          mdns: false,
        }),
      );
  };
  // a stale result must not outlive the situation it described
  useEffect(() => setTest(null), [status.running, status.url]);

  const oneTime = status.codes.find((c) => !c.party);
  const party = status.codes.find((c) => c.party);
  const hostAddress = status.url?.replace("http://", "").replace(/\/$/, "");
  const people = status.devices.filter((d) => d.role !== "overlay");
  const summary = status.running
    ? `On${status.network ? ` · ${status.network}` : ""} · ${hostAddress} · ${status.online ?? 0} connected`
    : status.waiting || status.noNetwork
      ? "Waiting for a network"
      : "Off";

  return (
    <>
      <div className="srow">
        <div className="srow__label">
          <span>Connect other screens</span>
          <small>
            Same Wi-Fi, no internet needed. Phones, tablets, TVs and other PCs
            show your song, lyrics, video and look in time with this PC, and
            paired ones can control it. Off by default
          </small>
        </div>
        <div className="srow__ctl">
          <button
            type="button"
            role="switch"
            aria-checked={status.enabled}
            aria-label="Connect other screens"
            className="switch"
            disabled={busy}
            onClick={() => run(api.setEnabled(!status.enabled))}
          >
            <i />
          </button>
        </div>
      </div>

      {status.enabled && (
        <div className="health" role="status" aria-live="polite">
          <div
            className="health__row"
            data-state={status.running ? "ok" : "slow"}
          >
            <i className="health__dot" />
            <span>{summary}</span>
          </div>
        </div>
      )}
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      {(status.waiting || status.noNetwork) && (
        <p className="hint">
          This PC is not on a Wi-Fi or Ethernet network right now, so there is
          nothing to connect to yet. Lyra starts sharing by itself as soon as a
          network is back.
        </p>
      )}

      {status.running && (
        <>
          <p className="hint">
            Only use this at home or on a network you trust. On a cafe, hotel or
            campus Wi-Fi strangers could reach the pairing page. Nothing is
            shown without a code you make here, but traffic is not encrypted.
          </p>
          <div className="tvlink">
            {oneTime?.qr ? (
              <img
                src={oneTime.qr}
                width={150}
                height={150}
                alt={`Pairing QR code. Or open ${hostAddress} and type the code ${oneTime.display}`}
              />
            ) : (
              <div style={{ width: 150, height: 150 }} />
            )}
            <div>
              {oneTime ? (
                <>
                  <p className="hint">
                    Scan with the new device&apos;s camera, or open{" "}
                    <b>{hostAddress}</b> in its browser and type the code:
                  </p>
                  <code
                    style={{ fontSize: "1.4em", letterSpacing: ".12em" }}
                    aria-label={`Pairing code ${oneTime.display.split("").join(" ")}`}
                  >
                    {oneTime.display}
                  </code>
                  <p className="hint">
                    Works once. <Countdown until={oneTime.expiresAt} />
                  </p>
                </>
              ) : (
                <p className="hint">
                  Make a code, then scan it on the device you want to add. On an
                  Android TV, open the Lyra TV app and type the code.
                </p>
              )}
              <button
                type="button"
                className="pill"
                disabled={busy}
                onClick={() => run(api.newCode("viewer"))}
              >
                Add a viewer
              </button>{" "}
              <button
                type="button"
                className="pill"
                disabled={busy}
                onClick={() => run(api.newCode("controller"))}
              >
                Add a controller
              </button>{" "}
              <button
                type="button"
                className="pill"
                onClick={() =>
                  copy("addr", hostAddress ? `http://${hostAddress}/` : null)
                }
              >
                {copied === "addr" ? "Copied" : "Copy address"}
              </button>
              <p className="hint">
                A viewer only watches. A controller can also play, pause, skip,
                seek, change volume and vibe, so add those only for people and
                screens you trust.
              </p>
            </div>
          </div>

          <div className="srow">
            <div className="srow__label">
              <span>Party mode</span>
              <small>
                One code for a group: guests scan it and watch the same song
                together (viewers only). Guests are removed when the party ends
              </small>
            </div>
            <div className="srow__ctl">
              <button
                type="button"
                className="pill"
                disabled={busy}
                onClick={() => run(api.party(!status.party))}
              >
                {status.party ? "End party" : "Start party"}
              </button>
            </div>
          </div>
          {party?.qr && (
            <div className="tvlink">
              <img
                src={party.qr}
                width={150}
                height={150}
                alt={`Party QR code. Or open ${hostAddress} and type the code ${party.display}`}
              />
              <div>
                <code style={{ fontSize: "1.4em", letterSpacing: ".12em" }}>
                  {party.display}
                </code>
                <p className="hint">
                  Shared code. <Countdown until={party.expiresAt} />
                </p>
              </div>
            </div>
          )}

          <div className="srow">
            <div className="srow__label">
              <span>Stream overlay (OBS)</span>
              <small>
                Lyrics on your stream as a transparent browser source. OBS
                cannot scan a code, so this makes a view-only link that stays
                valid until you remove it below. Anyone with this link on your
                network can see what you play
              </small>
            </div>
            <div className="srow__ctl">
              <button
                type="button"
                className="pill"
                disabled={busy}
                onClick={() => run(api.addOverlay())}
              >
                Add an overlay link
              </button>
            </div>
          </div>

          <div className="health" role="list" aria-label="Paired devices">
            {status.devices.length === 0 && (
              <p className="hint">No devices yet.</p>
            )}
            {status.devices.map((d) => (
              <div
                key={d.id}
                className="health__row dev"
                data-state={d.online ? "ok" : "slow"}
                role="listitem"
              >
                <i className="health__dot" />
                {renaming?.id === d.id ? (
                  <input
                    aria-label={`New name for ${d.name}`}
                    value={renaming.name}
                    maxLength={40}
                    autoFocus
                    onChange={(e) =>
                      setRenaming({ id: d.id, name: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        run(api.rename(d.id, renaming.name));
                        setRenaming(null);
                      } else if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={() => setRenaming(null)}
                  />
                ) : (
                  <span className="dev__name">
                    {d.name}
                    {d.guest ? " (guest)" : ""}
                  </span>
                )}
                <small>
                  {d.online
                    ? "connected"
                    : d.lastSeen
                      ? `last seen ${ago(d.lastSeen)}`
                      : "offline"}
                </small>
                <div className="dev__ctl">
                  {d.role === "overlay" && (
                    <>
                      <small>overlay, view only</small>
                      <button
                        type="button"
                        className="pill"
                        disabled={busy}
                        onClick={() => copy(d.id, api.overlayLink(d.id))}
                      >
                        {copied === d.id ? "Copied" : "Copy link"}
                      </button>
                    </>
                  )}
                  {!d.guest && d.role !== "overlay" && (
                    <select
                      aria-label={`What ${d.name} may do`}
                      value={d.role}
                      disabled={busy}
                      onChange={(e) =>
                        run(
                          api.setRole(
                            d.id,
                            e.target.value as "viewer" | "controller",
                          ),
                        )
                      }
                    >
                      <option value="viewer">Watch only</option>
                      <option value="controller">Watch and control</option>
                    </select>
                  )}
                  {!d.guest && renaming?.id !== d.id && (
                    <button
                      type="button"
                      className="pill"
                      disabled={busy}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setRenaming({ id: d.id, name: d.name })}
                      aria-label={`Rename ${d.name}`}
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    className="pill"
                    disabled={busy}
                    onClick={() => run(api.revoke(d.id))}
                    aria-label={`${d.role === "overlay" ? "Remove link of" : "Remove"} ${d.name}`}
                  >
                    {d.role === "overlay" ? "Remove link" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {status.devices.length > 1 && (
            <p className="hint">
              <button
                type="button"
                className="pill"
                disabled={busy}
                onClick={() => {
                  if (!confirmAll) {
                    setConfirmAll(true);
                    setTimeout(() => setConfirmAll(false), 4000);
                  } else {
                    setConfirmAll(false);
                    run(api.revokeAll());
                  }
                }}
              >
                {confirmAll
                  ? `Really remove all ${status.devices.length}?`
                  : "Remove all devices"}
              </button>{" "}
              {people.length > 0 && "Every device must pair again."}
            </p>
          )}
          <p className="hint">
            In OBS add a Browser source and paste the copied link; set its width
            and height to your canvas. Options go after a <code>?</code> before
            the <code>#</code> (for example{" "}
            <code>?vibe=neon&amp;lines=2&amp;size=80&amp;chroma=00ff00</code>).
            The link holds a secret: treat it like a password, and remove it
            here to cut it off.
          </p>

          <div className="srow">
            <div className="srow__label">
              <span>Turn off when nobody is connected</span>
              <small>
                Closes the door by itself if no device has been connected for
                this long. Turn Connect on again here when you need it
              </small>
            </div>
            <div className="srow__ctl">
              <select
                aria-label="Turn Connect off when idle"
                value={status.idleStopHours ?? 0}
                disabled={busy}
                onChange={(e) => run(api.setIdleStop(Number(e.target.value)))}
              >
                {IDLE_CHOICES.map(([h, label]) => (
                  <option key={h} value={h}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="srow">
            <div className="srow__label">
              <span>Check this setup</span>
              <small>
                Connects to this PC&apos;s own network address and reports what
                it finds
              </small>
            </div>
            <div className="srow__ctl">
              <button
                type="button"
                className="pill"
                disabled={test === "running"}
                onClick={runTest}
              >
                {test === "running" ? "Checking…" : "Run check"}
              </button>
            </div>
          </div>
          {test && test !== "running" && (
            <p className="hint" role="status">
              <b>{test.ok ? "Works" : "Problem"}</b>
              {test.ms !== null ? ` (${test.ms} ms)` : ""}: {test.message}
              {test.ok && !test.mdns
                ? " Automatic discovery on the network is off, so type the address on a TV."
                : ""}
            </p>
          )}
          <details className="hint">
            <summary>
              A device cannot connect? Firewall and network help
            </summary>
            <ul>
              <li>
                The phone or TV must be on the same Wi-Fi as this PC (not mobile
                data, not a guest network, not a VPN).
              </li>
              <li>
                Windows asks once to allow Lyra on private networks. If you
                chose Cancel: Windows Security, Firewall &amp; network
                protection, Allow an app through firewall, Change settings, and
                tick Lyra under Private.
              </li>
              <li>
                If Windows calls this network Public, switch it to Private:
                Settings, Network &amp; internet, your Wi-Fi, Network profile
                type.
              </li>
              <li>
                Some routers block devices from talking to each other (client or
                AP isolation, common on guest Wi-Fi). Turn that off in the
                router.
              </li>
              <li>
                Try the address shown above in the phone&apos;s browser. If it
                loads, only the code step is left.
              </li>
            </ul>
          </details>
          <p className="hint">
            Devices stay paired until you remove them. Traffic stays on your
            local network and is not encrypted: pair only on a network you
            trust.
          </p>
        </>
      )}
    </>
  );
}
