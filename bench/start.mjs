// Cold start: launches the app on a workspace and times until the sidebar
// is drawn (the window is usable). Quit the app between runs.
//
//   node bench/start.mjs <workspace folder>
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const launch = fileURLToPath(new URL('./launch.ps1', import.meta.url));
const t0 = Date.now();
const pid = execFileSync('powershell', ['-File', launch, '-Data', process.argv[2]]).toString().trim();
const app = await connect();
while (!(await app.evaluate(`document.querySelectorAll('.sidebar .row, .sidebar .nav-row').length`))) {
  await new Promise((r) => setTimeout(r, 10));
}
console.log(JSON.stringify({ pid: Number(pid), readyMs: Date.now() - t0 }));
app.close();
