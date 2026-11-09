# Act 3 — the agent pays (PayPal sandbox)

Curator's agent pays an invoice for real in the PayPal sandbox, via the
PayPal Agent Toolkit (`@paypal/agent-toolkit@1.11.0`, `ai-sdk` flavour).
No LLM is involved at payment time: the server calls the toolkit tools'
`.execute()` directly — `create_order`, then `pay_order` (capture).

## Run it

```sh
cd server
cp ../.env.example .env   # fill in sandbox credentials, see below
npm install
npm start                 # http://localhost:3000
```

## Demo flow (two steps — PayPal requires both)

PayPal Orders v2 will not let an agent capture an order nobody approved.
The toolkit has no approve step; approval is one click in a browser.

1. `POST /api/pay` with `{ invoiceId, payeeEmail, amount, currency: "USD",
   description }` — creates the sandbox order. Returns **202** with
   `status: "AWAITING_PAYER_APPROVAL"` and an `approveUrl`. No money moves.
2. Open `approveUrl` in a browser, log in with the **sandbox buyer**
   (personal) account, click approve.
3. `POST /api/pay/:orderId/capture` — captures the approved order. Returns
   **200** with `{ orderId, captureId, status: "COMPLETED", ... }` and the
   server appends the payment as a K-record entry to
   `data/krecord-live.json`. `GET /api/order/:orderId` polls the status.

If step 3 runs before approval it answers **409 `ORDER_NOT_APPROVED`**
with the approve link — never a fake receipt.

## Sandbox accounts you need (free, no card)

- **Merchant (receives the money):** the REST-app credentials in `.env`
  must belong to the sandbox **business** account that should receive the
  payment — for the demo story, the contractor's account (or one standing
  in for M. Okafor). Create the app at
  https://developer.paypal.com/dashboard/applications (Sandbox toggle on).
- **Buyer (approves and pays):** a sandbox **personal** account with fake
  funds, created at https://developer.paypal.com/dashboard/accounts
  (Sandbox > Accounts > Create Account > Personal).

## Notes

- Sandbox only: the server refuses to run if `PAYPAL_ENVIRONMENT` is
  anything but `SANDBOX`. No production path exists in this code.
- The toolkit's `create_order` only accepts USD and has no payee field —
  funds settle to the credentialed merchant account. `payeeEmail` is kept
  on the invoice line item, the receipt, and the K-record.
- `GET /api/health` reports `{ ok, paypal: "sandbox" | "not-configured"
  | "refused-production", time }` without calling PayPal.
