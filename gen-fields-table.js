// Prints the widget data-field catalog as a Markdown table, grouped by category.
// Run with `npm run fields` (honours HISTORY_DEPTH / REQUESTS_DEPTH from the env).
import { buildCatalog } from './fields.js';

const historyDepth  = Number(process.env.HISTORY_DEPTH) || 4;
const requestsDepth = Number(process.env.REQUESTS_DEPTH) || 4;
const TYPE_NAME = { 1: 'Text', 2: 'Number', 3: 'Image' };

const catalog = buildCatalog({ historyDepth, requestsDepth });

console.log('| Data Field | Type | Group | Description |');
console.log('|---|---|---|---|');
for (const f of catalog) {
  console.log(`| \`${f.name}\` | ${TYPE_NAME[f.type]} | ${f.group} | ${f.desc} |`);
}
