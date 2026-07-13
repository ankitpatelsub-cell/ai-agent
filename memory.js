// memory.js — persistence so the agent survives restarts.
// Stores: follow-ups (scheduled reminders), inbox (pending tasks for autonomous mode),
// and the thinking/trace log. JSON file on disk.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'memory.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { followups: [], inbox: [], trace: [] }; }
}
let state = load();

function save() { fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); }

function addFollowup(ticketId, minutes, note) {
  const when = Date.now() + minutes * 60000;
  state.followups.push({ ticketId, minutes, note, when, done: false, created: new Date().toISOString() });
  save();
  return when;
}

// pick due follow-ups (and don't mark done here; caller decides)
function dueFollowups() {
  const now = Date.now();
  return state.followups.filter(f => !f.done && f.when <= now);
}

function markFollowup(id) {
  const f = state.followups.find(x => x.note === id) || state.followups.find(x => !x.done);
  if (f) { f.done = true; save(); }
}

function addInbox(task) {
  state.inbox.push({ task, created: new Date().toISOString(), status: 'pending' });
  save();
}

function nextInbox() {
  const i = state.inbox.find(x => x.status === 'pending');
  if (i) { i.status = 'processing'; save(); }
  return i;
}

function completeInbox(task) { const i = state.inbox.find(x => x.task === task); if (i) { i.status = 'done'; save(); } }

function pushTrace(entry) {
  state.trace.unshift({ ts: new Date().toISOString(), ...entry });
  if (state.trace.length > 300) state.trace = state.trace.slice(0, 300);
  save();
}

function recall(query) {
  const q = query.toLowerCase();
  const hits = [];
  for (const a of state.trace) {
    const text = [a.type, a.tool, a.task, a.result].filter(Boolean).join(' ').toLowerCase();
    if (text.includes(q)) hits.push({ kind: 'trace', ts: a.ts, text: text.slice(0, 80) });
  }
  for (const f of state.followups) {
    if ((f.ticketId || '').toLowerCase().includes(q) || (f.note || '').toLowerCase().includes(q))
      hits.push({ kind: 'followup', ts: f.created, text: f.ticketId + ' ' + f.note });
  }
  return hits.slice(0, 8);
}

function getState() { return state; }

module.exports = { addFollowup, dueFollowups, markFollowup, addInbox, nextInbox, completeInbox, pushTrace, recall, getState };
