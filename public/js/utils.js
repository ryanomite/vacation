// Shared constants and utility helpers

export const ICONS = [
  '📍', '⭐', '�', '🏨', '🧳', '✈️',
  '🍽️', '🏛️', '🏖️', '🏔️', '🎭', '🛍️',
  '⛪', '🚂', '🚢', '🏕️', '🌆', '🎡',
  '🗺️', '🍷', '⛷️', '🤿', '🎸', '🌸',
  '🌴', '🏟️', '🎪', '🏺', '🦁', '🐘',
  '🎿', '🏄', '🚗', '🏥', '💒', '🎓',
];

export const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#a16207', '#475569', '#f43f5e', '#06b6d4',
];

export const DEFAULT_ICON  = '📍';
export const DEFAULT_COLOR = '#ef4444';
export const DEFAULT_JOURNEY_COLOR = '#3b82f6';

/** Generate a short unique ID */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Format a YYYY-MM-DD string for display */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

/**
 * Return an array of YYYY-MM-DD strings spanning [startDate, endDate].
 * If endDate is absent or before startDate, returns [startDate].
 */
export function getDatesInRange(startDate, endDate) {
  if (!startDate) return [];
  const end = (endDate && endDate >= startDate) ? endDate : startDate;
  const dates = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
