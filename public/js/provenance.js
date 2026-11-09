// provenance.js — Act 2: RETRIEVE
//
// Pure functions, no DOM. Turns pool files + the catalog into facts, and
// facts into a per-subject report. Every fact points back at the exact
// source line or message it came from — that pointer is the whole point.
//
// Demo data only: everything here is seeded mock data. Nothing in this
// file talks to a real account, a real inbox, or real money.
//
// Contracts (shared with the catalog agent):
//   file:    { id, name, kind, path, date, content }   (content may also
//             arrive as `text` or `body` — all three are accepted)
//   catalog: { subjects: [{ id, name, summary, fileIds, fileCount }],
//              unfiled: [fileIds], totalFiles }
//   fact:    { id, text, subjectId,
//              source: { fileId, fileName, excerpt, pointer } }
//   report:  { subjectId, name, summary, facts, fileCount }

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The text of a pool file, whatever field name it arrived under.
function fileText(file) {
  if (typeof file.content === 'string') return file.content;
  if (typeof file.text === 'string') return file.text;
  if (typeof file.body === 'string') return file.body;
  return '';
}

// Shorten a quote so it stays readable in the report. Never alters words,
// only cuts the tail off with an ellipsis.
function shortQuote(line, maxLen) {
  var text = String(line).trim().replace(/\s+/g, ' ');
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}

// "line 4" for plain lines, "message 12" for chat messages.
function pointerFor(file, lineNumber, messageNumber) {
  if (typeof messageNumber === 'number') return 'message ' + messageNumber;
  return 'line ' + lineNumber;
}

// Which subject does this file belong to? "unfiled" if it is in none.
function subjectIdForFile(fileId, catalog) {
  var subjects = (catalog && catalog.subjects) || [];
  for (var i = 0; i < subjects.length; i++) {
    var ids = subjects[i].fileIds || [];
    if (ids.indexOf(fileId) !== -1) return subjects[i].id;
  }
  return 'unfiled';
}

// ---------------------------------------------------------------------------
// Fact extraction
// ---------------------------------------------------------------------------

