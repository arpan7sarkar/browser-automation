# Real-time Browser Agent

Automate web flows in a live Chromium browser with Playwright, orchestrated by OpenAI Agents. This project currently demonstrates a robust, selector-first Signup automation flow, with extendable tools for general website interaction.

## Features
* __Real browser automation__: Uses Playwright Chromium with visible UI for easy debugging.
* __Tool-driven architecture__: `@openai/agents` tools for opening URLs, clicking, typing, waiting for selectors, screenshots, and form discovery.
* __Smart form detection__: Heuristics to find email/password/name fields and submit buttons.
* __Deterministic entrypoint__: Runs a direct `signupFlow()` by default; can be switched to run via an Agent.
* __Artifacts__: Saves full-page screenshots to `screenshots/`.

## Tech Stack
* __Runtime__: Node.js (ES Modules)
* __Automation__: Playwright (Chromium)
* __Agent Orchestration__: `@openai/agents`
* __Schema__: `zod`
* __Config__: `dotenv`

## Prerequisites
* Node.js 18+
* Installed Playwright browsers (Chromium)
* OpenAI API key (if you enable agent-run path)

## Quick Start
```bash
# 1) Install deps
npm install

# 2) Install Playwright browsers (Chromium)
npx playwright install chromium

# 3) Configure environment
cp .env.example .env   # create your .env (see Environment section)

# 4) Run
npm start
```

This launches a visible Chromium window and executes the deterministic signup flow defined in `index.js`.

## Environment
Create a `.env` file in the project root. At minimum, set your OpenAI key if you intend to use the Agent execution path (commented in `index.js`).

```env
# Required for agent execution via @openai/agents
OPENAI_API_KEY=sk-...

# Optional: Playwright / proxy env vars if needed
# HTTP_PROXY=
# HTTPS_PROXY=
```

Note: The default `npm start` path calls `signupFlow()` directly and does not require the API key. The agent path (commented) will use `OPENAI_API_KEY`.

## How it Works
Key parts of `index.js`:
* __Browser setup__: launches Chromium non-headless
  - `chromium.launch({ headless: false, chromiumSandbox: true, args: ['--disable-extensions','--disable-file-system'] })`
* __Tools__: `open_url`, `click_selector`, `send_keys`, `wait_for_selector`, `take_screenshot`, `find_auth_form`, `signup`
* __signupFlow()__: Navigates to a signup page, detects input selectors (first/last/email/password/confirm), fills values, and submits
* __Deterministic run__: Calls `signupFlow()` with example data for `https://ui.chaicode.com/auth/signup`, then closes the browser
* __Agent run (optional)__: `run(websiteAutomationAgent, task)` is present but commented out

To target another site, edit the hardcoded inputs inside `signupFlow()` invocation near the bottom of `index.js` or switch to the Agent path and customize the `task` string.

## Scripts
```json
{
  "start": "node index.js"
}
```

## Usage Notes
* __Screenshots__: Saved to `screenshots/` with ISO timestamped filenames.
* __Selectors__: The heuristics prioritize semantic selectors and visible elements. Complex pages may need custom selectors.
* __Headless mode__: For CI, switch `headless: false` to `true` in `index.js`.
* __Closing browser__: The script closes the browser at the end of the run.

## Troubleshooting
* __Playwright not installed__: Run `npx playwright install chromium`.
* __Stuck on navigation__: Some sites gate content by consent/iframes; consider adding a pre-click for consent dialogs.
* __Selectors not found__: Inspect the page’s DOM and add site-specific selectors, or extend `find_auth_form`/`signupFlow()` heuristics.
* __Agent errors__: Ensure `OPENAI_API_KEY` is set and network egress is allowed.

## Roadmap
* Add login flow and 2FA handling
* Add retry/backoff and richer DOM strategies
* Add recording and re-play of successful flows
* Headless CI recipe and Dockerfile

## License
ISC

## Acknowledgements
Built with Playwright and the `@openai/agents` SDK.
