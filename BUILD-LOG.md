# BUILD LOG — paypal-curator (PayPal AI Hackathon 2026)

Entry: Curator + PayPal agentic commerce. An agent that PAYS (sandbox), every payment
carrying a K-record receipt. Deadline: Thu Nov 12, 2026, 3:00 PM ET.
Repo: iamvolshi/paypal-curator (public). Coordinator: Elara (subagent session).

## 2026-11-09 evening — kickoff
- Recon done: winning-package PDF read (4 acts, Sally's server, Sherlock parallel);
  existing Curator demo read (~/workspace/curator-demo-fix/demo.html);
  PayPal Agent Toolkit quickstart read (docs.paypal.ai) — npm @paypal/agent-toolkit,
  TS/Python, MCP support, needs sandbox client ID + secret from env vars.
- Repo cloned empty from iamvolshi/paypal-curator. Node v24.22.1, npm 10.9.4.
- Architecture decided: single Node/Express app. Server serves static frontend from
  public/ + POST /api/pay (real sandbox transaction via Agent Toolkit) +
  GET /api/health. Acts 1, 2, 4 run client-side; Act 3 needs the server + sandbox creds.
- Three build agents fanned out (parallel, files only — coordinator commits):
  1. Act 1 — mock data pool (Sally's server, ChatGPT export JSON, invoices incl.
     $480 M. Okafor invoice) + public/js/catalog.js (subject clustering by content).
  2. Acts 2 & 4 — public/js/provenance.js (fact extraction + subject reports, with
     honest cannot-answer) + public/js/krecord.js (append-only K-record, query by date
     range, audit report) + data/krecord-seed.json.
  3. Act 3 — server/ (Express + @paypal/agent-toolkit), .env.example, .gitignore.
     Credential status: NO sandbox credentials exist in this environment; agent must
     NOT invent any. Code must be complete and runnable once creds land in .env.
- Still to do (wave 2): frontend shell (index.html + app.js wiring the four acts,
  Darren's design rule: SHOW it, 30-second comprehension, big plain labels),
  GitHub Pages/static hosting decision, LICENSE (MIT), README, DEMO-SCRIPT.md,
  video (under 3 min), Devpost description, Darren's Join click on Devpost.

## 2026-11-09 ~18:40 — Act 3 DONE + verified by coordinator
- Agent 3 delivered: server/package.json (@paypal/agent-toolkit pinned 1.11.0,
  verified on npm), server/paypal.js (394 lines), server/index.js (151 lines),
  server/.env.example, .gitignore, server/README.md.
- Toolkit API verified by the agent at runtime: create_order (USD-only, no
  payee field) → pay_order (capture) → get_order. No LLM involved — tools
  called via .execute() directly.
- TWO HARD LIMITS found (documented in code + server/README.md, shape the
  frontend): (1) capture needs payer approval — fresh order is CREATED,
  capture 422s until a sandbox buyer approves via the approveUrl in a
  browser; flow is POST /api/pay → 202 AWAITING_PAYER_APPROVAL + approveUrl
  → approve click → POST /api/pay/:orderId/capture → 200 COMPLETED receipt.
  (2) No payee field: money settles to the sandbox merchant account owning
  the .env credentials; payeeEmail is kept on the receipt + K-record only.
  Payouts (pay-to-email in one call) is NOT in the toolkit.
- Coordinator verified live: /api/health → not-configured (no creds);
  bad body → 400 VALIDATION_ERROR; dummy creds → honest error from the REAL
  sandbox ("Failed to fetch access token: Client Authentication failed") —
  the code reaches api.sandbox.paypal.com and surfaces errors, nothing faked.
  Root serves 200. npm install done (280 pkgs, toolkit 1.11.0).
- Coordinator fixed: .gitignore had `data/` (would have excluded the seeded
  source data) — narrowed to `data/krecord-live.json` only.
- OPEN (for integration): server's K-record entry shape (belief/authority/
  reason nullable) vs krecord.js canonical shape — align in wave 2.
  CREDENTIAL BLOCKER (unchanged): no sandbox credentials in this environment;
  live create → approve → capture is UNTESTED. Needs: (1) sandbox REST app
  Client ID/Secret in server/.env, (2) sandbox personal/buyer account for
  the approve click.

## 2026-11-09 ~18:46 — Integration DONE + verified by coordinator
- Agent 4 delivered: public/index.html (89 lines), public/css/style.css
  (149), public/js/app.js (310), public/js/views.js (245), /data static
  mount + canonical K-record write in server/index.js (182), Pages
  workflow, LICENSE (MIT), README.md, DEMO-SCRIPT.md.
- Coordinator verified live (Python-driven server on :3108/:3109):
  / 200 with all four act labels, mock banner, motto; /api/health 200
  not-configured; /data/pool/manifest.json + /data/krecord-seed.json 200;
  /data/krecord-live.json 404 (correct — no live payment yet); /js/*.js +
  /css 200; POST /api/pay {} → 400 VALIDATION_ERROR. app.js calls
  relative api/health + api/pay + api/pay/:id/capture; views.js renders
  "Pay this invoice — $480" button, approve link, "I approved — capture
  the payment" button. pages.yml YAML valid.
- Judgement call (kept): no email for M. Okafor exists in the pool, so Act 3
  shows an empty labelled email field and refuses to pay without one —
  nothing invented.
- Note: backgrounded `node server/index.js` via nohup in this environment
  silently never starts (empty log); foreground runs fine. Use foreground
  or a process wrapper for test runs. Stale test servers (PIDs 8567/8592/
  8714/8767) killed by coordinator.

## 2026-11-09 ~18:52 — First push (commit 0a97214)
- Pushed to iamvolshi/paypal-curator main. Working tree clean.
- HELD BACK: .github/workflows/pages.yml is NOT in the push — the iamvolshi
  token has no `workflow` scope, so GitHub refuses any push containing a
  workflow file ("refusing to allow an OAuth App to create or update
  workflow without `workflow` scope"). The file still exists on disk at
  .github/workflows/pages.yml (untracked) for later — it needs a token
  with workflow scope, or Darren pushing it from his machine, or Pages
  enabled manually. Consequence: NO hosted GitHub Pages URL yet. Primary
  run path remains the local server (npm install in server/, npm start,
  http://localhost:3000).

## 2026-11-09 ~18:23 — Act 1 DONE + verified by coordinator
- Agent 1 delivered: data/pool/ 34 files (ChatGPT export JSON 36 msgs/4 convos,
  4 unpaid invoices incl. invoice-0041 $480 M. Okafor, complete Oct 28, UNPAID,
  10 chat logs, 15 notes/docs with bad names, 5 unfiled strays), manifest.json
  (242 lines, mock-data note up top), public/js/catalog.js (121 lines, pure,
  works in browser + Node).
- Coordinator verified in Node: catalogPool accounts 34/34 — Catering orders 14,
  Invoices & payments 8, Building repairs 4, Client messages 3, unfiled 5.
  Invoice-0041 confirmed: $480, M. Okafor, complete Oct 28, UNPAID.
  Judgement calls noted: export blob lands in Catering (longest thread is menu
  planning) — Act 2 splits it apart; supplier price chats land in Catering.
  Both acceptable.

## 2026-11-09 ~18:24 — Acts 2 & 4 DONE + verified by coordinator (with fixes)
- Agent 2 delivered: public/js/provenance.js (257 lines), public/js/krecord.js
  (194 lines, freeze-enforced append-only — verified: strict-mode edit throws),
  data/krecord-seed.json (20 entries Oct 12–Nov 9, mock-labelled, trust arc
  0.9 → 0.6 → 0.9, wrong-belief correction kept in the log).
- Coordinator verified against the REAL pool (agent 2 had only tested samples):
  found 2 real bugs, fixed them in provenance.js (now 309 lines, still <500):
  1. Invoice fields misread: "For:" became a bogus speaker fact; "Amount due:"
     and "Due date:" were swallowed as chat messages; "From: M. Okafor
     (contractor)" failed the payee regex (parenthesis). Fixed: multi-word
     field labels, payee paren-strip, due-date-tolerant regex, added job-
     completion facts.
  2. ChatGPT export blob produced ONE garbage fact ("Invoice ENTED is for
     $11") — no JSON parsing. Fixed: JSON-aware branch parses conversations/
     messages, 4 substantive facts per conversation with "message N" pointers.
- Re-verified: 96 facts total, 0 missing source, 0 bogus. Invoice 0041 now
  yields 4 correct facts (payable to M. Okafor / $480 / complete Oct 28 /
  due Nov 12, lines 2/4/5/6). Export yields 16 clean facts. Reports:
  Invoices 16, Building repairs 12, Client messages 9, Catering 59.
  Audit full range: 6 permissions / 5 authority / 8 beliefs / 1 payment
  (placeholder). Seed JSON pretty-printed (was single-line).

## 2026-11-09 ~23:45 — Wave 2 integration DONE + verified (integration agent)

Frontend shell built and wired (no commit — coordinator commits):
- `public/index.html` (89 lines): four stacked acts, big numbered headings,
  one-line plain labels, visible step indicator (1 SNAP ON → 2 RETRIEVE →
  3 PAY → 4 AUDIT), "SEEDED MOCK DATA" banner, footer motto
  "The sheet changes. The notes never do."
- `public/css/style.css` (149 lines): cream #faf8f5 / dark red #4a0e0e,
  Georgia headings, big type. Echoes the Curator demo palette, own layout.
- `public/js/app.js` (310 lines): state + flow. Act 1 fetches
  `data/pool/manifest.json` + all 34 file texts (relative paths, works
  served and on Pages), runs `catalogPool`, renders subject cards +
  unfiled. Act 2: click subject → `buildSubjectReport`, facts with source
  pointers, click a pointer → source viewer (file, pointer, excerpt, full
  line when it is a line pointer). Act 3: invoice parsed from the loaded
  pool facts (see below), POST /api/pay → 202 + approveUrl → approve link
  (new tab) → capture button → POST /api/pay/:orderId/capture → receipt
  card → K-record reloaded so the payment shows in Act 4. Act 4: date
  inputs (default 2026-10-26 → 2026-10-28) → loads seed + live (404 =
  empty) → `auditReport` → per-day permissions/authority/beliefs/payments
  + changedSince + motto.
- `public/js/views.js` (245 lines): all DOM rendering, split out of app.js.
  No file over ~500 lines (largest: provenance.js 309, app.js 310).

Invoice is NOT hardcoded: `parseInvoiceFromFacts` reads the extracted
facts — INV-0041, M. Okafor, $480, job complete Oct 28 2026, due Nov 12
2026, "website fixes - booking page, broken links, mobile menu" from the
invoice file's For: line. Verified in Node against the real pool (96
facts, 0 missing source).

One honest gap, handled not hidden: the invoice names M. Okafor but gives
no email address anywhere in the pool, and the server requires a valid
payeeEmail. Act 3 shows an email field (empty, labelled "PayPal needs
one") and refuses to pay without it — nothing invented. Note in README.

Server (`server/index.js`, 151 → 182 lines):
- ONE static mount added: `app.use('/data', express.static(...data))`
  (read-only; no secrets live in data/). Frontend uses relative fetches.
- K-record shape ALIGNED to canonical krecord.js:
  `{ seq, date, kind, actor, text, trust, source: { orderId, captureId } }`,
  text one plain sentence ("Paid $480 to M. Okafor for invoice INV-0041."),
  trust 1.0, seq = (max seq across seed + live) + 1. Only COMPLETED
  captures get an entry. Old belief/authority/reason blob shape removed.
  Refusal behavior untouched (SANDBOX only, no creds → honest error).
  Response now carries `kRecordSeq` (was `kRecordId`).

Docs + deploy:
- `.github/workflows/pages.yml` (valid YAML): assembles `site/` from
  public/ + `cp -r data site/data`, upload-pages-artifact + deploy-pages.
- `LICENSE` (MIT, Copyright (c) 2026 Darren Hall / VOLSHi).
- `README.md`: what it does, four acts, run steps, sandbox setup (free
  app + two accounts + two-step approve flow, detail in server/README.md),
  real-vs-seeded, repo layout, still missing (video, Devpost description,
  Darren's Join click).
- `DEMO-SCRIPT.md`: timed under-3-min script, act by act, incl. the
  "do NOT fake the payment" fallback if creds are missing on record day.

Verified by running (2026-11-09 ~23:44):
- `node --check` clean on all 6 JS files; `require()` in Node loads
  catalog/provenance/krecord/app/views cleanly; invoice parse + catalog
  (34/34: 14 catering, 8 invoices, 4 repairs, 3 client, 5 unfiled) +
  audit (default range: 1 permission, 0/0/0) + merged seed+live record
  (21 entries, seq 21, live payment lands in the Nov 9 audit day) all
  re-run against the real pool data.
- Server on PORT=3107: `/` 200 (acts + banner + motto present),
  `/api/health` → `{"ok":true,"paypal":"not-configured",...}`,
  `/data/pool/manifest.json` 200, `/data/krecord-seed.json` 200,
  `/data/krecord-live.json` 404 (correct — no capture yet),
  spaced filename (`copy of copy - menu.txt`) 200,
  js/css 200, POST /api/pay `{}` → 400 VALIDATION_ERROR,
  POST valid-shaped → 500 PAYPAL_NOT_CONFIGURED (honest, no fake).
  No `data/krecord-live.json` created — correct, no capture happened.
  (First curl batch raced the server start and returned 000s; re-run
  after listen confirmed all 200s. Server stopped afterwards.)

NOT verified from here (needs the coordinator / Darren):
- GitHub Pages deploy — workflow file is valid YAML but no push has run
  it; expected URL https://iamvolshi.github.io/paypal-curator/ is
  UNCONFIRMED until Pages is enabled and the workflow runs.
- Live create → approve → capture end to end — still blocked on sandbox
  credentials (unchanged). The new K-record write path (nextSeq +
  canonical shape) is code-reviewed only; it executes solely on a
  COMPLETED capture, which cannot happen without creds.
- The page was NOT driven in a real browser (no browser tool in this
  session) — DOM wiring verified by code + Node load only. A click-through
  in a browser is still owed before the video is recorded.
- Note: 4 older `node index.js` processes (PIDs 8567/8592/8714/8767,
  started 23:38–23:40, likely coordinator's earlier runs) were still
  alive when this agent worked; the 3107 test server (PID 9436) was
  stopped after verification. The older ones were left alone.

## Open blockers
- PayPal sandbox credentials: none available yet. Needed to test Act 3 end to end
  and to record the video. Likely needs Darren (PayPal Developer Dashboard, free
  sandbox app) or a sandbox app created for the demo.
- Hosted demo URL: DECIDED in wave 2 — GitHub Pages for the static demo
  (Acts 1, 2, 4 + Act 3 honest not-connected state); Node backend still
  needs hosting for a live Act 3 (localhost for the video for now).
