const fs = require('fs');
const f = "frontend/src/pages/product/ProductDetailPage.jsx";
let lines = fs.readFileSync(f, 'utf8').split('\n');

// Find the block to replace: from createMeetupRequest call to end of catch block
// We need to replace lines 150-212 (1-indexed) = index 149-211
const newBlock = `    // ไม่เรียก createMeetupRequest ใน localStorage เพราะ backend เป็น source of truth
    // — ตรวจสอบ overlap และสร้างนัดจาก API โดยตรง
    try {
      const res = await api.createMeetup({
        listingId: product.id,
        meetupPointId: point?.id || null,
        locationId: point?.id || null,
        locationName: selectedLocation,
        locationLat: point?.lat || null,
        locationLng: point?.lng || null,
        date: meetupDate,
        time: meetupTime,
        note: meetupNote || null,
      });

      const meetupId = res?.meetupId;

      // Send notifications
      addNotification({
        userId: product.seller?.id,
        title: '🛒 มีคำขอซื้อและนัดรับสินค้าใหม่!',
        message: \`\${user?.name || 'ผู้ซื้อ'} ขอซื้อและนัดรับ "\${product.title}" วันที่ \${meetupDate} เวลา \${meetupTime} น. ณ \${selectedLocation}\`,
        type: 'meetup',
        link: '/meetups',
      });

      addNotification({
        userId: user?.id || 'me',
        title: '📤 ส่งคำขอนัดรับสินค้าแล้ว',
        message: \`ส่งคำขอนัดรับ "\${product.title}" ให้ผู้ขายแล้ว กรุณารอการตอบรับ\`,
        type: 'meetup',
        link: '/meetups',
      });

      setSubmittingBuy(false);
      setShowBuyModal(false);
      navigate('/meetups', { state: { justCreated: meetupId } });
    } catch (err) {
      console.error('Failed to submit meetup:', err);
      alert(err.message || 'เกิดข้อผิดพลาดในการส่งคำขอนัดรับ');
      setSubmittingBuy(false);
    }`;

// Find start index: line that has "const { success, id: meetupId, reason } = createMeetupRequest"
let startIdx = -1, endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('createMeetupRequest({')) { startIdx = i; }
  if (startIdx !== -1 && lines[i].includes('cancelRequest(meetupId)')) { endIdx = i + 2; break; }
}

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find block. startIdx=' + startIdx + ' endIdx=' + endIdx);
  // Print lines around expected location
  for (let i = 148; i < 215 && i < lines.length; i++) {
    console.log((i+1) + ': ' + lines[i].substring(0, 80));
  }
  process.exit(1);
}

console.log('Replacing lines ' + (startIdx+1) + ' to ' + (endIdx+1));
const before = lines.slice(0, startIdx);
const after = lines.slice(endIdx + 1);
const merged = before.concat(newBlock.split('\n')).concat(after);
fs.writeFileSync(f, merged.join('\n'), 'utf8');
console.log('Done, total lines: ' + merged.length);
