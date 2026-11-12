// views.js — DOM rendering helpers for the Curator demo.
// No state, no fetching, no PayPal calls: app.js owns the flow, this file
// only turns data into HTML and wires the buttons. Browser-only at runtime;
// the function definitions load cleanly in Node for a syntax check.
'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n) {
  var v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

// --- Act 1: subjects -------------------------------------------------------

function renderSubjects(container, catalog, onSelect) {
  container.innerHTML = '';
  (catalog.subjects || []).forEach(function (subject) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.subjectId = subject.id;
    card.innerHTML =
      '<h3>' + esc(subject.name) + '</h3>' +
      '<p>' + esc(subject.summary || '') + '</p>' +
      '<span class="count">' + subject.fileCount + ' file' +
      (subject.fileCount === 1 ? '' : 's') + '</span>';
    card.addEventListener('click', function () { onSelect(subject.id); });
    container.appendChild(card);
  });
}

function markSelectedSubject(container, subjectId) {
  Array.prototype.forEach.call(container.querySelectorAll('.card'), function (card) {
    card.classList.toggle('selected', card.dataset.subjectId === subjectId);
  });
}

function renderUnfiled(container, unfiled, filesById) {
  if (!unfiled || unfiled.length === 0) { container.innerHTML = ''; return; }
  var names = unfiled.map(function (id) {
    var f = filesById[id];
    return f ? f.name : id;
  });
  container.innerHTML = '<p class="unfiled-note"><strong>' + unfiled.length +
    ' file' + (unfiled.length === 1 ? '' : 's') +
    ' did not fit any subject:</strong> ' + esc(names.join(', ')) +
    '. Curator leaves them unfiled rather than guessing where they belong.</p>';
}

// --- Act 2: subject report + source viewer ---------------------------------

function renderReport(container, report, onPointer) {
  var html = '<div class="report"><h3>' + esc(report.name) + '</h3>' +
    '<p>' + esc(report.summary || '') + '</p>' +
    '<p class="file-list">' + report.fileCount + ' file' +
    (report.fileCount === 1 ? '' : 's') + ' in this subject: ' +
    esc((report.files || []).map(function (f) { return f.name; }).join(', ')) + '</p>';
  if (report.note) html += '<p class="status">' + esc(report.note) + '</p>';
  (report.facts || []).forEach(function (fact) {
    html += '<div class="fact"><p>' + esc(fact.text) + '</p>' +
      '<button type="button" class="pointer" data-fact-id="' + esc(fact.id) + '">' +
      'Source: ' + esc(fact.source.fileName) + ' — ' + esc(fact.source.pointer) + '</button></div>';
  });
  html += '</div>';
  container.innerHTML = html;
  Array.prototype.forEach.call(container.querySelectorAll('.pointer'), function (btn) {
    btn.addEventListener('click', function () { onPointer(btn.dataset.factId); });
  });
}

