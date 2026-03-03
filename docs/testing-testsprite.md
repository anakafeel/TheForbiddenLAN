# Testing with TestSprite — SkyTalk / TheForbiddenLAN

## What is TestSprite?

[TestSprite](https://www.testsprite.com) is an AI-driven end-to-end (E2E) testing platform that auto-generates, executes, and reports on browser tests via an MCP (Model-Context Protocol) server integration. It reads your codebase and PRD, generates a structured test plan in JSON, then produces Playwright Python scripts that run against your local dev server.

It integrates directly with Claude Code via MCP: the AI assistant calls TestSprite tools during a conversation to generate plans and execute tests, rather than requiring you to write and maintain test scripts by hand.

---

## Why We Chose TestSprite

| Criterion | TestSprite | Alternatives considered |
|---|---|---|
| **Speed to coverage** | Generates full test plans from code + PRD in one call | Playwright/Cypress: manual authoring (~1-2 hrs per page) |
| **No auth/login needed for our portal** | Handles unauthenticated apps cleanly | Cypress Testing Library: same effort, no AI lift |
| **MCP integration** | Runs inside Claude Code sessions; fits our AI-first dev workflow | Standalone tools require separate CI setup |
| **Visual replay** | Every test has a screen recording link on testsprite.com | Playwright: need to pipe `--video` manually |
| **Hackathon pace** | Zero boilerplate — tests go from "0 to running" in minutes | N/A |

**Key tradeoff acknowledged**: TestSprite is cloud-dependent (sends test context to testsprite.com servers and requires a tunneled proxy port). This means tests can't be run fully air-gapped. For a hackathon working on a satellite comms tool, we accepted this in exchange for the speed and zero-setup benefit.

---

## How Tests Are Stored

```
testsprite_tests/
├── tmp/
│   ├── config.json                    # TestSprite run config (proxy, port, scope)
│   ├── prd_files/MASTER_GUIDE_v4.md   # PRD snapshot used for test generation
│   ├── code_summary.yaml              # Auto-generated codebase summary
│   ├── test_results.json              # Raw JSON results from last run
│   └── raw_report.md                  # Raw markdown report
├── standard_prd.json                  # Structured PRD (JSON) derived from codebase
├── testsprite_frontend_test_plan.json # Full test plan (19 test cases)
├── TC001_*.py                         # Generated Playwright test scripts
├── TC002_*.py
└── ...
```

Each `TC###_*.py` file is a standalone Python Playwright script. TestSprite generates them; you can read and inspect them but should not manually edit them — re-running test generation will overwrite them.

---

## First Run Results (2026-03-03)

**Scope**: Portal frontend (`packages/portal`) at `localhost:5174`
**Server**: Dev mode (`npm run dev` / `pnpm dev:portal`)
**Backend**: NOT running (known — all API calls fail by design in this test run)
**Pass rate**: **9 / 15 executed = 60%**

| TC | Title | Result | Root Cause |
|---|---|---|---|
| TC001 | Dashboard loads and shows all stat cards | ✅ Pass | — |
| TC002 | Active Talkgroups stat shows placeholder value | ✅ Pass | — |
| TC003 | Device status table shows expected column headers | ✅ Pass | — |
| TC004 | Dashboard usable with empty device data | ✅ Pass | — |
| TC006 | Devices page Device Management UI shell renders | ✅ Pass | — |
| TC007 | Enable a disabled device (if rows present) | ❌ Fail | Backend not running → no device rows |
| TC008 | Disable an active device (if rows present) | ❌ Fail | Backend not running → no device rows |
| TC009 | No toggle controls when device list empty | ✅ Pass | — |
| TC010 | Talkgroups page renders even when list is empty | ✅ Pass | — |
| TC011 | Create talkgroup with valid name (happy path) | ❌ Fail | Backend not running → POST fails |
| TC012 | Empty name rejected on talkgroup create | ❌ Fail | No interactive elements detected (0 elements on page) |
| TC013 | Whitespace-only name rejected (edge validation) | ❌ Fail | No visible validation change; backend not running |
| TC014 | Create button stays on Talkgroups page | ❌ Fail | 0 interactive elements on /talkgroups |
| TC016 | Users page renders (shell + table visible) | ✅ Pass | — |
| TC017 | Users page shows no placeholder/mock entries | ✅ Pass | — |

### Failure Analysis

**Group A — Backend-dependent tests (TC007, TC008, TC011):**
These tests require a running backend API (`localhost:3000`) to populate device rows or persist talkgroup creation. They are expected to fail when the server is not running. Fix: run the server before executing these tests (see Known Issue C1 in `architecture-audit.md` — Supabase stub must be ported to Prisma first).

**Group B — Talkgroup form interactivity (TC012, TC013, TC014):**
TestSprite's automation detected 0 interactive elements on `/talkgroups`. The form input and Create button are visible in screenshots but not reachable programmatically. This is a portal implementation gap — the Talkgroups page likely renders the form in a way that doesn't expose standard `role="textbox"` or `role="button"` attributes (possibly missing `aria-*` labels or using a non-standard component). Fix: add `aria-label` attributes to the talkgroup name `<input>` and the Create `<button>`.

---

## How to Run Tests

### Prerequisites

1. **Python 3.11+** with `playwright` installed:
   ```bash
   pip install playwright
   playwright install chromium
   ```
2. **Portal dev server running** on `localhost:5174`:
   ```bash
   cd packages/portal
   pnpm dev
   # or from workspace root:
   pnpm dev:portal
   ```
3. **(Optional) Backend running** on `localhost:3000` for API-dependent tests:
   ```bash
   cd packages/server
   pnpm dev
   ```

### Run via MCP (Recommended — inside Claude Code)

```
Run the TestSprite tests for the portal
```

Claude Code will call `testsprite_generate_code_and_execute` with the correct config. Results appear in `testsprite_tests/tmp/raw_report.md` and on the testsprite.com dashboard.

### Run a Single Test Manually

Each generated test script is a self-contained Playwright script:

```bash
cd /home/anakafeel/linuxworkspace/TheForbiddenLAN
python testsprite_tests/TC001_Dashboard_loads_and_shows_all_overview_stat_cards.py
```

### Run All Tests Manually

```bash
cd testsprite_tests
for f in TC*.py; do echo "--- $f ---"; python "$f"; done
```

### Run via TestSprite MCP (specific test IDs)

Ask Claude Code to run specific tests:
```
Run TestSprite tests TC001, TC003, TC016 only
```

---

## How to Add New Test Cases

### Option 1: Regenerate the Test Plan (AI-driven)

If you've added new features to the portal, ask Claude Code to regenerate the plan:

```
Regenerate the TestSprite frontend test plan — I added a new Settings page
```

This calls `testsprite_generate_frontend_test_plan` and updates `testsprite_frontend_test_plan.json`. Then run `testsprite_generate_code_and_execute` to generate the new scripts.

### Option 2: Manually Add a Test Case to the Plan

Edit `testsprite_tests/testsprite_frontend_test_plan.json` and add a new entry following the existing schema:

```json
{
  "id": "TC020",
  "title": "Settings page renders without crash",
  "description": "Verify the Settings page loads and shows the expected config options.",
  "category": "Settings",
  "priority": "High",
  "steps": [
    { "type": "action", "description": "Navigate to /settings" },
    { "type": "assertion", "description": "Verify URL contains \"/settings\"" },
    { "type": "assertion", "description": "Verify text \"Settings\" is visible" }
  ]
}
```

Then ask Claude Code to generate and run the new test case:
```
Generate and run TestSprite test TC020
```

### Option 3: Write a Playwright Script Directly

Create `testsprite_tests/TC020_Settings_page_renders.py` following the structure of an existing generated test (e.g., `TC001_*.py`). Use `playwright.async_api`, `async_playwright().start()`, and assert against `localhost:5174`.

---

## Test Plan Categories

The current `testsprite_frontend_test_plan.json` covers 19 test cases across 4 categories:

| Category | TCs | Focus |
|---|---|---|
| Dashboard Overview | TC001–TC005 | Stat cards, device table, empty-state resilience |
| Device Management | TC006–TC009 | Device list renders, Enable/Disable actions |
| Talkgroup Management | TC010–TC015 | Create form, validation, navigation stability |
| User Listing | TC016–TC019 | Users table, no mock data, navigation |

Tests marked `Low` priority are skipped in dev-mode runs (TestSprite limits to 15 high-priority tests in dev mode to avoid dev server overload). Run in production build mode to execute all 19.

---

## Running in Production Build Mode (All 19 Tests)

```bash
# Build the portal
cd packages/portal
pnpm build

# Serve the built output
pnpm preview
# Portal runs at localhost:4173 by default

# Update config and run via MCP
# Tell Claude Code: "Run all TestSprite tests against the production build at localhost:4173"
```

In production mode TestSprite will execute all 19 tests (not capped at 15).

---

## Tradeoffs & Limitations

| Issue | Impact | Mitigation |
|---|---|---|
| **Cloud dependency** | Tests can't run air-gapped; test context sent to testsprite.com | Accept for hackathon; self-hosted option available in enterprise tier |
| **Dev-mode cap** | Only 15 highest-priority tests run against a dev server | Use production build for full suite |
| **No backend mocking** | Tests that require API data fail if server is down | Run server OR stub API responses in portal's fetch calls |
| **AI-generated assertions** | Auto-generated step text may not match exact DOM selectors; needs tuning after UI changes | Review `raw_report.md` after each run; edit test plan steps |
| **Python dependency** | Test scripts require Python + Playwright (not Node.js) | Install once: `pip install playwright && playwright install chromium` |
| **Proxy tunnel** | TestSprite uses a cloud proxy to reach localhost | Proxy credentials rotate per session; regenerate config if expired |
| **Overwritten scripts** | Re-running test generation overwrites all `TC*.py` files | Commit test scripts before regenerating if you've made manual edits |

---

## Recommended CI Workflow (Post-Hackathon)

```yaml
# Example GitHub Actions step
- name: Build portal
  run: pnpm build --filter @forbiddenlan/portal

- name: Start portal preview
  run: pnpm preview --filter @forbiddenlan/portal &

- name: Run TestSprite
  run: |
    pip install playwright
    playwright install --with-deps chromium
    for f in testsprite_tests/TC*.py; do python "$f"; done
```

---

*Last updated: 2026-03-03. Test run ID: `8964cd25-ba00-4914-9ff5-a163bf86801a`.*
