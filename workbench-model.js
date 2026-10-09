export const groupDigits = s => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function cents(value) {
  if (value == null) return null;
  const s = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('INVALID_DECIMAL');
  const [whole, fraction = ''] = s.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function displayCents(value) {
  if (value == null) return 'Chưa đối soát';
  const n = value < 0n ? -value : value;
  const fraction = String(n % 100n).padStart(2, '0').replace(/0+$/, '');
  return `${value < 0n ? '−' : ''}${groupDigits(n / 100n)}${fraction ? ',' + fraction : ''} đ`;
}
export const money = value => displayCents(cents(value));
export function parseInput(value) {
  const s = String(value).trim();
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(s)) return null;
  const raw = s.replaceAll('.', '').replace(/^0+(?=\d)/, '');
  if (BigInt(raw) > 9007199254740991n) return null;
  return raw;
}
export function formatInput(input) {
  const value = input.value;
  // Only digit/group-separator keystrokes are reformatted. Other characters remain for validation.
  if (!/^[\d.]*$/.test(value)) { input.dataset.raw = ''; return; }
  const count = value.slice(0, input.selectionStart ?? value.length).replace(/\D/g, '').length;
  const raw = value.replaceAll('.', '');
  input.value = groupDigits(raw);
  input.dataset.raw = parseInput(input.value) ?? '';
  let position = 0, seen = 0;
  while (position < input.value.length && seen < count) { if (/\d/.test(input.value[position])) seen++; position++; }
  input.setSelectionRange(position, position);
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
export function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10);
}
export const dateLabel = iso => !iso ? 'Chưa chọn ngày' : iso.includes('T')
  ? new Intl.DateTimeFormat('vi-VN', {timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(iso))
  : iso.split('-').reverse().join('/');
export function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0,10) === s;
}
export function metrics(entity, plans = [], day = today()) {
  const reference = cents(entity.source_reported_remaining);
  const planned = plans.reduce((s,p) => s + BigInt(p.amount) * 100n, 0n);
  const remainder = reference == null ? null : reference > planned ? reference - planned : 0n;
  const excess = reference == null ? null : planned > reference ? planned - reference : 0n;
  const status = reference == null ? 'unknown' : reference === 0n ? 'zero' : planned === 0n ? 'needs' : remainder > 0n ? 'partial' : 'covered';
  const nextDate = plans.map(p => p.date).filter(Boolean).sort()[0] ?? null;
  return { reference, planned, remainder, excess, status, nextDate, due: plans.some(p => p.date <= day), percent: reference > 0n ? Number((planned < reference ? planned : reference) * 10000n / reference) / 100 : null };
}
export function matchesQueue(m, queue) {
  return queue === 'all' || (queue === 'work' ? m.remainder > 0n || m.due : queue === 'due' ? m.due : m.status === queue);
}
export function compareItems(a, b, getPlans, day = today()) {
  const x = metrics(a, getPlans(a), day), y = metrics(b, getPlans(b), day);
  if (x.due !== y.due) return x.due ? -1 : 1;
  if (x.remainder !== y.remainder) return (x.remainder ?? -1n) > (y.remainder ?? -1n) ? -1 : 1;
  return a.canonical_id.localeCompare(b.canonical_id, 'vi');
}
export const planKey = (project, persona, entity) => JSON.stringify([project, persona, entity]);
export function validateParts(parts) {
  return parts.map(p => ({ amount: parseInput(p.amount), date: p.date, note: p.note || '' })).map((p,i) => {
    if (p.amount == null || BigInt(p.amount) <= 0n) throw new Error(`Đợt ${i+1}: nhập số tiền nguyên dương, chỉ dùng chữ số (tối đa 9.007.199.254.740.991 đ).`);
    if (!validDate(p.date)) throw new Error(`Đợt ${i+1}: chọn ngày dự kiến thu hợp lệ.`);
    return p;
  });
}
