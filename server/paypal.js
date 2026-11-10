// server/paypal.js — pure PayPal payment module for the Curator demo (Act 3).
//
// The agent PAYS — a real sandbox transaction, via PayPal's Agent Toolkit
// (@paypal/agent-toolkit, ai-sdk flavour). No LLM is involved here: the
// toolkit's tools are plain functions, and we call their `.execute()`
// directly, deterministically.
//
// VERIFIED API (toolkit v1.11.0, github.com/paypal/agent-toolkit,
// typescript/src/shared/{functions,parameters,payloadUtils,client}.ts):
//   new PayPalAgentToolkit({ clientId, clientSecret,
//     configuration: { actions: { orders: { create, get, capture } },
//                      context: { sandbox: true } } })
//   toolkit.getTools() -> { create_order, get_order, pay_order } (ai-sdk Tools)
//   tools.create_order.execute({ currencyCode: 'USD', items: [{ name,
//     quantity, description, itemCost, itemTotal }], ... })
//       -> POST {base}/v2/checkout/orders, intent CAPTURE. Returns the raw
//          order: { id, status: 'CREATED', links: [{ rel: 'approve', ... }] }
//   tools.pay_order.execute({ id: orderId })
//       -> POST {base}/v2/checkout/orders/{id}/capture.
//          Returns { status: 'success', response: <order> }; the capture
//          lives at order.purchase_units[0].payments.captures[0].
//   tools.get_order.execute({ id: orderId }) -> GET /v2/checkout/orders/{id}
//
// TWO HARD LIMITS OF THE TOOLKIT, READ BEFORE YOU DEMO:
//   1. Capture needs payer approval. A fresh order is CREATED, not
//      APPROVED, and PayPal answers capture with 422 ORDER_NOT_APPROVED.
//      The toolkit has no approve step — approval happens when the payer
//      opens the order's `approve` link in a browser and logs in with a
//      sandbox buyer account. So paying is two steps:
//        payInvoice()  -> creates the order, returns AWAITING_PAYER_APPROVAL
//                         with approveUrl (and tries the capture once, so a
//                         re-run after approval completes in one call).
//        captureOrder() -> captures an APPROVED order, returns the receipt.
//      No money moves until the capture succeeds. Nothing here ever fakes
//      a success: a pending order is reported pending, errors are errors.
//   2. create_order has NO payee field. The order's funds settle to the
//      sandbox merchant account that owns PAYPAL_CLIENT_ID/SECRET, and
//      currencyCode is USD-only in the tool's schema. `payeeEmail` is kept
//      on the invoice line item, the receipt and the K-record, but to have
//      the money land in the contractor's sandbox account, the REST-app
//      credentials in .env must belong to that contractor's sandbox
//      business account (see server/README.md). Directing a payment to an
//      arbitrary payee email is the Payouts API, which is NOT in the toolkit.
//
// SANDBOX ONLY. initPaypal() refuses to run unless PAYPAL_ENVIRONMENT is
// SANDBOX (or unset, which defaults to SANDBOX). There is no production
// path in this file.

import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';

