---
name: End-to-End Run Checklist
overview: Provide an execution-ready checklist to install, authenticate, run OpenClaw, enable web research for real estate analysis, connect WhatsApp, and validate real-estate-analysis drafting.
todos:
  - id: verify-prereqs
    content: Verify Node/npm/pnpm/Chrome and repo root access
    status: completed
  - id: build-project
    content: Install dependencies and build backend + UI
    status: completed
  - id: authenticate-providers
    content: Start debug Chrome and complete onboarding auth
    status: cancelled
  - id: start-and-validate
    content: Start gateway, verify /models, and test chat
    status: cancelled
  - id: connect-whatsapp
    content: Link WhatsApp account and verify channel status
    status: cancelled
  - id: enable-research-tools
    content: Ensure browser tool is available for zero-token real estate research
    status: cancelled
  - id: run-stock-analysis-test
    content: Send structured real-estate prompt via WhatsApp and validate citations
    status: cancelled
isProject: false
---

# End-to-End Execution Plan

## Goal

Run `openclaw-zero-token` locally, verify chat works, enable web research, connect WhatsApp, and use it to draft real estate analysis responses.

## Step 1: Prerequisites

- Confirm required tools are installed:
  - Node.js `>=22.12.0`
  - `npm`
  - `pnpm` (install via `corepack enable && corepack prepare pnpm@latest --activate` if missing)
  - Google Chrome
- Work from repo root: [/Users/joeli/Desktop/files/github/openclaw-zero-token](/Users/joeli/Desktop/files/github/openclaw-zero-token)

## Step 2: Build Once

- Run:
  - `npm install`
  - `npm run build`
  - `pnpm ui:build`
- Expect build artifacts for backend/UI to be generated before runtime.

## Step 3: Start Auth Browser

- Run: `./start-chrome-debug.sh`
- Keep this debug Chrome running.
- In this debug browser, sign in to providers you want to use (ChatGPT/Claude/Gemini/etc.).

## Step 4: Onboard Providers

- Run: `./onboard.sh`
- Complete provider auth capture in the wizard.
- Important: only providers completed here will appear later in `/models`.

## Step 5: Start Gateway + UI

- Run: `./server.sh start`
- Optional health check: `./server.sh status`
- Open local UI: `http://127.0.0.1:3001/` (or tokenized URL shown by startup output).

## Step 6: Validate Core Chat

- In UI chat, run `/models` and confirm configured providers/models are listed.
- Send a test message and confirm reply succeeds.

## Step 7: Enable Web Research For Real Estate Analysis (Zero-Token Path)

- **Primary path (no API keys):** Use the **browser** tool. The LLM (Kimi, DeepSeek, etc.) drives Chrome to visit sites, read pages, and synthesize answers. This is the core openclaw-zero-token flow.
- Ensure debug Chrome is running (`./start-chrome-debug.sh`) so the agent can use the browser. No extra configuration required.
- **Optional enhancement:** For one-shot “search the web and cite” behavior, configure one of: `BRAVE_API_KEY`, `PERPLEXITY_API_KEY` / `OPENROUTER_API_KEY`, or `XAI_API_KEY` (see `.env.example` and `src/agents/tools/web-search.ts`). Not required for real estate/stock research with the browser.

## Step 8: Run Web UI Real-Estate Analysis Test

- In the Web UI at `http://127.0.0.1:3001/`, send a structured prompt:
  - "Draft a real estate analysis for Irvine, CA covering market trend, price/rent outlook, neighborhood-level drivers, risks, and bull/base/bear scenarios. Cite recent sources."
- The agent may use the **browser** tool to visit sites (e.g. Zillow, local news) and synthesize an answer with sources.
- Confirm response quality and that it references or cites what it found.

## Step 9: Link WhatsApp Channel

- From repo root, run (this repo uses the local launcher; global `openclaw` may not be installed):
  - `node openclaw.mjs channels login --channel whatsapp`
- Scan the QR code in WhatsApp -> Linked Devices.
- Verify channel status: `node openclaw.mjs channels status --probe`

## Step 10: Set WhatsApp Access Policy And Validate WhatsApp Prompt

- Ensure DM access allows your sender. In config (e.g. `.openclaw-zero-state/openclaw.json`):
  - Prefer `channels.whatsapp.dmPolicy`: `pairing` or `allowlist`.
  - If `allowlist`, add your number to `channels.whatsapp.allowFrom`.
- Config shape reference: `src/config/types.whatsapp.ts`
- Send the same real-estate prompt in WhatsApp; confirm the agent replies and references sources (e.g. from browser visits).

## Step 11: Daily Startup Routine

- Use this sequence each day (or when sessions expire):
  - `./start-chrome-debug.sh`
  - `./onboard.sh` (only if adding providers or re-auth)
  - `./server.sh start`
- For CLI (e.g. WhatsApp channels, configure): from repo root run `node openclaw.mjs <subcommand>`

```mermaid
flowchart LR
installBuild[InstallAndBuild] --> debugChrome[StartDebugChrome]
debugChrome --> onboardProviders[RunOnboardAuth]
onboardProviders --> startGateway[StartGatewayUI]
startGateway --> validateModels[ValidateModelsAndChat]
validateModels --> ensureBrowser[EnsureBrowserToolReady]
ensureBrowser --> runWebUiPrompt[RunRealEstatePromptInWebUI]
runWebUiPrompt --> linkWhatsApp[LinkWhatsAppQR]
linkWhatsApp --> setDmPolicy[SetWhatsAppDmPolicy]
setDmPolicy --> runWhatsAppPrompt[RunRealEstatePromptInWhatsApp]
```



