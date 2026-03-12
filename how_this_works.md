# How This Works

This repository runs OpenClaw locally as a gateway service and web UI.
The browser is only the interface; the server runs on your machine.

## What This Project Is

OpenClaw Zero Token is a fork of OpenClaw that focuses on "zero API token cost" for many providers by using browser-session authentication flows instead of paid API tokens for those providers.

In practice, it means:
- You run a local Node.js gateway.
- You authenticate providers through a debug Chrome flow.
- The gateway then routes chat requests to configured providers/models.

## Startup Flow (Steps 1 to 4)

## 1) Install dependencies and build

Commands:

```bash
npm install
npm run build
pnpm ui:build
```

What this does:
- `npm install`: installs required Node packages.
- `npm run build`: compiles backend/runtime code.
- `pnpm ui:build`: builds frontend UI assets used by the web interface.

Why this is needed:
- Without dependencies and build artifacts, onboarding and server startup may fail or UI files may be missing.

## 2) Start Chrome debug mode

Command:

```bash
./start-chrome-debug.sh
```

What this does:
- Launches a special Chrome instance with remote debugging enabled (commonly on port `9222`).
- Lets OpenClaw attach to that browser session for login/session capture workflows.

Why this is needed:
- Zero-token provider auth relies on browser session state (cookies/tokens from your logged-in web sessions).

## 3) Run onboarding auth

Command:

```bash
./onboard.sh
```

What this does:
- Runs an interactive setup wizard.
- You select providers (for example ChatGPT/Claude/Gemini/DeepSeek).
- You complete auth/login flows and it writes provider/profile config.

Your assumption was correct:
- Yes, this step is onboarding into those provider accounts so the local gateway can use them.

Important behavior:
- Only providers completed in onboarding are written to config and later appear in `/models`.

## 4) Start gateway + web UI

Command:

```bash
./server.sh start
```

What this does:
- Starts the local OpenClaw gateway process (Node.js service).
- Exposes local API/UI on `127.0.0.1:3001`.
- Serves the web chat UI and handles routing/tool execution.

What "gateway" means here:
- A local middle layer between your client (browser/API/CLI) and model providers.
- It handles auth profiles, model routing, and tool integrations.

## Where The Server Runs

The server runs locally on your computer as an OS process, not in the browser.

- Process location: your machine (started by `server.sh`).
- Network bind: local loopback (`127.0.0.1`), typically port `3001`.
- Browser role: UI client that connects to the local gateway.

## Is It Just A Browser Server?

Mostly, you interact through browser chat, but the gateway is more than a web page host:

- Web UI access in browser.
- API endpoint access (for programmatic calls).
- CLI/TUI usage paths.

So it is a local application server with a browser front-end.

## Where Data/State Lives

State is local to your machine and stored on disk (plus in-memory runtime state while running).

Common state directory in this repo:
- `.openclaw-zero-state/`

Typical files:
- `openclaw.json` (gateway/provider config)
- `auth-profiles.json` and related auth/session files

Notes:
- Sensitive auth/session material is local and should not be committed.
- Browser local storage is not the primary system database for this project.

## WhatsApp Stock Analysis Feature

If you want to talk to OpenClaw through WhatsApp and ask it to draft stock analysis, this setup can do it.

### Do You Need To Reinstall OpenClaw?

Usually, no.

You only need to reinstall/rebuild if:
- You moved to a new machine.
- Dependencies/build files are broken or missing.
- A major upgrade requires a fresh install.

In normal use, you just restart services and re-auth when sessions expire.

### How To Use WhatsApp For Stock Analysis

1. Start your normal runtime:

```bash
./start-chrome-debug.sh
./onboard.sh
./server.sh start
```

2. Link WhatsApp account:

```bash
openclaw channels login --channel whatsapp
```

Then scan the QR code in WhatsApp -> Linked Devices.

3. Verify channel health:

```bash
openclaw channels status --probe
```

4. Confirm DM access policy:
- Use `pairing` or `allowlist` for `channels.whatsapp.dmPolicy`.
- If using `allowlist`, ensure your number is in `allowFrom`.

5. Enable web research keys for stronger stock analysis:
- `web_search` needs provider keys for real-time results.
- Configure one of:
  - `BRAVE_API_KEY`
  - `PERPLEXITY_API_KEY` or `OPENROUTER_API_KEY`
  - `XAI_API_KEY`

6. Ask with a structured finance prompt in WhatsApp, for example:

```text
Draft a stock analysis for NVDA with:
1) business summary
2) moat
3) growth drivers
4) valuation comps
5) top 5 risks
6) bull/base/bear scenario table
Use recent sources and cite links.
Not financial advice.
```

### What You Have After Setup

After setup, you have a local OpenClaw gateway running on your machine and can interact through WhatsApp (plus browser/API/CLI). It is not just a static browser page; it is a local service with multiple client entry points.
