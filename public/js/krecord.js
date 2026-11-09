// krecord.js — Act 4: AUDIT (the K-record)
//
// The KATIE concept, as a demo: an append-only log. Every entry is a plain
// sentence about what the agent believed, what it was allowed to do, how
// much it was trusted, or what it paid — with the date it was written.
//
// The rule that makes it a record instead of a sheet:
//   The sheet changes. The notes never do.
// Old entries are never edited and never deleted. When the agent was wrong,
// the correction is a NEW entry, and the wrong belief stays in the log with
// its date, so anyone can see what it believed then vs what it believes now.
//
// Demo data only: seeded mock data. No real agent, no real permissions,
// no real money. The one payment entry in the seed is a labelled placeholder
// showing the shape; the real payment entry is appended live in Act 3.
//
// Entry shape:
//   { seq, date (ISO "YYYY-MM-DD"), kind ("belief"|"permission"|
//     "authority"|"payment"|"catalog"), actor ("curator-agent"),
//     text (one plain sentence), trust (0.0-1.0), source? }
//     source, when present: { fileId, fileName, pointer } — same pointer
//     language as provenance.js ("line 4", "message 12").
//
// The record itself is a plain JSON object: { version, mock, entries: [] }.
// It can be saved with JSON.stringify(record) and loaded back with
// loadRecord(JSON.parse(text)).

'use strict';

var MOTTO = 'The sheet changes. The notes never do.';
var ACTOR = 'curator-agent';

// ---------------------------------------------------------------------------
// Building the record
// ---------------------------------------------------------------------------

// createRecord(seedEntries) -> record
// seedEntries: array of entries in date order. seq is assigned here, so a
// seed file only needs date/kind/actor/text/trust/source. Entries are frozen
// so later code cannot rewrite history by accident.
function createRecord(seedEntries) {
  var record = { version: 1, mock: true, entries: [] };
  var list = Array.isArray(seedEntries) ? seedEntries : [];
  for (var i = 0; i < list.length; i++) {
    appendEntry(record, list[i]);
  }
  return record;
}

// appendEntry(record, entry) -> the stored entry
// The ONLY way to add to the record. seq auto-increments from the last
// entry. Past entries are never touched: this function only ever pushes.
// Throws if the entry is missing its date, kind, or text — a record with
// a hole in it is worse than no record.
function appendEntry(record, entry) {
  if (!entry || typeof entry.date !== 'string' || !entry.date) {
    throw new Error('krecord: entry needs a date (ISO "YYYY-MM-DD").');
  }
  if (typeof entry.kind !== 'string' || !entry.kind) {
    throw new Error('krecord: entry needs a kind ("belief", "permission", "authority", "payment", "catalog").');
  }
  if (typeof entry.text !== 'string' || !entry.text.trim()) {
    throw new Error('krecord: entry needs a text (one plain sentence).');
  }
  var last = record.entries[record.entries.length - 1];
  var stored = {
    seq: last ? last.seq + 1 : 1,
    date: entry.date,
    kind: entry.kind,
    actor: entry.actor || ACTOR,
    text: entry.text.trim(),
    trust: typeof entry.trust === 'number' ? entry.trust : 1.0,
  };
  if (entry.source) stored.source = entry.source;
  Object.freeze(stored); // history cannot be edited, even by this code
  record.entries.push(stored);
  return stored;
}

// loadRecord(data) -> record
// Rebuilds a record from JSON (e.g. data/krecord-seed.json). Re-freezes
// entries and re-numbers nothing: seq values in the file are kept as-is,
// and the next append continues from the highest seq.
function loadRecord(data) {
  var record = { version: (data && data.version) || 1, mock: true, entries: [] };
  var list = (data && data.entries) || [];
  for (var i = 0; i < list.length; i++) {
    var stored = {
      seq: list[i].seq,
      date: list[i].date,
      kind: list[i].kind,
      actor: list[i].actor || ACTOR,
      text: list[i].text,
      trust: typeof list[i].trust === 'number' ? list[i].trust : 1.0,
    };
    if (list[i].source) stored.source = list[i].source;
    Object.freeze(stored);
    record.entries.push(stored);
  }
  return record;
}

// ---------------------------------------------------------------------------
// Reading the record
// ---------------------------------------------------------------------------

// Dates are plain "YYYY-MM-DD" strings, so a string compare is a date
// compare. Inclusive on both ends: asking Oct 12 – Oct 14 includes Oct 14.
function inRange(date, fromDate, toDate) {
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

// queryRange(record, fromDate, toDate) -> [{ date, entries: [...] }]
// Every entry in the range, grouped by day, days in order. Days with no
// entries are not listed — silence means nothing happened that day.
function queryRange(record, fromDate, toDate) {
  var byDay = {};
  var order = [];
  var entries = (record && record.entries) || [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!inRange(entry.date, fromDate, toDate)) continue;
    if (!byDay[entry.date]) { byDay[entry.date] = []; order.push(entry.date); }
    byDay[entry.date].push(entry);
  }
  order.sort();
  return order.map(function (date) { return { date: date, entries: byDay[date] }; });
}

// Sort helper for the audit view: trust changes read as a story.
function trustLine(entry) {
  return entry.text + ' (trust ' + entry.trust.toFixed(1) + ')';
}

// auditReport(record, fromDate, toDate) ->
//   { fromDate, toDate, motto, mock, days, changedSince, totals }
//   days: [{ date, permissions, authority, beliefs, payments }]
//     each list holds the plain-sentence entries of that kind that day.
//   changedSince: the permission and authority entries in the range —
//     the changes a stranger needs to see first: what the agent was
//     allowed to do, and how much it was trusted, and when that moved.
//   totals: counts, so the view can say "3 permissions, 1 payment" plainly.
function auditReport(record, fromDate, toDate) {
  var days = queryRange(record, fromDate, toDate).map(function (day) {
    var bucket = { date: day.date, permissions: [], authority: [], beliefs: [], payments: [] };
    day.entries.forEach(function (entry) {
      if (entry.kind === 'permission') bucket.permissions.push(entry.text);
      else if (entry.kind === 'authority') bucket.authority.push(trustLine(entry));
      else if (entry.kind === 'belief') bucket.beliefs.push(trustLine(entry));
      else if (entry.kind === 'payment') bucket.payments.push(entry.text);
      else bucket.beliefs.push(entry.text); // "catalog" and friends: filed as notes
    });
    return bucket;
  });

  var changedSince = [];
  var totals = { permissions: 0, authority: 0, beliefs: 0, payments: 0 };
  days.forEach(function (day) {
    day.permissions.forEach(function (text) {
      totals.permissions += 1;
      changedSince.push({ date: day.date, kind: 'permission', text: text });
    });
    day.authority.forEach(function (text) {
      totals.authority += 1;
      changedSince.push({ date: day.date, kind: 'authority', text: text });
    });
    totals.beliefs += day.beliefs.length;
    totals.payments += day.payments.length;
  });

  return {
    fromDate: fromDate || null,
    toDate: toDate || null,
    motto: MOTTO,
    mock: true,
    days: days,
    changedSince: changedSince,
    totals: totals,
  };
}

// Node / browser dual export: works as a <script> tag or require().
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createRecord: createRecord,
    appendEntry: appendEntry,
    loadRecord: loadRecord,
    queryRange: queryRange,
    auditReport: auditReport,
    MOTTO: MOTTO,
  };
}