// Show the source behind one fact: file name, pointer, the excerpt the
// fact quotes, and — when the pointer is a line number — the full line.
function renderSource(viewer, fact, fileText) {
  var fullLine = null;
  var m = /^line (\d+)$/.exec(fact.source.pointer || '');
  if (m && fileText) {
    var lines = fileText.split(/\r?\n/);
    fullLine = lines[Number(m[1]) - 1] || null;
  }
  viewer.hidden = false;
  viewer.innerHTML = '<h4>Source — ' + esc(fact.source.fileName) + ' (' +
    esc(fact.source.pointer) + ')</h4>' +
    '<blockquote>&ldquo;' + esc(fact.source.excerpt) + '&rdquo;</blockquote>' +
    (fullLine ? '<p class="full-line">Full line: ' + esc(fullLine.trim()) + '</p>' : '') +
    '<p class="full-line">This is the exact source the fact above came from. ' +
    'Curator never states a fact it cannot point back to like this.</p>';
  viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- Act 3: invoice, approval, receipt -------------------------------------

function renderInvoice(container, invoice, paypalState, onPay) {
  var html = '<div class="invoice-card"><h3>Invoice ' + esc(invoice.id) + '</h3><dl>' +
    '<dt>Payable to</dt><dd>' + esc(invoice.payee) + '</dd>' +
    '<dt>For</dt><dd>' + esc(invoice.description) + '</dd>' +
    '<dt>Amount</dt><dd class="amount">' + esc(money(invoice.amount)) + ' ' +
    esc(invoice.currency || 'USD') + '</dd>' +
    '<dt>Job complete</dt><dd>' + esc(invoice.complete || '—') + '</dd>' +
    '<dt>Due</dt><dd>' + esc(invoice.due || '—') + '</dd>' +
    '<dt>Status</dt><dd>UNPAID (mock data)</dd></dl>';
  if (paypalState === 'sandbox') {
    html += '<label for="payee-email">Payee email (pre-filled demo placeholder)</label>' +
      '<input type="email" id="payee-email" value="contractor@example.com" placeholder="contractor@example.com" autocomplete="off">' +
      '<p class="hint">Pre-filled — nothing to remember or type. The invoice names ' + esc(invoice.payee) +
      ' but gives no email address, and this email is only a label on the receipt and the K-record. ' +
      'The money settles to the sandbox merchant account that owns the server credentials. ' +
      'Edit it if you want; you do not need to remember any address.</p>' +
      '<p><button type="button" class="btn big" id="pay-btn">Pay this invoice — ' +
      esc(money(invoice.amount)) + '</button></p>' +
      '<p class="status" id="pay-error" role="status"></p>';
  } else {
    html += '<p class="status">Paying is off until the PayPal sandbox is connected — see the notice below.</p>';
  }
  html += '</div>';
  container.innerHTML = html;
  var payBtn = container.querySelector('#pay-btn');
  if (payBtn) {
    payBtn.addEventListener('click', function () {
      var email = container.querySelector('#payee-email').value.trim();
      onPay(email);
    });
  }
}

function renderPaypalNotice(container, paypalState) {
  if (paypalState === 'sandbox') { container.innerHTML = ''; return; }
  var reason = paypalState === 'not-configured'
    ? 'The server is running, but it reports PayPal as <strong>not-configured</strong>: no sandbox credentials are loaded.'
    : paypalState === 'refused-production'
    ? 'The server refused its PayPal configuration (production credentials are never accepted by this demo).'
    : 'The payment server could not be reached from this page. On this static hosting there is no payment server — Acts 1, 2 and 4 still work; Act 3 needs the server running.';
  container.innerHTML = '<div class="notice"><p><strong>PayPal sandbox is not connected.</strong></p>' +
    '<p>' + reason + '</p>' +
    '<p>To connect it, run the server with sandbox credentials — see ' +
    '<code>server/README.md</code>: create a free sandbox app at ' +
    'developer.paypal.com, copy the Client ID and Secret into ' +
    '<code>server/.env</code>, then <code>npm start</code>. No payment is ' +
    'shown, staged or faked until then.</p></div>';
}

function renderAwaiting(container, order, onCapture) {
  container.innerHTML = '<div class="pay-box"><h3>Order created — nothing paid yet</h3>' +
    '<p>PayPal order <strong>' + esc(order.orderId) + '</strong> is waiting for the payer.</p>' +
    '<p><a class="approve-link" href="' + esc(order.approveUrl) + '" target="_blank" rel="noopener">' +
    'Approve in PayPal sandbox &nearr;</a></p>' +
    '<p>Log in with the <strong>sandbox buyer (personal)</strong> account and click approve. ' +
    'Then come back here and capture it.</p>' +
    '<p><button type="button" class="btn big" id="capture-btn">I approved — capture the payment</button></p>' +
    '<p class="status" id="capture-error" role="status"></p></div>';
  container.querySelector('#capture-btn').addEventListener('click', function () { onCapture(); });
}

function renderReceipt(container, receipt) {
  container.innerHTML = '<div class="receipt-card"><h3>Receipt — payment complete</h3>' +
    '<p class="ok">&#10003; COMPLETED — ' + esc(money(receipt.amount)) + ' ' +
    esc(receipt.currency || 'USD') + '</p><dl>' +
    '<dt>Order</dt><dd>' + esc(receipt.orderId) + '</dd>' +
    '<dt>Capture</dt><dd>' + esc(receipt.captureId || '—') + '</dd>' +
    '<dt>Status</dt><dd>' + esc(receipt.status) + '</dd>' +
    '<dt>Amount</dt><dd>' + esc(money(receipt.amount)) + ' ' + esc(receipt.currency || 'USD') + '</dd>' +
    '<dt>Payee</dt><dd>' + esc(receipt.payee || '—') + '</dd>' +
    '<dt>Invoice</dt><dd>' + esc(receipt.invoiceId || '—') + '</dd></dl>' +
    '<p class="status">This payment was written to the K-record as a new entry — see Act 4. ' +
    'Old entries were not touched.</p></div>';
}

function setPayError(container, message) {
  var el = container.querySelector('#pay-error') || container.querySelector('#capture-error');
  if (el) el.textContent = message;
}

// --- Act 4: audit -----------------------------------------------------------

function renderAudit(container, report) {
  if (!report || !report.days || report.days.length === 0) {
    container.innerHTML = '<p class="status">Nothing in the K-record for ' +
      esc(report ? report.fromDate : '') + ' to ' + esc(report ? report.toDate : '') +
      '. Silence means nothing happened those days — not that the record is missing.</p>';
    return;
  }
  var html = '<p class="totals">' + report.totals.permissions + ' permission' +
    (report.totals.permissions === 1 ? '' : 's') + ' &middot; ' +
    report.totals.authority + ' authority change' +
    (report.totals.authority === 1 ? '' : 's') + ' &middot; ' +
    report.totals.beliefs + ' belief' + (report.totals.beliefs === 1 ? '' : 's') +
    ' &middot; ' + report.totals.payments + ' payment' +
    (report.totals.payments === 1 ? '' : 's') + '</p>';
  if (report.changedSince && report.changedSince.length > 0) {
    html += '<div class="day"><h4>What changed</h4><ul>' +
      report.changedSince.map(function (c) {
        return '<li><strong>' + esc(c.date) + ' — ' + esc(c.kind) + ':</strong> ' + esc(c.text) + '</li>';
      }).join('') + '</ul></div>';
  }
  report.days.forEach(function (day) {
    html += '<div class="day"><h4>' + esc(day.date) + '</h4>';
    if (day.permissions.length) {
      html += '<h5>Permissions</h5><ul>' + day.permissions.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    if (day.authority.length) {
      html += '<h5>Authority / trust</h5><ul>' + day.authority.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    if (day.beliefs.length) {
      html += '<h5>Beliefs &amp; notes</h5><ul>' + day.beliefs.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    if (day.payments.length) {
      html += '<h5>Payments</h5><ul>' + day.payments.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
    }
    html += '</div>';
  });
  html += '<p class="motto">' + esc(report.motto) + '</p>';
  container.innerHTML = html;
}

// Step indicator: highlight the act the user is in.
function setActiveStep(stepNumber) {
  Array.prototype.forEach.call(document.querySelectorAll('.steps a'), function (a) {
    a.classList.toggle('active', Number(a.dataset.step) === stepNumber);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    esc: esc, money: money,
    renderSubjects: renderSubjects, markSelectedSubject: markSelectedSubject,
    renderUnfiled: renderUnfiled, renderReport: renderReport,
    renderSource: renderSource, renderInvoice: renderInvoice,
    renderPaypalNotice: renderPaypalNotice, renderAwaiting: renderAwaiting,
    renderReceipt: renderReceipt, setPayError: setPayError,
    renderAudit: renderAudit, setActiveStep: setActiveStep,
  };
}
