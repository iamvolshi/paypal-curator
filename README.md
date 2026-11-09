# Curator + PayPal — the agent that pays, with a receipt that can't be rewritten

**PayPal AI Hackathon 2026 entry.** Curator snaps onto a messy folder, sorts it
into subjects by what each file is actually about, answers questions with facts
that point back at their exact source line, pays an invoice for real in the
PayPal sandbox, and writes the payment into an append-only K-record — a log
where old entries are never edited, so anyone can audit later what the agent
believed, what it was allowed to do, and what it paid. The sheet changes. The
notes never do.

## The four acts

1. **SNAP ON** — "Attach data pool": 34 messy files (bad names, chat logs, a
   ChatGPT export, unpaid invoices) get sorted into subjects by content, never
   by filename. Files that fit nowhere stay unfiled — Curator never guesses.
2. **RETRIEVE** — click a subject: every fact comes with its source pointer
   (file name + "line N" / "message N"). Click a pointer to see the source
   excerpt. No source, no fact — it says "cannot answer from this record".
3. **PAY** — invoice INV-0041 ($480, M. Okafor, job complete Oct 28, due Nov 12)
   is paid through the PayPal sandbox in two steps: the server creates the
   order, you approve it as the sandbox buyer, the agent captures it and shows
   the receipt. No approval, no money moves — ever.
4. **AUDIT** — pick a date range and run the audit: each day's permissions,
   authority/trust changes, beliefs and payments, plus what changed since.
   The live payment from Act 3 appears here as a new K-record entry.

## Run it

```sh
cd server
cp ../.env.example .env   # fill in sandbox credentials (below)
npm install
npm start                 # http://localhost:3000
```

Open http://localhost:3000. Acts 1, 2 and 4 run entirely in the browser;
Act 3 needs the server.

GitHub Pages (static demo — Acts 1, 2 and 4; Act 3 shows its honest
"not connected" state there): https://iamvolshi.github.io/paypal-curator/
— live once Pages is enabled on the repo; the workflow in
`.github/workflows/pages.yml` deploys on every push to `main`.

## Sandbox credential setup (free, no card)

1. Log in at https://developer.paypal.com/ and open Apps & Credentials:
   https://developer.paypal.com/dashboard/applications — Sandbox toggle on,
   "Create App", copy the Client ID and Secret into `server/.env`.
   The order's money settles to the sandbox business account that owns these
   credentials — for the demo story, the contractor's sandbox business
   account, or one standing in for M. Okafor.
2. Create a sandbox **personal (buyer)** account at
   https://developer.paypal.com/dashboard/accounts (Sandbox > Accounts >
   Create Account > Personal) — this is the account that approves the order.
3. The two-step approve flow: `POST /api/pay` returns 202
   `AWAITING_PAYER_APPROVAL` + an `approveUrl` — open it, log in as the
   sandbox buyer, approve — then `POST /api/pay/:orderId/capture` returns the
   `COMPLETED` receipt and appends the K-record entry. Full detail:
   [`server/README.md`](server/README.md).

Sandbox only: the server refuses to run with anything but
`PAYPAL_ENVIRONMENT=SANDBOX`. There is no production path in this code.

## What is real vs seeded

- **Seeded mock data (invented, nothing real):** everything in `data/pool/`
  (34 files, all people, businesses, invoices and amounts) and
  `data/krecord-seed.json` (20 K-record entries, Oct 12 – Nov 9, including a
  labelled placeholder payment entry). The demo page says so up top.
- **Real:** the PayPal sandbox calls in Act 3 (create order → approve →
  capture) via the PayPal Agent Toolkit, and the K-record entry the server
  appends to `data/krecord-live.json` after a `COMPLETED` capture.
- **One honest gap:** the invoice names M. Okafor but gives no email address,
  and PayPal requires one — so Act 3 asks you to type the sandbox payee
  email instead of inventing one.

## Repo layout

```
public/
  index.html          the four acts, one page
  css/style.css       cream / dark-red, Georgia headings
  js/catalog.js       Act 1 — subject clustering by content
  js/provenance.js    Act 2 — facts with source pointers
  js/krecord.js       Act 4 — append-only K-record, audit report
  js/views.js         DOM rendering helpers
  js/app.js           state + act flow
data/
  pool/               34 seeded mock files + manifest.json
  krecord-seed.json   20 seeded K-record entries
  krecord-live.json   created at runtime by the server (git-ignored)
server/
  index.js            Express: static frontend + /api/pay + /data mount
  paypal.js           PayPal Agent Toolkit calls (sandbox only)
  README.md           Act 3 detail: setup, flow, limits
.github/workflows/pages.yml   GitHub Pages deploy (public/ + data/)
DEMO-SCRIPT.md        under-3-minute video script
BUILD-LOG.md          build log, verified facts, open blockers
```

## Still missing for submission

- **Video** (under 3 min) — script is in `DEMO-SCRIPT.md`; needs a live
  sandbox payment recorded end to end, which needs sandbox credentials first.
- **Devpost description** — not yet written.
- **Darren's Join click** on Devpost (submission closes Thu Nov 12, 2026,
  3:00 PM ET) — he is signed in to Devpost in his own Chrome.
- **PayPal sandbox credentials** — none exist yet in this environment; the
  live create → approve → capture flow is untested until they land.
