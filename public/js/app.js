// app.js — state + act flow for the Curator demo.
// Act 1 loads the pool and catalogs it. Act 2 shows a subject report with
// source pointers. Act 3 pays invoice INV-0041 through the server (PayPal
// sandbox, two steps, approval in between). Act 4 audits the K-record.
//
// Nothing is faked: if the PayPal sandbox is not connected, Act 3 says so.
// Invoice numbers come from the loaded pool facts, never from constants
// in this file. Browser entry point; pure helpers are exported for Node
// tests (guarded so requiring this file in Node does not touch the DOM).
'use strict';

/* global catalogPool, extractFacts, buildSubjectReport, loadRecord,
   auditReport, renderSubjects, markSelectedSubject, renderUnfiled,
   renderReport, renderSource, renderInvoice, renderPaypalNotice,
   renderAwaiting, renderReceipt, setPayError, renderAudit, setActiveStep */

var state = {
  files: [],
  filesById: {},
  catalog: null,
  facts: [],
  factsById: {},
  invoice: null,
  paypal: 'unknown', // 'sandbox' | 'not-configured' | 'refused-production' | 'unreachable'
  order: null,
  receipt: null,
  krecord: null,
  auditShown: false,
};

// --- Pure helpers (also Node-tested) ---------------------------------------

// Pull the INV-0041 invoice out of the extracted facts. The facts carry
// the payee, the amount, the due date and the job-complete date — each
// with its source line. Returns null when the pool does not support it.
function parseInvoiceFromFacts(facts, filesById) {
  var amountFact = null, payeeFact = null, dueFact = null, completeFact = null;
  (facts || []).forEach(function (f) {
    var m;
    if (!amountFact && (m = /Invoice (\S+) is for \$([\d,]+(?:\.\d{2})?)/.exec(f.text))) {
      amountFact = { number: m[1], amount: Number(m[2].replace(/,/g, '')), fact: f };
    }
    if (!payeeFact && (m = /Invoice \S+ is payable to (.+)\./.exec(f.text))) payeeFact = m[1];
    if (!dueFact && (m = /Invoice \S+ is due (.+)\./.exec(f.text))) dueFact = m[1];
    if (!completeFact && (m = /Invoice \S+ job marked complete (.+)\./.exec(f.text))) completeFact = m[1];
  });
  if (!amountFact || !payeeFact) return null;
  // The "For:" line (what the work was) lives in the same invoice file.
  var description = '';
  var file = filesById && filesById[amountFact.fact.source.fileId];
  var text = file ? (file.text || file.content || '') : '';
  var dm = /^For:\s*(.+)$/m.exec(text);
  if (dm) description = dm[1].trim();
  return {
    id: 'INV-' + amountFact.number,
    number: amountFact.number,
    payee: payeeFact,
    amount: amountFact.amount,
    currency: 'USD',
    description: description,
    due: dueFact,
    complete: completeFact,
  };
}

// Merge the seed record with the live ledger (server-written, canonical
// shape). A missing live file (404) is empty, never an error.
function mergeKRecordData(seedData, liveData) {
  var entries = [];
  if (seedData && Array.isArray(seedData.entries)) entries = entries.concat(seedData.entries);
  if (Array.isArray(liveData)) entries = entries.concat(liveData);
  else if (liveData && Array.isArray(liveData.entries)) entries = entries.concat(liveData.entries);
  entries.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
  return loadRecord({ version: 1, entries: entries });
}

// --- Small fetch helpers ----------------------------------------------------

async function fetchJson(path) {
  var res = await fetch(path);
  if (!res.ok) throw new Error('GET ' + path + ' -> HTTP ' + res.status);
  return res.json();
}

async function fetchText(path) {
  var res = await fetch(path);
  if (!res.ok) throw new Error('GET ' + path + ' -> HTTP ' + res.status);
  return res.text();
}

// --- Act 1: attach + catalog -----------------------------------------------

async function attachPool() {
  var status = document.getElementById('act1-status');
  var btn = document.getElementById('attach-btn');
  btn.disabled = true;
  status.textContent = 'Reading the pool…';
  try {
    var manifest = await fetchJson('data/pool/manifest.json');
    var files = [];
    for (var i = 0; i < manifest.files.length; i++) {
      var meta = manifest.files[i];
      var text = await fetchText(encodeURI(meta.path));
      files.push({ id: meta.id, name: meta.name, kind: meta.kind, date: meta.date, text: text });
    }
    state.files = files;
    state.filesById = {};
    files.forEach(function (f) { state.filesById[f.id] = f; });
    state.catalog = catalogPool(files);
    state.facts = extractFacts(files, state.catalog);
    state.facts.forEach(function (f) { state.factsById[f.id] = f; });
    state.invoice = parseInvoiceFromFacts(state.facts, state.filesById);

    renderSubjects(document.getElementById('subjects'), state.catalog, selectSubject);
    renderUnfiled(document.getElementById('unfiled'), state.catalog.unfiled, state.filesById);
    status.textContent = state.catalog.totalFiles + ' files in. ' +
      state.catalog.subjects.length + ' subjects, ' +
      state.catalog.unfiled.length + ' unfiled. ' +
      state.facts.length + ' facts, every one with a source. Click a subject.';
    document.getElementById('act2-hint').textContent =
      'Pool attached. Click a subject card above to see what Curator knows about it.';
    setActiveStep(2);
    renderInvoiceCard();
  } catch (error) {
    status.textContent = 'Could not load the data pool: ' + error.message;
    status.classList.add('error');
    btn.disabled = false;
  }
}

// --- Act 2: retrieve ---------------------------------------------------------

