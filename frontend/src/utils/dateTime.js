/**
 * Date/Time utilities normalized for Thailand (Asia/Bangkok, UTC+7).
 * Handles Supabase/PostgreSQL timestamps that may omit trailing "Z" / offset.
 */

export function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let str = String(value).trim();
  if (!str) return null;

  // Convert space separator "2026-11-27 12:30:00" -> "2026-11-27T12:30:00"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }

  // If ISO-like datetime has no timezone offset (no Z, +, or - after time), treat as UTC
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(str)) {
    str += 'Z';
  }

  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatThaiTime(value) {
  const d = parseTimestamp(value);
  if (!d) return '';
  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
}

export function formatThaiDate(value, options = {}) {
  const d = parseTimestamp(value);
  if (!d) return '';
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
    ...options,
  });
}

export function formatThaiDateShort(value) {
  return formatThaiDate(value, { month: 'short' });
}

export function formatThaiDateKey(value) {
  const d = parseTimestamp(value);
  if (!d) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD in Bangkok
}

export function formatTimeAgo(value) {
  const d = parseTimestamp(value);
  if (!d) return 'เมื่อสักครู่';
  const diff = Math.max(0, Date.now() - d.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม. ที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} เดือนที่แล้ว`;
  return `${Math.floor(months / 12)} ปีที่แล้ว`;
}
