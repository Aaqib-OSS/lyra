# Security policy

Lyra reads what you play and shows lyrics. It never needs your passwords, and it has no accounts or analytics.

## Reporting a vulnerability
Please **do not open a public issue** for a security problem. Use GitHub's private reporting:
**Security → Report a vulnerability** on https://github.com/DhruvHarani1/lyra/security/advisories/new

Include what you found, how to reproduce it, and the version. I will reply within a few days, fix it, and credit you if you like.

## Supported versions
Only the latest release of the Windows app (`v*`) and the Android app (`android-v*`) gets fixes. The Windows app updates itself.

## What is in scope
- The Windows and Android apps, Lyra Connect (the local-network host), the room/Jam features, the website in `website/`.
- Supply chain: dependencies, GitHub Actions workflows, release signing.

## How the project protects itself
- Releases are built by GitHub Actions from tags; the Android APK is signed with a key stored only in repository secrets.
- Secret scanning with push protection, Dependabot alerts and updates, and CodeQL are enabled.
- Fork pull requests need maintainer approval before any workflow runs.
- The Windows app runs with a sandboxed renderer, context isolation and a strict content security policy. The page can only reach the main process through a fixed list of calls (`src/preload/index.ts`); the main process checks who is calling, and file paths from the page are never trusted (an export may only touch the file you picked in the save dialog).
- Lyra Connect (showing Lyra on your other screens) is **off by default** and local-network only. It uses plain `http`/`ws`, so it is **not encrypted**: pair on a network you trust. Details and limits are in [PRIVACY.md](PRIVACY.md) and `docs/connect-protocol.md`.
- Spotify sign-in uses Authorization Code with PKCE (no client secret); tokens are stored encrypted with Windows DPAPI. Logs and "Copy diagnostics" have keys, tokens and your Windows account name removed.
- Every network request the apps make is listed in [docs/network-inventory.md](docs/network-inventory.md); the latest review is in [docs/security-audit.md](docs/security-audit.md), including what was **not** verified.

## What to expect after you report
- A first reply within about 3 days, a fix or a clear plan within about 30 days for anything that is exploitable, and a coordinated release: please keep the details private until the fixed version is out.
- You are credited in the release notes unless you prefer not to be.
- There is no bug bounty. This is a free, volunteer-run project.
- If GitHub's private reporting is not available to you, open a public issue that says only "I have a security report" (no details) and I will contact you.