var AMOUNT_RE = /\$[\d,]+(?:\.\d{2})?/;
var INVOICE_NO_RE = /(?:invoice|inv)[\s#:\-]*([A-Za-z0-9][A-Za-z0-9\-]*)/i;
var DUE_RE = /due(?:\s+date)?\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Z][a-z]+ \d{1,2},? \d{4})/i;
var COMPLETE_RE = /job(?:\s+marked)?\s+complete[d]?\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Z][a-z]+ \d{1,2},? \d{4})/i;
var DONE_RE = /job\s+done\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Z][a-z]+ \d{1,2},? \d{4})/i;
var PAYEE_RE = /(?:payee|vendor|supplier|billed by|from)[:\s]+([A-Z][A-Za-z0-9 .&'()\-]+?)(?:\s*[,\|;]|\s+for\s|\s+due\s|\s*$)/i;
var MESSAGE_RE = /^(?:\[[^\]]+\]\s*)?([A-Za-z][A-Za-z .'\-]{1,30}?):\s+(.+)$/;
var EXPORT_RE = /\b(exported|shipped|delivered|sent|paid|refunded)\b/i;

// Field labels, not people. "Payee: Beta Office" is an invoice field, not
// a chat message from someone called Payee — never treat it as one.
// Multi-word labels too: "Amount due: $480" is a field, not a message
// from someone called "Amount due"; same for "Due date:" and "For:".
var FIELD_LABELS = {
  amount: true, 'amount due': true, balance: true, billed: true,
  cost: true, date: true, due: true, 'due date': true, for: true,
  from: true, invoice: true, 'job done': true,
  'job marked complete': true, payee: true, price: true, status: true,
  supplier: true, to: true, total: true, vendor: true,
};

// A line is a chat message if it looks like "Name: words" or
// "[2026-10-12 09:14] Name: words" — and Name is a person, not a field
// label like "Payee" or "Amount". Short messages ("ok") still count as a
// message for numbering; they just don't become facts.
function parseMessage(line) {
  var m = MESSAGE_RE.exec(line.trim());
  if (!m) return null;
  if (FIELD_LABELS[m[1].trim().toLowerCase()]) return null;
  return { speaker: m[1].trim(), body: m[2].trim() };
}

// Small talk is not a fact. Keep messages that actually say something.
function isSubstantive(body) {
  var text = body.trim();
  if (text.length < 20) return false;
  if (/^(ok|okay|yes|no|thanks|thank you|hi|hey|hello|lol|👍)[.!?]*$/i.test(text)) return false;
  return true;
}

function makeFact(id, text, subjectId, file, excerpt, pointer) {
  return {
    id: id,
    text: text,
    subjectId: subjectId,
    source: {
      fileId: file.id,
      fileName: file.name,
      excerpt: shortQuote(excerpt, 140),
      pointer: pointer,
    },
  };
}

// Extract every fact a single file can support. One claim per fact, one
// plain sentence per claim, each with its exact source.
function extractFactsFromFile(file, subjectId, startSeq, seen) {
  var facts = [];
  var seq = startSeq;
  var lines = fileText(file).split(/\r?\n/);
  var messageCount = 0;
  var chatFactsThisFile = 0;

  // Invoice fields usually sit on separate lines ("Invoice INV-1041" on
  // line 1, "Amount: $1,250.00" on line 3). Find the file's invoice number
  // once, then each value line points at its own line.
  var fileInvoiceNo = null;
  for (var s = 0; s < lines.length; s++) {
    var found = INVOICE_NO_RE.exec(lines[s]);
    if (found) { fileInvoiceNo = found[1].toUpperCase(); break; }
  }

  function push(text, excerpt, pointer) {
    var key = file.id + '|' + text.toLowerCase();
    if (seen[key]) return; // same claim from the same file, said twice
    seen[key] = true;
    seq += 1;
    facts.push(makeFact('fact-' + String(seq).padStart(3, '0'), text, subjectId, file, excerpt, pointer));
  }

  // Chat-export JSON (the Sherlock blob): a raw export is one long JSON
  // document no human can read. Parse it and pull each conversation's
  // messages out as facts, numbered across the whole export, so the blob
  // becomes readable. If the JSON does not parse, fall through to the
  // line-by-line path below instead of failing.
  if (file.kind === 'chat-export') {
    var parsed = null;
    try { parsed = JSON.parse(fileText(file)); } catch (e) { parsed = null; }
    if (parsed && Array.isArray(parsed.conversations)) {
      var msgNo = 0;
      var convos = parsed.conversations;
      for (var c = 0; c < convos.length; c++) {
        var convo = convos[c] || {};
        var msgs = Array.isArray(convo.messages) ? convo.messages : [];
        var keptThisConvo = 0;
        for (var m = 0; m < msgs.length; m++) {
          var msg = msgs[m] || {};
          var body = typeof msg.text === 'string' ? msg.text : '';
          msgNo += 1;
          if (!isSubstantive(body) || keptThisConvo >= 4) continue;
          keptThisConvo += 1;
          var who = msg.role === 'assistant' ? 'the assistant' : 'the user';
          push(
            'In "' + (convo.title || 'exported chat') + '", ' + who +
              ' said "' + shortQuote(body, 100) + '".',
            body,
            'message ' + msgNo
          );
        }
      }
      return { facts: facts, nextSeq: seq };
    }
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var lineNo = i + 1;
    if (!line.trim()) continue;

    var message = parseMessage(line);
    if (message) {
      messageCount += 1;
      // Chat-log claim: the speaker's own words, quoted back with a pointer.
      if (isSubstantive(message.body) && chatFactsThisFile < 12) {
        chatFactsThisFile += 1;
        push(
          message.speaker + ' said "' + shortQuote(message.body, 100) + '".',
          line,
          pointerFor(file, lineNo, messageCount)
        );
      }
      continue; // a message line is a claim, not an invoice line
    }

    var pointer = pointerFor(file, lineNo);

    // Invoice amount: "$1,250.00" on a line that names an amount or a total.
    // Pointer is the line the amount sits on, not the invoice-number line.
    var amount = AMOUNT_RE.exec(line);
    if (amount && /\b(total|amount|balance|charge|price|cost)\b/i.test(line)) {
      if (fileInvoiceNo) {
        push('Invoice ' + fileInvoiceNo + ' is for ' + amount[0] + '.', line, pointer);
      } else {
        push('The total shown is ' + amount[0] + '.', line, pointer);
      }
    }

    // Who gets paid. "From: M. Okafor (contractor)" — the parenthetical
    // is a job title, not part of the name, so strip it.
    var payee = PAYEE_RE.exec(line);
    if (payee) {
      var payeeName = payee[1].trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (fileInvoiceNo) {
        push('Invoice ' + fileInvoiceNo + ' is payable to ' + payeeName + '.', line, pointer);
      } else if (amount) {
        push(payeeName + ' is named as the payee for ' + amount[0] + '.', line, pointer);
      }
    }

    // When it is due.
    var due = DUE_RE.exec(line);
    if (due) {
      if (fileInvoiceNo) {
        push('Invoice ' + fileInvoiceNo + ' is due ' + due[1] + '.', line, pointer);
      } else if (amount) {
        push('A payment of ' + amount[0] + ' is due ' + due[1] + '.', line, pointer);
      }
    }

    // When the job was finished — the fact that makes the payment due.
    var done = COMPLETE_RE.exec(line) || DONE_RE.exec(line);
    if (done) {
      if (fileInvoiceNo) {
        push('Invoice ' + fileInvoiceNo + ' job marked complete ' + done[1] + '.', line, pointer);
      } else {
        push('The job was marked complete ' + done[1] + '.', line, pointer);
      }
    }

    // Export / shipping / delivery messages.
    if (EXPORT_RE.test(line) && !fileInvoiceNo) {
      var verb = EXPORT_RE.exec(line)[1].toLowerCase();
      push('The record says this item was ' + verb + ': "' + shortQuote(line, 90) + '".', line, pointer);
    }
  }

  return { facts: facts, nextSeq: seq };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// extractFacts(files, catalog) -> facts[]
// files: pool files with text content. catalog: catalogPool() output.
// Returns one fact per claim found, in file order then line order.
// A file that supports no claim produces no facts — we never invent one.
function extractFacts(files, catalog) {
  var allFacts = [];
  var seen = {};
  var seq = 0;
  var list = Array.isArray(files) ? files : [];
  for (var i = 0; i < list.length; i++) {
    var file = list[i];
    var subjectId = subjectIdForFile(file.id, catalog);
    var result = extractFactsFromFile(file, subjectId, seq, seen);
    allFacts = allFacts.concat(result.facts);
    seq = result.nextSeq;
  }
  return allFacts;
}

// buildSubjectReport(subject, facts, files) -> report
// subject: one entry from catalog.subjects. facts: extractFacts() output.
// files: pool files (used only to name the files in this subject).
// The report lists only facts with a source. If a question about this
// subject has no supporting fact, the report says so plainly instead of
// guessing: "cannot answer from this record".
function buildSubjectReport(subject, facts, files) {
  var subjectFacts = (Array.isArray(facts) ? facts : []).filter(function (f) {
    return f.subjectId === subject.id;
  });
  var fileList = (Array.isArray(files) ? files : []).filter(function (file) {
    return (subject.fileIds || []).indexOf(file.id) !== -1;
  });

  var report = {
    subjectId: subject.id,
    name: subject.name,
    summary: subject.summary || '',
    facts: subjectFacts,
    fileCount: (subject.fileIds || []).length,
    files: fileList.map(function (file) { return { id: file.id, name: file.name }; }),
  };

  if (subjectFacts.length === 0) {
    report.note = 'cannot answer from this record — this subject has no facts ' +
      'with a source in the pool. Nothing here is guessed.';
  }
  return report;
}

// The one sentence a view shows when a question has no supporting fact.
var CANNOT_ANSWER = 'cannot answer from this record';

// Node / browser dual export: works as a <script> tag or require().
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractFacts: extractFacts, buildSubjectReport: buildSubjectReport, CANNOT_ANSWER: CANNOT_ANSWER };
}
