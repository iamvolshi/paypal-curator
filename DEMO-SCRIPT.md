# DEMO SCRIPT — Curator + PayPal (under 3 minutes)

One take, screen recording with voiceover. No cuts inside an act if you can
help it. Total: 2:45–3:00. The demo runs at http://localhost:3000 with the
server on and sandbox credentials loaded — Act 3 needs the live server.

## 0:00–0:15 — Hook

Show the messy pool folder (bad filenames: `final_v2_REAL.pdf.txt`,
`copy of copy - menu.txt`, `asdf.txt`, `untitled (1).txt`).

> "This folder is a mess. Watch Curator snap onto it."

Click over to the demo page. The four steps are visible at the top:
1 SNAP ON, 2 RETRIEVE, 3 PAY, 4 AUDIT.

## 0:15–0:50 — Act 1: Snap on (35s)

> "Thirty-four files. No folders, no labels worth trusting. One button."

Click **Add folder** and pick the `data/pool` folder — or click **Use the demo folder**. The folder name shows on the page, then the subject cards appear.

> "Curator read every file and sorted it by what it's about — not the
> filename. Invoices and payments, building repairs, client messages,
> catering orders. Five files fit nowhere, so they stay unfiled. Curator
> doesn't guess."

Point at the counts: 14 catering, 8 invoices, 4 repairs, 3 client
messages, 5 unfiled.

## 0:50–1:20 — Act 2: Retrieve (30s)

Click **Invoices & payments**.

> "Now ask it something. Every fact it gives you points back at the exact
> line it came from."

Read one fact aloud, then click its source pointer. The source viewer opens
with the file name, the line number and the quote.

> "Invoice 0041 is for $480. There it is — line 4 of the invoice. If it
> can't point at a source, it says so. It never makes one up."

## 1:20–2:05 — Act 3: Pay (45s)

Scroll to Act 3. The invoice card is already filled in from the facts:
INV-0041, M. Okafor, $480, job complete Oct 28, due Nov 12.

> "The job's done, the invoice is due. The agent pays it — for real, in
> the PayPal sandbox."

The payee email is already filled in — it is only a label on the receipt —
so just click **Pay this invoice**. The order is created; nothing has moved yet.

> "PayPal won't let an agent take money nobody approved. So approve it."

Open the **Approve in PayPal sandbox** link in a new tab, log in as the
sandbox buyer, approve. Back on the demo, click **I approved — capture
the payment**. The receipt appears: order id, capture id, COMPLETED, $480.

> "Money moved. And look — the receipt is already on the record."

## 2:05–2:45 — Act 4: Audit (40s)

Scroll to Act 4. Dates are already set: Oct 26 to Oct 28.

> "Now audit it. Pick a date range — what was the agent allowed to do,
> how much was it trusted, what did it believe, what did it pay?"

Click **Run audit**. The day cards appear.

> "Oct 27: permission granted to write summaries — but only from facts
> with a source. And the payment from thirty seconds ago is already here,
> as a new entry. The old entries? Untouched."

Point at the wrong-belief correction in the seed range if time allows:
Oct 21, the agent matched an invoice to the wrong payee, trust dropped,
the wrong belief stays in the log with its date.

## 2:45–3:00 — Close (15s)

Back to the top of the page, the motto in the footer.

> "The sheet changes. The notes never do. Curator — it organises your
> mess, pays your invoices, and keeps the receipt."

End card: repo URL (github.com/iamvolshi/paypal-curator) + "PayPal AI
Hackathon 2026 — sandbox only, no real money."

## If the sandbox is not connected on recording day

Do NOT fake the payment. Record Acts 1, 2 and 4 live, and for Act 3 show
the honest notice on screen ("PayPal sandbox is not connected") and say
so in one line — then record Act 3 separately once credentials land.
A missing payment is a gap; a faked one kills the entry.
