// claude_worker.js — delegates a task to the local Claude CLI (already authenticated).
// Used as an on-demand "worker" for hard coding/research tasks, keeping the cheap
// free model for routine chat. Runs `claude --print -p "..."` non-interactively.
const { execFileSync } = require('child_process');

function claudeTask(prompt, { timeout = 180 } = {}) {
  try {
    const out = execFileSync('/root/.local/bin/claude', [
      '--print',        // non-interactive, print result
      '-p', prompt,     // the prompt
      '--model', 'sonnet', // cheap+fasts; change to 'opus' for hardest tasks
    ], { encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, text: out.trim() };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString().split('\n')[0];
    return { ok: false, text: 'Claude worker failed: ' + msg };
  }
}

module.exports = { claudeTask };