export class PayPalError extends Error {
  constructor(message, { code = 'PAYPAL_ERROR', status = 502, details = null } = {}) {
    super(message);
    this.name = 'PayPalError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// The toolkit sets no HTTP timeout of its own (its SDK client uses
// timeout: 0), so a hung PayPal endpoint would hang the request forever.
// Guard every tool call so the server always answers.
const timeoutMs = Number(process.env.PAYPAL_TIMEOUT_MS || 30000);

let cached = null;

function readConfig() {
  const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const environment = (process.env.PAYPAL_ENVIRONMENT || 'SANDBOX').trim().toUpperCase();
  return { clientId, clientSecret, environment };
}

export function isPayPalConfigured() {
  const { clientId, clientSecret, environment } = readConfig();
  if (!clientId || !clientSecret) return 'not-configured';
  if (environment !== 'SANDBOX') return 'refused-production';
  return 'sandbox';
}

// Build (once) the toolkit with only the three order tools enabled.
export function initPaypal() {
  if (cached) return cached;
  const { clientId, clientSecret, environment } = readConfig();
  if (!clientId || !clientSecret) {
    throw new PayPalError(
      'PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in server/.env (see .env.example).',
      { code: 'PAYPAL_NOT_CONFIGURED', status: 500 },
    );
  }
  if (environment !== 'SANDBOX') {
    throw new PayPalError(
      `Refusing to run: PAYPAL_ENVIRONMENT is "${environment}". This demo only ever runs against the PayPal SANDBOX — never production, never real money.`,
      { code: 'PAYPAL_ENVIRONMENT_REFUSED', status: 500 },
    );
  }
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: { orders: { create: true, get: true, capture: true } },
      context: { sandbox: true },
    },
  });
  cached = { toolkit, tools: toolkit.getTools(), environment: 'sandbox' };
  return cached;
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new PayPalError(
        `${label} timed out after ${timeoutMs}ms — the PayPal sandbox did not answer. Check the network, then retry; no money moved.`,
        { code: 'PAYPAL_TIMEOUT', status: 504 },
      )),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The toolkit's tool runner (shared `run()`) does NOT throw on failure:
// it resolves with an error payload instead. Two shapes, both resolved:
//   - PayPal API errors (axios -> handleAxiosError -> LlmError, which has
//     a toJSON): { ok: false, status: <http>, code: 'PAYPAL_API_HTTP_ERROR',
//     message: "<PayPal message>: <detail descriptions>" } (message capped
//     at 200 chars).
//   - Anything else (e.g. getAccessToken throwing on bad credentials):
//     { error: { message, type: 'paypal_error' } }.
// Success resolves with the raw PayPal object (create_order) or
// { status: 'success', response: <order> } (pay_order). Every tool call
// below is unwrapped through unwrapToolResult() — a resolved error payload
// must NEVER be mistaken for a result.
function unwrapToolResult(result, fallback) {
  // The tool runner JSON-stringifies everything it returns (run() returns
  // JSON.stringify(...)), so success AND error payloads arrive as strings.
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result);
    } catch {
      throw new PayPalError(`${fallback}: PayPal returned a response that could not be read.`, {
        code: 'PAYPAL_UNEXPECTED_RESPONSE', status: 502, details: result,
      });
    }
  }
  if (!result || typeof result !== 'object') {
    throw new PayPalError(`${fallback}: PayPal returned an unexpected response.`, {
      code: 'PAYPAL_UNEXPECTED_RESPONSE', status: 502, details: result ?? null,
    });
  }
  if (result.error && typeof result.error === 'object') {
    throw new PayPalError(`${fallback}: ${result.error.message || 'Unknown error'}`, {
      code: 'PAYPAL_ERROR', status: 502, details: result.error,
    });
  }
  if (result.ok === false) {
    throw new PayPalError(`${fallback}: ${result.message || 'Unknown error'}`, {
      code: result.code || 'PAYPAL_API_HTTP_ERROR',
      status: Number(result.status) || 502,
      details: result,
    });
  }
  return result;
}

// For the rare case a tool call actually throws (timeout guard, zod
// validation of our own params): normalize a thrown error the same way.
function parseToolkitError(error, fallback) {
  if (error instanceof PayPalError) return error;
  const message = (error && error.message) || String(error) || fallback;
  const status = (error && Number(error.status)) || 502;
  const code = (error && error.code) || 'PAYPAL_ERROR';
  const details = (error && (error.details || error.data)) || null;
  return new PayPalError(`${fallback}: ${message}`, { code, status, details });
}

function isNotApproved(error) {
  const haystack = [
    error && error.message,
    error && error.code,
    error && error.details ? JSON.stringify(error.details) : '',
  ].join(' ');
  return /ORDER_NOT_APPROVED|not (yet )?approved/i.test(haystack);
}

