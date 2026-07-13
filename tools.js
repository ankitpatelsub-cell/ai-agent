// tools.js — tools the agent can call. The LLM chooses these (tool-calling),
// replacing the old keyword matcher. Each tool returns { result, effects }.
const S = require('./skills');

const TOOL_SCHEMAS = [
  {
    name: 'summarize_tickets',
    description: 'Summarize all open back-office tickets into a concise Japanese bullet list.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'classify_priority',
    description: 'Assign priority (high/medium/low) to open tickets and explain why, in Japanese.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'draft_reply',
    description: 'Draft a polite Japanese customer reply for a given ticket id (defaults to first open ticket).',
    parameters: { type: 'object', properties: { ticket_id: { type: 'string', description: 'e.g. T-101' } }, required: [] },
  },
  {
    name: 'send_email',
    description: 'Send an email to a customer (STUB unless SMTP configured). Provide to/subject/body.',
    parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] },
  },
  {
    name: 'make_call',
    description: 'Place a follow-up call to a customer (STUB unless Twilio configured). Provide phone/message.',
    parameters: { type: 'object', properties: { phone: { type: 'string' }, message: { type: 'string' } }, required: ['phone', 'message'] },
  },
  {
    name: 'schedule_followup',
    description: 'Schedule a follow-up reminder for a ticket in N minutes. Returns when it will fire.',
    parameters: { type: 'object', properties: { ticket_id: { type: 'string' }, minutes: { type: 'number', description: 'minutes from now' } }, required: ['ticket_id', 'minutes'] },
  },
  {
    name: 'log_ticket',
    description: 'Create a new ticket from a short description.',
    parameters: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] },
  },
  {
    name: 'web_search',
    description: 'Search the web for information (STUB unless a search API key is set). Provide query.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'create_report',
    description: 'Generate a markdown report file on disk (real). Provide title and body.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] },
  },
  {
    name: 'recall',
    description: 'Search past actions, tickets and follow-ups from memory by keyword. Use to check what was already done.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'think',
    description: 'Record a reasoning step (chain-of-thought) without taking external action. Use to plan.',
    parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
  },
];

const mem = require('./memory');

async function dispatch(toolName, args = {}, m) {
  switch (toolName) {
    case 'summarize_tickets': { const r = await S.summarize(); return { result: r.result, effects: r.effects }; }
    case 'classify_priority': { const r = await S.classify(); return { result: r.result, effects: r.effects }; }
    case 'draft_reply': { const r = await S.draftReply(args.ticket_id); return { result: r.result, effects: r.effects }; }
    case 'send_email': { const r = await S.sendEmail(args.to, args.subject, args.body); return { result: r.result, effects: r.effects }; }
    case 'make_call': { const r = await S.makeCall(args.phone, args.message); return { result: r.result, effects: r.effects }; }
    case 'schedule_followup': {
      const r = await S.followUp(args.ticket_id, args.minutes || 1);
      if (m) m.addFollowup(args.ticket_id, args.minutes || 1, r.result);
      return { result: r.result, effects: r.effects };
    }
    case 'log_ticket': { const id = S.addTicket(args.description || '', args.description || ''); return { result: '作成: ' + id, effects: [] }; }
    case 'recall': { const hits = m ? m.recall(args.query || '') : []; return { result: hits.length ? hits.map(h => `[${h.kind}] ${h.text}`).join('\n') : '記録なし', effects: [] }; }
    case 'web_search': { const r = await S.webSearch(args.query || ''); return { result: r.result, effects: r.effects }; }
    case 'create_report': { const r = await S.createReport(args.title || 'report', args.body || ''); return { result: r.result, effects: r.effects }; }
    case 'think': return { result: '(thought) ' + (args.note || ''), effects: [] };
    default: return { result: 'unknown tool: ' + toolName, effects: [] };
  }
}

module.exports = { TOOL_SCHEMAS, dispatch };
