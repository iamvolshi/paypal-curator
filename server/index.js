// server/index.js — small Express server for the Curator demo, Act 3.
//
// Serves the static frontend from public/ (built by another agent) and
// exposes the payment API. Every successful capture is appended as a
// K-record entry to data/krecord-live.json — append-only: past entries are
// never rewritten, only pushed onto. The file is created if missing.
//
//   POST /api/pay                  { invoiceId, payeeEmail, amount,
//                                    currency?, description? }
//                                  -> 200 receipt (COMPLETED, K-record
//                                     written) or 202 AWAITING_PAYER_APPROVAL
//                                     (no money moved, no K-record yet)
//   POST /api/pay/:orderId/capture { payeeEmail?, invoiceId?, ... }
//                                  -> 200 receipt, or 409 ORDER_NOT_APPROVED
//   GET  /api/order/:orderId       -> order status (for frontend polling)
//   GET  /api/health               -> { ok, paypal, time }
//
// K-record entries use the canonical krecord.js shape:
//   { seq, date, kind, actor, text, trust, source: { orderId, captureId } }
// seq continues from the highest seq in data/krecord-seed.json +
// data/krecord-live.json. Only COMPLETED captures get an entry.
//
// PayPal errors are returned honestly (502/409/500 with PayPal's message);
// a payment is only ever reported when PayPal returns a capture id.

import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureOrder, getOrderStatus, initPaypal, isPayPalConfigured, PayPalError, payInvoice } from './paypal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/.env wins; repo-root .env is the fallback (dotenv never overwrites).
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const KRECORD_PATH = path.join(__dirname, '..', 'data', 'krecord-live.json');
const KRECORD_SEED_PATH = path.join(__dirname, '..', 'data', 'krecord-seed.json');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
// Read-only mount so the frontend can fetch the seeded pool + K-record
// with relative paths (data/pool/manifest.json, data/krecord-seed.json,
// data/krecord-live.json). No secrets live under data/.
app.use('/data', express.static(path.join(__dirname, '..', 'data')));

// Append-only K-record: read the array, push one entry, write it back.
// A corrupt file fails loudly instead of clobbering the ledger.
async function appendKRecord(entry) {
  await fs.promises.mkdir(path.dirname(KRECORD_PATH), { recursive: true });
  let records = [];
  try {
    const raw = await fs.promises.readFile(KRECORD_PATH, 'utf8');
    records = JSON.parse(raw);
    if (!Array.isArray(records)) throw new Error('krecord file is not a JSON array');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  records.push(entry);
  await fs.promises.writeFile(KRECORD_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  return entry;
}

// Highest seq across the seed record and the live ledger, so the next
// entry continues the numbering instead of restarting it.
async function readSeqs(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const entries = Array.isArray(data) ? data : (data.entries || []);
    return entries.map((e) => Number(e.seq) || 0);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function nextSeq() {
  const seed = await readSeqs(KRECORD_SEED_PATH);
  const live = await readSeqs(KRECORD_PATH);
  return Math.max(0, ...seed, ...live) + 1;
}

// Canonical krecord.js entry shape: { seq, date, kind, actor, text,
// trust, source? }. One plain sentence, no belief/authority/reason
// blobs — the record is the receipt, not the reasoning.
function kRecordEntry(receipt) {
  const amount = Number(receipt.amount);
  const shown = Number.isFinite(amount)
    ? (Number.isInteger(amount) ? String(amount) : amount.toFixed(2))
    : String(receipt.amount);
  return {
    seq: 0, // filled in by finishPayment from nextSeq()
    date: new Date().toISOString().slice(0, 10),
    kind: 'payment',
    actor: 'curator-agent',
    text: `Paid $${shown} to ${receipt.payee || 'the payee'} for invoice ${receipt.invoiceId || 'unknown'}.`,
    trust: 1.0,
    source: { orderId: receipt.orderId, captureId: receipt.captureId },
  };
}

function httpStatus(error) {
  const status = Number(error && error.status);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

function errorBody(error) {
  const body = { error: (error && error.message) || 'Internal error', code: (error && error.code) || 'INTERNAL_ERROR' };
  if (error && error.details) body.details = error.details;
  return body;
}

// Shared by both payment endpoints: on a COMPLETED capture, write the
// K-record and return the receipt; otherwise pass the result through.
// Only COMPLETED captures get a K-record entry — nothing else.
async function finishPayment(receipt, res) {
  if (receipt.status !== 'COMPLETED') return res.status(202).json(receipt);
  const entry = kRecordEntry(receipt);
  entry.seq = await nextSeq();
  await appendKRecord(entry);
  return res.json({ ...receipt, kRecordSeq: entry.seq });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, paypal: isPayPalConfigured(), time: new Date().toISOString() });
});

app.post('/api/pay', async (req, res) => {
  const { invoiceId, payeeEmail, amount, currency, description, returnUrl, cancelUrl } = req.body || {};
  try {
    const receipt = await payInvoice({ payeeEmail, amount, currency, description, invoiceId, returnUrl, cancelUrl });
    return await finishPayment(receipt, res);
  } catch (error) {
    return res.status(httpStatus(error)).json(errorBody(error));
  }
});

app.post('/api/pay/:orderId/capture', async (req, res) => {
  const { payeeEmail, invoiceId, description } = req.body || {};
  try {
    const receipt = await captureOrder(req.params.orderId, { payeeEmail, invoiceId, description });
    return await finishPayment(receipt, res);
  } catch (error) {
    return res.status(httpStatus(error)).json(errorBody(error));
  }
});

app.get('/api/order/:orderId', async (req, res) => {
  try {
    return res.json(await getOrderStatus(req.params.orderId));
  } catch (error) {
    return res.status(httpStatus(error)).json(errorBody(error));
  }
});

app.get('/', (_req, res) => {
  res.json({ service: 'paypal-curator', act: 3, paypal: isPayPalConfigured(), time: new Date().toISOString() });
});

app.use((error, _req, res, _next) => {
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'VALIDATION_ERROR' });
  }
  return res.status(500).json({ error: 'Internal error.', code: 'INTERNAL_ERROR' });
});

app.listen(PORT, () => {
  // Fail fast with a readable message if the PayPal config is unusable;
  // the server still listens so /api/health can report not-configured.
  try {
    initPaypal();
    console.log(`paypal-curator server listening on http://localhost:${PORT} (PayPal sandbox configured)`);
  } catch (error) {
    const message = error instanceof PayPalError ? error.message : String(error);
    console.log(`paypal-curator server listening on http://localhost:${PORT} — PayPal NOT configured: ${message}`);
  }
});
