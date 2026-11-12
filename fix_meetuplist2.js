const fs = require('fs');
const f = "frontend/src/pages/meetup/MeetupListPage.jsx";
let content = fs.readFileSync(f, 'utf8');

// The broken lines look like: "const combo = ${m.productId}---;"
// They need backticks around the template literal
// Replace both occurrences
const broken = 'const combo = ${m.productId}-${m.buyerId}-${m.sellerId}-${m.status};';
const fixed = 'const combo = `${m.productId}-${m.buyerId}-${m.sellerId}-${m.status}`;';

// Count occurrences
const count = (content.match(new RegExp(broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log('Found broken occurrences:', count);

if (count === 0) {
  // Try alternate broken form with garbled chars
  console.log('Trying line-by-line replacement...');
  const lines = content.split('\n');
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const combo = ') && lines[i].includes('m.productId') && !lines[i].includes('`')) {
      console.log('Found at line', i+1, ':', lines[i]);
      lines[i] = lines[i].replace(/const combo = (.*)$/, 'const combo = `${m.productId}-${m.buyerId}-${m.sellerId}-${m.status}`;');
      changed++;
    }
  }
  console.log('Changed:', changed, 'lines');
  fs.writeFileSync(f, lines.join('\n'), 'utf8');
} else {
  content = content.split(broken).join(fixed);
  fs.writeFileSync(f, content, 'utf8');
  console.log('Replaced', count, 'occurrences');
}
