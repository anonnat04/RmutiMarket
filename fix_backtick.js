const fs = require('fs');
const f = "frontend/src/pages/meetup/MeetupListPage.jsx";
const content = fs.readFileSync(f, 'utf8');
const lines = content.split('\n');

// Fix lines 282 and 290 (0-indexed) — replace broken combo lines with backtick template
const backtick = '\x60';
const fixedLine = '      const combo = ' + backtick + '${m.productId}-${m.buyerId}-${m.sellerId}-${m.status}' + backtick + ';';

let changed = 0;
for (let i = 0; i < lines.length; i++) {
  const stripped = lines[i].replace(/\r$/, '');
  if (stripped.includes('const combo = ') && stripped.includes('m.productId') && !stripped.includes(backtick)) {
    console.log('Fixing line', i+1, ':', JSON.stringify(stripped));
    lines[i] = fixedLine + (lines[i].endsWith('\r') ? '\r' : '');
    changed++;
  }
}

console.log('Changed:', changed, 'lines');
fs.writeFileSync(f, lines.join('\n'), 'utf8');

// Verify
const v = fs.readFileSync(f, 'utf8').split('\n');
console.log('Line 283:', JSON.stringify(v[282]));
console.log('Line 291:', JSON.stringify(v[290]));
