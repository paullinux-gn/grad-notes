// Runs one of the scenario files here inside the app and prints its results.
//
//   node bench/run.mjs bench/views.js
import { readFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

const app = await connect();
const helpers = readFileSync(new URL('./helpers.js', import.meta.url), 'utf8');
const body = readFileSync(process.argv[2], 'utf8');
console.log(JSON.stringify(await app.evaluate(`(async () => { ${helpers}\n${body} })()`), null, 1));
app.close();
