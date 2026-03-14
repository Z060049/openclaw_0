# Channel Setup Learnings

Date: 2026-03-14

This document captures what we discovered while trying to configure channels in this repo, especially Telegram and WhatsApp.

## Scope

- Goal: get a working chat channel, starting with Telegram and then WhatsApp.
- Environment: `openclaw-zero-token` fork, Node `22.12.0`, local state in `.openclaw-zero-state`.

## Executive Outcome

- Telegram was not practical in this fork with the attempted external plugin path.
- WhatsApp setup succeeded end-to-end (QR linked, DM allowlist configured, config persisted).
- Main stability issues were process/service conflicts, not model login.

## Key Discoveries

### 1) Telegram plugin mismatch in this fork

Symptoms observed:
- `telegram plugin not available`
- `plugin not found: telegram`
- `Cannot find module .../src/plugin-sdk/index.ts/telegram`
- `Cannot find module .../src/plugin-sdk/index.ts/compat`

Root cause:
- Upstream Telegram extension and this fork's plugin SDK/runtime were not aligned.
- External path loading from `/tmp/openclaw-upstream-scan/extensions/telegram` caused repeated compatibility and import-resolution failures.

Decision:
- Stop spending time on Telegram for this setup cycle.

### 2) WhatsApp plugin path can work in this repo

Even after Telegram was dropped, WhatsApp initially failed due to the same alias-resolution issue affecting plugin imports.

Observed failure:
- `whatsapp plugin not available`
- `Cannot find module .../src/plugin-sdk/index.ts/compat`

Fix applied:
- Patched plugin alias resolution order in `src/plugins/loader.ts` so specific aliases (`openclaw/plugin-sdk/compat`, `openclaw/plugin-sdk/account-id`) are mapped before the broad `openclaw/plugin-sdk` alias.

Result:
- WhatsApp plugin load path became usable and onboarding proceeded.

### 3) Local config should not include external Telegram path

Config cleanup needed:
- Removed:
  - `plugins.load.paths` entry for `/tmp/openclaw-upstream-scan/extensions/telegram`
  - `plugins.entries.telegram`
- Kept:
  - `plugins.entries.whatsapp.enabled = true`
  - `plugins.slots.memory = "none"` (to avoid `memory-core` validation problems in this environment)

### 4) Onboarding WhatsApp flow worked

Successful flow from onboarding:
- Selected `WhatsApp (QR link)`.
- QR was shown and scanned.
- Received `code 515` restart prompt; onboarding retried automatically.
- Final message: `Linked after restart; web session ready.`

Then onboarding set personal-phone mode:
- `channels.whatsapp.dmPolicy = allowlist`
- `channels.whatsapp.allowFrom = ["+6598338780"]`
- Additional channel defaults were written (`selfChatMode`, `groupPolicy`, etc.).

### 5) Gateway health warnings during onboarding were noisy

During onboarding, health checks sometimes showed:
- `gateway closed (1006 abnormal closure (no close frame))`

What this meant in practice:
- Service/process churn during install/restart checks.
- Not necessarily a failed channel link.

Critical verification:
- Config persisted correctly.
- HTTP endpoint responded on `http://127.0.0.1:3001/`.
- `server.sh status` showed gateway process running.

### 6) Service/process conflicts were the main runtime problem

Repeated issue:
- Old `openclaw-gateway` process still bound to port `3001`.
- New starts failed with lock/port conflicts.

Reliable recovery pattern:
- Stop managed service and stale processes.
- Start one clean gateway instance.

## Script and Code Fixes Applied

### A) Loader alias ordering fix

File:
- `src/plugins/loader.ts`

Change:
- Ordered alias mapping so specific subpaths are resolved before broad package alias.

Why:
- Prevent incorrect path rewrites like `index.ts/compat`.

### B) Server launch command fix

File:
- `server.sh`

Change:
- Start command updated from:
  - `... dist/index.mjs gateway --port "$PORT"`
- To:
  - `... dist/index.mjs gateway run --port "$PORT"`

Why:
- `gateway` is a command group; `run` is the actual foreground gateway command.

## Current Working WhatsApp State

- WhatsApp linked via QR in onboarding.
- Personal number allowlisted.
- Config includes a valid `channels.whatsapp` section.
- Gateway/UI URL:
  - `http://127.0.0.1:3001/#token=<token-from-config>`

## Commands That Were Most Reliable

Use from repo root:

```bash
nvm use 22.12.0
pnpm build
./start-chrome-debug.sh
./onboard.sh
./server.sh restart
./server.sh status
```

If port/process conflict happens:

```bash
node dist/index.mjs gateway stop
./server.sh stop
./server.sh start
```

## Practical Guidance Going Forward

- Treat Telegram as a separate future integration task for this fork.
- Keep WhatsApp as the primary tested channel path.
- Avoid mixing multiple gateway supervisors at once (manual + launchd + script loops).
- Prefer local launcher commands in this repo:
  - `node openclaw.mjs ...` or script wrappers (`./onboard.sh`, `./server.sh`).

## 2-Minute WhatsApp Verification Checklist

1) Confirm gateway is up:

```bash
./server.sh status
```

2) If not running, restart quickly:

```bash
./server.sh restart
```

3) Open UI with token:
- `http://127.0.0.1:3001/#token=<gateway-token>`

4) In UI chat, send:
- `hello from ui`
- Confirm assistant replies.

5) From your allowlisted WhatsApp number, send to linked account:
- `hello from whatsapp`
- Confirm assistant replies in WhatsApp.

6) If no WhatsApp reply:
- Re-run onboarding: `./onboard.sh`
- Select WhatsApp QR link again.
- Ensure your number remains in `channels.whatsapp.allowFrom`.
