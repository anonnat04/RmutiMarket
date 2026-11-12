const fs = require('fs');
const f = "frontend/src/pages/meetup/MeetupListPage.jsx";
let content = fs.readFileSync(f, 'utf8');

// Find and fix the broken template literals in allMeetups useMemo
// The combo lines have mangled backticks — fix them
content = content.replace(
  /const combo = \$\{m\.productId\}-\$\{m\.buyerId\}-\$\{m\.sellerId\}-\$\{m\.status\};/g,
  'const combo = `${m.productId}-${m.buyerId}-${m.sellerId}-${m.status}`;'
);

// Also fix the second occurrence (in the localStorage loop)
// The replace above handles both since it's global

fs.writeFileSync(f, content, 'utf8');
console.log('Fixed template literals');

// Verify
const lines = content.split('\n');
for (let i = 273; i < 300 && i < lines.length; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
