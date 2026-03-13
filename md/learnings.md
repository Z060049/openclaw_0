# Learnings

Date: 2026-03-12

This document captures what we debugged during setup, what worked, what did not work, and the current reliable operating flow.

## Context

Goal was to run `openclaw-zero-token` end-to-end, onboard providers, chat in UI, and prepare for a WhatsApp + stock-analysis workflow.

## What We Debugged

### 1) Node version mismatch during onboarding/server

Symptoms:
- `./onboard.sh` or `./server.sh start` failed with:
  - `SyntaxError: Invalid regular expression flags`
  - reference in `@mariozechner/pi-tui/.../utils.js` using regex `...$/v`

Root cause:
- Terminal session was using Node `v18.20.8`.
- Project requires Node `>=22.12.0`.

What worked:
- Switched terminal runtime to Node 22:
  - `nvm use 22.12.0`
- Re-ran commands successfully.

Learning:
- Always verify `node -v` before running scripts.

---

### 2) `npm install` failing while `pnpm install` succeeds

Symptoms:
- `npm install` failed with resolver/install errors (including `ERESOLVE` and `Cannot read properties of null (reading 'matches')`).

What worked:
- `pnpm install` completed successfully.
- Build succeeded with:
  - `pnpm build`
  - `pnpm ui:build`

Learning:
- On this machine/repo, dependency install should use `pnpm install`.

---

### 3) Onboarding interrupted or partial config leads to bad runtime model routing

Symptoms:
- UI loaded, but chat failed with:
  - `Unknown model: deepseek-web/deepseek-chat`

Likely cause:
- Onboarding did not complete cleanly for selected providers.
- Config not fully written into `.openclaw-zero-state/openclaw.json`.

What worked:
- Re-ran onboarding to completion.
- Verified model availability using `/models` in chat.
- Switched model with `/model ...`.

Learning:
- Logging into provider websites alone is not sufficient.
- The onboarding wizard must complete and persist provider/model config.

---

### 4) Wrapper script argument confusion (`onboard.sh`)

Observed behavior:
- `./onboard.sh --accept-risk --skip-channels` returned unknown option error.

Root cause:
- `onboard.sh` wrapper forwards args directly to binary entrypoint.
- Passing flags without explicit subcommand can be interpreted incorrectly.

Doc-backed safe path:
- Use documented command:
  - `./onboard.sh`
- Or explicit binary command with subcommand:
  - `node dist/index.mjs onboard ...`

Learning:
- Prefer documented quick-start command unless you intentionally need advanced flags.

---

### 5) ChatGPT Web provider runtime error (`crypto$1 is not defined`)

Symptoms in UI:
- `page.evaluate: ReferenceError: crypto$1 is not defined ...`

What this means:
- This appears to be a provider/runtime bug in `chatgpt-web` browser-path execution (not just onboarding).

What worked:
- Switched provider/model to Kimi in chat:
  - `/models`
  - `/model kimi-web/moonshot-v1-32k`
- Chat responses succeeded after switching.

Current status:
- Kimi works.
- ChatGPT Web is unstable in this environment/session and should be treated as currently not working for normal chat until patched.

## What Worked Successfully

1. Build and startup flow:
   - `pnpm install`
   - `pnpm build`
   - `pnpm ui:build`
   - `./start-chrome-debug.sh`
   - `./onboard.sh`
   - `./server.sh start`

2. Gateway/UI launch:
   - UI opens at `127.0.0.1:3001` and chat session is available.

3. Model switching in chat:
   - `/models`
   - `/model provider/model`
   - confirmed with `/model`

4. Kimi provider chat:
   - `kimi-web/moonshot-v1-32k` successfully replies.

## What Did Not Work Reliably

1. `npm install` in this environment.
2. Running scripts under Node 18.
3. ChatGPT Web response path (`crypto$1 is not defined` runtime error).
4. Partial onboarding (causes missing model/provider config and routing errors).

## Reliable Runbook (Current)

Use this exact sequence for a clean start:

```bash
cd "/Users/joeli/Desktop/files/github/openclaw-zero-token"
nvm use 22.12.0
node -v

pnpm install
pnpm build
pnpm ui:build

./start-chrome-debug.sh
./onboard.sh
./server.sh start
```

Important:
- Chrome must be running in debug mode before onboarding/chat provider flows that attach to browser sessions.
- Debug mode command: `./start-chrome-debug.sh`

Then inside UI chat:

```text
/models
/model kimi-web/moonshot-v1-32k
hello
```

## Server Operations

Start:

```bash
./server.sh start
```

Status:

```bash
./server.sh status
```

Restart:

```bash
./server.sh restart
```

Stop:

```bash
./server.sh stop
```

Stop debug Chrome (if needed):

```bash
pkill -f 'chrome.*remote-debugging-port=9222'
```

## WhatsApp + Stock Analysis Next Steps

Once core chat is stable:

1. Link WhatsApp:
   - `openclaw channels login --channel whatsapp`
2. Confirm channel status:
   - `openclaw channels status --probe`
3. Ensure model is stable (currently use Kimi instead of ChatGPT Web).
4. For live market data quality, configure web search provider keys as needed.

## CLI Command Learning (Global vs Local)

- `openclaw ...` only works if the OpenClaw CLI binary is installed globally and available in your shell `PATH`.
- On this machine, `openclaw` can return `command not found`, which means global install/path is missing.
- `node openclaw.mjs ...` works from repo root because it runs the local project launcher directly.
- The local launcher (`openclaw.mjs`) imports `dist/index.mjs`, so it executes the same CLI logic without needing global install.
- For reliability in this repo, use local form:
  - `node openclaw.mjs configure --section web`

## Key Takeaways

- Do not skip Node version check.
- Use `pnpm install` for this repo on this machine.
- Complete onboarding fully before judging model availability.
- Use `/models` and `/model` immediately after startup.
- Prefer Kimi right now; ChatGPT Web currently errors in this setup.