function approveUrlOf(order) {
  const links = (order && order.links) || [];
  const link = links.find((l) => l && l.rel === 'approve')
    || links.find((l) => l && l.rel === 'payer-action');
  return (link && link.href) || null;
}

function captureOf(order) {
  const units = (order && order.purchase_units) || [];
  const payments = (units[0] && units[0].payments) || {};
  return ((payments.captures || [])[0]) || null;
}

function moneyOf(order) {
  const amount = (order && order.purchase_units && order.purchase_units[0] && order.purchase_units[0].amount) || {};
  return { amount: amount.value || null, currency: amount.currency_code || null };
}

function toReceipt({ order, capture, payeeEmail, invoiceId, description }) {
  const money = moneyOf(order);
  return {
    orderId: order.id,
    captureId: capture ? capture.id : null,
    status: capture ? (capture.status || 'COMPLETED') : order.status,
    amount: capture && capture.amount ? capture.amount.value : money.amount,
    currency: capture && capture.amount ? capture.amount.currency_code : money.currency,
    payee: payeeEmail || null,
    invoiceId: invoiceId || null,
    description: description || null,
    createdAt: (capture && capture.create_time) || order.create_time || new Date().toISOString(),
    paypalLinks: order.links || [],
  };
}

async function executeCapture(tools, orderId) {
  let result;
  try {
    const raw = await withTimeout(
      tools.pay_order.execute({ id: orderId }),
      `pay_order ${orderId}`,
    );
    result = unwrapToolResult(raw, 'PayPal capture failed');
  } catch (error) {
    throw parseToolkitError(error, 'PayPal capture failed');
  }
  // The tool returns { status: 'success', response: <order> } on 2xx.
  const order = (result && result.response) || result;
  if ((result && result.status === 'error') || !order || !order.id) {
    throw new PayPalError('PayPal capture returned an unexpected response (no order).', {
      code: 'PAYPAL_CAPTURE_UNEXPECTED', status: 502, details: result || null,
    });
  }
  const capture = captureOf(order);
  if (!capture || !capture.id) {
    throw new PayPalError('PayPal capture returned no capture id — no payment was recorded.', {
      code: 'PAYPAL_CAPTURE_NO_ID', status: 502, details: order,
    });
  }
  return { order, capture };
}

async function fetchApproveUrl(tools, orderId) {
  try {
    const raw = await withTimeout(
      tools.get_order.execute({ id: orderId }),
      `get_order ${orderId}`,
    );
    const order = unwrapToolResult(raw, 'PayPal order lookup failed');
    return approveUrlOf(order);
  } catch {
    return null;
  }
}

