// SEEDED MOCK DATA - this file is part of the PayPal Curator hackathon demo.
// It only ever runs against the seeded mock pool in data/pool/. Nothing here
// touches real files, real people, or real money. Demo data, labelled honestly.
//
// catalog.js - the catalog engine (Act 1).
// Pure function, no DOM, no dependencies. Takes the messy pool and sorts it
// into subjects by reading the CONTENT of each file, never the filename.
// A stranger should get it in 30 seconds: big plain labels, plain sentences.

'use strict';

// Each subject is a plain name plus the words that give it away.
// Weight 2 words are the strong signals; weight 1 words are supporting.
const SUBJECTS = [
  {
    id: 'invoices-payments',
    name: 'Invoices & payments',
    summary: 'Bills to pay, money owed, and what has already been paid.',
    keywords: {
      invoice: 2, invoices: 2, payment: 2, unpaid: 2, 'due date': 2,
      'amount due': 2, 'bank transfer': 2,
      paid: 1, pay: 1, owed: 1, owe: 1, bill: 1, receipt: 1,
      balance: 1, refund: 1, deposit: 1, 'price rise': 1,
    },
  },
  {
    id: 'building-repairs',
    name: 'Building repairs',
    summary: 'The roof, the leak, and everything that keeps the building dry.',
    keywords: {
      roof: 2, leak: 2, leaking: 2, flashing: 2, ceiling: 2,
      plumber: 2, plumbing: 2, chimney: 2, damp: 2,
      tile: 1, tiles: 1, pipe: 1, repair: 1, warranty: 1, gutter: 1,
    },
  },
  {
    id: 'client-messages',
    name: 'Client messages',
    summary: 'What clients asked for, complained about, or changed.',
    keywords: {
      client: 2, dispute: 2, complaint: 2, unhappy: 2, reschedule: 2,
      refund: 2, 'thank you': 2, late: 2, feedback: 1, booking: 1,
    },
  },
  {
    id: 'catering-orders',
    name: 'Catering orders',
    summary: 'Food orders, menus, and deliveries for events.',
    keywords: {
      catering: 2, buffet: 2, menu: 2, sandwich: 2, platter: 2,
      pasta: 1, salad: 1, brownie: 1, brownies: 1, coffee: 1,
      guests: 1, cake: 1, dessert: 1, food: 1, delivery: 1, fruit: 1,
    },
  },
];

const MIN_SCORE = 2; // A file needs at least this much evidence to join a subject.

// Count how many times a word or phrase appears in a piece of text.
// Matches whole words only, so "paid" does not match "unpaid".
function countHits(text, word) {
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\b' + safe + '\\b', 'gi');
  const hits = text.match(re);
  return hits ? hits.length : 0;
}

// Score one file's text against one subject's keyword set.
function scoreText(text, subject) {
  let score = 0;
  for (const [word, weight] of Object.entries(subject.keywords)) {
    score += countHits(text, word) * weight;
  }
  return score;
}

// Sort the pool into subjects.
// files: [{ id, name, kind, date, text }]
// Returns: { subjects: [{ id, name, summary, fileIds, fileCount }],
//            unfiled: [fileIds], totalFiles }
function catalogPool(files) {
  const buckets = SUBJECTS.map((s) => ({ ...s, fileIds: [] }));
  const unfiled = [];

  for (const file of files) {
    const text = file.text || '';
    let best = null;
    let bestScore = 0;

    for (const bucket of buckets) {
      const score = scoreText(text, bucket);
      if (score > bestScore) {
        bestScore = score;
        best = bucket;
      }
    }

    if (best && bestScore >= MIN_SCORE) {
      best.fileIds.push(file.id);
    } else {
      unfiled.push(file.id);
    }
  }

  const subjects = buckets
    .filter((b) => b.fileIds.length > 0)
    .map((b) => ({
      id: b.id,
      name: b.name,
      summary: b.summary,
      fileIds: b.fileIds,
      fileCount: b.fileIds.length,
    }));

  return { subjects, unfiled, totalFiles: files.length };
}

// Works in the browser and in Node, no build step.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { catalogPool, SUBJECTS };
}
