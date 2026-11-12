const fs = require('fs');
const f = "frontend/src/pages/meetup/MeetupListPage.jsx";
const content = fs.readFileSync(f, 'utf8');
const lines = content.split('\n');

// Print exact bytes of line 283 (index 282)
const line283 = lines[282];
console.log('Line 283 raw:', JSON.stringify(line283));
console.log('Line 291 raw:', JSON.stringify(lines[290]));

// Check if backtick is present
console.log('Has backtick 283:', line283.includes('\x60'));
console.log('Has backtick 291:', lines[290].includes('\x60'));