function validatePaymentInput({ payeeEmail, amount, currency, description, invoiceId }) {
  if (!payeeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payeeEmail))) {
    throw new PayPalError('payeeEmail is required and must be an email address.', {
      code: 'VALIDATION_ERROR', status: 400,
    });
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new PayPalError('amount is required and must be a number greater than 0.', {
      code: 'VALIDATION_ERROR', status: 400,
    });
  }
  if (String(currency || 'USD').toUpperCase() !== 'USD') {
    throw new PayPalError(
      `currency "${currency}" is not supported: the PayPal Agent Toolkit create_order tool only accepts USD.`,
      { code: 'VALIDATION_ERROR', status: 400 },
    );
  }
  if (!description || typeof description !== 'string') {
    throw new PayPalError('description is required.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  if (!invoiceId || typeof invoiceId !== 'string') {
    throw new PayPalError('invoiceId is required.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  return Math.round(value * 100) / 100;
}

// Create a sandbox order for the invoice, then try to capture it.
// A fresh order is CREATED, not APPROVED, so the first capture attempt
// normally answers ORDER_NOT_APPROVED — that is reported honestly as
// AWAITING_PAYER_APPROVAL (with the approve link), never as a payment.
// After the sandbox buyer approves, captureOrder() completes the payment.
export async function payInvoice({ payeeEmail, amount, currency = 'USD', description, invoiceId, returnUrl, cancelUrl }) {
  const rounded = validatePaymentInput({ payeeEmail, amount, currency, description, invoiceId });
  const { tools } = initPaypal();

  const itemName = `Invoice ${invoiceId}`.slice(0, 127);
  const itemDescription = `${description} — payee ${payeeEmail}`.slice(0, 127);

  let order;
  try {
    const created = await withTimeout(
      tools.create_order.execute({
        currencyCode: 'USD',
        items: [{ name: itemName, description: itemDescription, quantity: 1, itemCost: rounded, itemTotal: rounded }],
        ...(returnUrl ? { returnUrl } : {}),
        ...(cancelUrl ? { cancelUrl } : {}),
      }),
      'create_order',
    );
    order = unwrapToolResult(created, 'PayPal order creation failed');
  } catch (error) {
    throw parseToolkitError(error, 'PayPal order creation failed');
  }
  if (!order || !order.id) {
    throw new PayPalError('PayPal created an order but returned no order id.', {
      code: 'PAYPAL_ORDER_NO_ID', status: 502, details: order || null,
    });
  }

  const approveUrl = approveUrlOf(order);
  try {
    const { order: capturedOrder, capture } = await executeCapture(tools, order.id);
    return toReceipt({ order: capturedOrder, capture, payeeEmail, invoiceId, description });
  } catch (error) {
    if (isNotApproved(error)) {
      return {
        orderId: order.id,
        captureId: null,
        status: 'AWAITING_PAYER_APPROVAL',
        amount: rounded.toFixed(2),
        currency: 'USD',
        payee: payeeEmail,
        invoiceId,
        description,
        createdAt: order.create_time || new Date().toISOString(),
        approveUrl,
        paypalLinks: order.links || [],
        message: 'Order created in the PayPal sandbox. No money has moved yet: open approveUrl as the sandbox buyer to approve it, then capture it with POST /api/pay/:orderId/capture.',
      };
    }
    throw error;
  }
}

// Capture an APPROVED sandbox order and return the payment receipt.
// Throws PayPalError ORDER_NOT_APPROVED (HTTP 409) with the approve link
// if the payer has not approved yet — never a fake receipt.
export async function captureOrder(orderId, { payeeEmail = null, invoiceId = null, description = null } = {}) {
  if (!orderId || typeof orderId !== 'string') {
    throw new PayPalError('orderId is required.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  const { tools } = initPaypal();
  try {
    const { order, capture } = await executeCapture(tools, orderId);
    return toReceipt({ order, capture, payeeEmail, invoiceId, description });
  } catch (error) {
    if (isNotApproved(error)) {
      const approveUrl = await fetchApproveUrl(tools, orderId);
      throw new PayPalError(
        'Order is not approved by the payer yet — no money has moved. Open the approve link as the sandbox buyer, then retry the capture.',
        { code: 'ORDER_NOT_APPROVED', status: 409, details: { orderId, approveUrl, status: 'AWAITING_PAYER_APPROVAL' } },
      );
    }
    throw error;
  }
}

// Read-only status check for an order (for the frontend's polling).
export async function getOrderStatus(orderId) {
  if (!orderId || typeof orderId !== 'string') {
    throw new PayPalError('orderId is required.', { code: 'VALIDATION_ERROR', status: 400 });
  }
  const { tools } = initPaypal();
  let order;
  try {
    const raw = await withTimeout(
      tools.get_order.execute({ id: orderId }),
      `get_order ${orderId}`,
    );
    order = unwrapToolResult(raw, 'PayPal order lookup failed');
  } catch (error) {
    throw parseToolkitError(error, 'PayPal order lookup failed');
  }
  const money = moneyOf(order);
  return {
    orderId: order.id,
    status: order.status,
    amount: money.amount,
    currency: money.currency,
    createdAt: order.create_time || null,
    approveUrl: approveUrlOf(order),
    paypalLinks: order.links || [],
  };
}
