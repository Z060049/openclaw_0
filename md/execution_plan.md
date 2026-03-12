# Execution Plan (Paused)

Date: 2026-03-11

This file captures the current execution status and the exact next steps to resume later.

## Goal

Run `openclaw-zero-token` locally, verify core chat, connect WhatsApp, and validate stock-analysis drafting.

## Progress Completed Today

1. Prerequisites checked and fixed:
   - Repo path confirmed.
   - Chrome confirmed installed.
   - Node upgraded from v18 to v22.12.0.
2. Build completed successfully:
   - `pnpm install`
   - `npm run build`
   - `pnpm ui:build`

## Remaining Steps (Resume Order)

1. Start auth browser:
   - `./start-chrome-debug.sh`
2. Complete provider onboarding:
   - `./onboard.sh`
3. Start gateway/UI:
   - `./server.sh start`
   - Optional check: `./server.sh status`
4. Validate core chat:
   - Open `http://127.0.0.1:3001/`
   - Run `/models`
   - Send a test prompt
5. Link WhatsApp:
   - `openclaw channels login --channel whatsapp`
   - Scan QR in WhatsApp -> Linked Devices
   - Verify: `openclaw channels status --probe`
6. Enable stock-research capability:
   - Set one search key: `BRAVE_API_KEY` or `PERPLEXITY_API_KEY`/`OPENROUTER_API_KEY` or `XAI_API_KEY`
7. Run WhatsApp stock-analysis test:
   - Ask for structured stock analysis with citations.

## Daily Startup (After Initial Setup)

```bash
./start-chrome-debug.sh
./onboard.sh   # run when sessions expire or when adding providers
./server.sh start
```

## Notes

- You do not need to reinstall OpenClaw unless dependencies/build artifacts are broken or you move to a new machine.
- This project runs a local gateway server on your machine; the browser is just the UI client.
