// test.js — minimal smoke tests for the Back-Office AI Agent.
const assert = require('assert');
const { runTask } = require('./agent-core');

(async () => {
  const r = await runTask('今日のチケットを要約して');
  assert(r.trace.some(s => s.tool === 'summarize_tickets'), 'should summarize');
  assert(r.trace[r.trace.length - 1].tool === 'done', 'should finish with done');
  console.log('✓ back-office summarize task');
  console.log('\nALL BACK-OFFICE TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