function selectSubject(subjectId) {
  if (!state.catalog) return;
  var subject = null;
  state.catalog.subjects.forEach(function (s) { if (s.id === subjectId) subject = s; });
  if (!subject) return;
  markSelectedSubject(document.getElementById('subjects'), subjectId);
  var report = buildSubjectReport(subject, state.facts, state.files);
  renderReport(document.getElementById('report'), report, showSource);
  document.getElementById('source-viewer').hidden = true;
  document.getElementById('act2-hint').textContent =
    report.name + ': ' + report.facts.length + ' facts. Click any source pointer to see where it came from.';
  setActiveStep(2);
  document.getElementById('act2').scrollIntoView({ behavior: 'smooth' });
}

function showSource(factId) {
  var fact = state.factsById[factId];
  if (!fact) return;
  var file = state.filesById[fact.source.fileId];
  renderSource(
    document.getElementById('source-viewer'), fact, file ? (file.text || '') : '');
}

// --- Act 3: pay --------------------------------------------------------------

async function checkHealth() {
  var status = document.getElementById('act3-status');
  try {
    var health = await fetchJson('api/health');
    state.paypal = health.paypal || 'not-configured';
  } catch (error) {
    state.paypal = 'unreachable';
  }
  if (state.paypal === 'sandbox') {
    status.textContent = 'PayPal sandbox is connected. Real sandbox payment — fake money, real API calls.';
  } else {
    status.textContent = '';
    renderPaypalNotice(document.getElementById('payment'), state.paypal);
  }
  renderInvoiceCard();
}

function renderInvoiceCard() {
  var box = document.getElementById('invoice');
  if (!state.invoice) {
    if (state.catalog) {
      box.innerHTML = '<p class="status">No payable invoice was found in the pool facts — ' +
        'nothing to pay, and nothing is invented to fill the gap.</p>';
    }
    return;
  }
  renderInvoice(box, state.invoice, state.paypal, payInvoice);
}

async function payInvoice(payeeEmail) {
  var box = document.getElementById('invoice');
  if (!payeeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payeeEmail)) {
    setPayError(box, 'Type a payee email first — PayPal will not take a payment without one.');
    return;
  }
  var inv = state.invoice;
  setPayError(box, 'Creating the sandbox order…');
  try {
    var res = await fetch('api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId: inv.id, payeeEmail: payeeEmail, amount: inv.amount,
        currency: inv.currency, description: inv.description || ('Invoice ' + inv.id),
      }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error((data && (data.error || data.code)) || ('HTTP ' + res.status));
    if (data.status === 'COMPLETED' && data.captureId) {
      state.receipt = data;
      renderReceipt(document.getElementById('payment'), data);
      await reloadKRecord();
      return;
    }
    if (data.status === 'AWAITING_PAYER_APPROVAL' && data.approveUrl) {
      state.order = data;
      renderAwaiting(document.getElementById('payment'), data, capturePayment);
      setActiveStep(3);
      return;
    }
    throw new Error('Unexpected payment response: ' + JSON.stringify(data));
  } catch (error) {
    setPayError(box, 'Payment failed honestly: ' + error.message + ' No money moved.');
  }
}

async function capturePayment() {
  var box = document.getElementById('payment');
  if (!state.order) return;
  var inv = state.invoice;
  try {
    var res = await fetch('api/pay/' + encodeURIComponent(state.order.orderId) + '/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payeeEmail: state.order.payee || null,
        invoiceId: inv ? inv.id : null,
        description: inv ? inv.description : null,
      }),
    });
    var data = await res.json();
    if (!res.ok) {
      var hint = (data && data.code === 'ORDER_NOT_APPROVED')
        ? ' The order is not approved yet — open the approve link above first.'
        : '';
      throw new Error((data && (data.error || data.code)) || ('HTTP ' + res.status) + '.' + hint);
    }
    state.receipt = data;
    renderReceipt(box, data);
    await reloadKRecord();
    setActiveStep(4);
  } catch (error) {
    setPayError(box, 'Capture failed honestly: ' + error.message + ' No money moved.');
  }
}

// --- Act 4: audit ------------------------------------------------------------

async function loadKRecord() {
  var seed = await fetchJson('data/krecord-seed.json');
  var live = [];
  try { live = await fetchJson('data/krecord-live.json'); } catch (error) { live = []; }
  state.krecord = mergeKRecordData(seed, live);
  return state.krecord;
}

async function reloadKRecord() {
  try { await loadKRecord(); } catch (error) { /* audit will report it on run */ }
  if (state.auditShown) runAudit();
}

async function runAudit() {
  var status = document.getElementById('act4-status');
  var from = document.getElementById('audit-from').value;
  var to = document.getElementById('audit-to').value;
  status.textContent = 'Reading the K-record…';
  try {
    await loadKRecord();
    var report = auditReport(state.krecord, from, to);
    renderAudit(document.getElementById('audit'), report);
    status.textContent = 'K-record entries ' + from + ' to ' + to +
      (state.receipt ? ' — including the live payment just captured in Act 3.' : '.');
    state.auditShown = true;
    setActiveStep(4);
  } catch (error) {
    status.textContent = 'Could not load the K-record: ' + error.message;
    status.classList.add('error');
  }
}

// --- Boot --------------------------------------------------------------------

function init() {
  document.getElementById('attach-btn').addEventListener('click', attachPool);
  document.getElementById('audit-btn').addEventListener('click', runAudit);
  Array.prototype.forEach.call(document.querySelectorAll('.steps a'), function (a) {
    a.addEventListener('click', function () { setActiveStep(Number(a.dataset.step)); });
  });
  setActiveStep(1);
  checkHealth();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseInvoiceFromFacts: parseInvoiceFromFacts, mergeKRecordData: mergeKRecordData };
}
