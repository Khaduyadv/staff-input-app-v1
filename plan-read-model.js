const PLAN_STATUSES = new Set(['NO_PLAN', 'PARTIAL', 'FULLY_PLANNED', 'OVER_PLANNED']);
const PLAN_EVENT_TYPES = new Set(['PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED']);
const PLAN_EFFECTIVE_STATUSES = new Set(['ACTIVE', 'SUPERSEDED', 'CANCELLED']);

const requiredText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`PLAN_${name.toUpperCase()}_INVALID`);
  return value;
};

const nonNegativeDecimal = (value, name) => {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) < 0) {
    throw new Error(`PLAN_${name.toUpperCase()}_INVALID`);
  }
  return text;
};

const sameInstant = (left, right) => {
  const a = Date.parse(left), b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
};

export function validatePlanStateRows(rows, projectId, context, currentRows) {
  if (!Array.isArray(rows) || !Array.isArray(currentRows)) throw new Error('PLAN_STATE_NOT_ARRAY');
  const currentByShop = new Map(currentRows.map(row => [row.shop_id, row]));
  const byShop = new Map();
  for (const row of rows) {
    for (const field of ['project_id','shop_id','owner_staff_id','cbld_name','cskh_name','as_of','current_source_run_id','source_projection_sha','plan_coverage_status']) {
      requiredText(row?.[field], field);
    }
    if (row.project_id !== projectId || row.owner_staff_id !== context.owner_staff_id || row.cbld_name !== context.cbld_name || row.cskh_name !== context.cskh_name) {
      throw new Error('PLAN_STATE_SCOPE_MISMATCH');
    }
    const current = currentByShop.get(row.shop_id);
    if (!current || current.project_id !== projectId || current.owner_staff_id !== context.owner_staff_id || current.cbld_name !== context.cbld_name || current.cskh_name !== context.cskh_name || !sameInstant(current.as_of, row.as_of) || String(current.source_hash).toLowerCase() !== row.source_projection_sha.toLowerCase()) {
      throw new Error('PLAN_STATE_CURRENT_LINEAGE_MISMATCH');
    }
    if (byShop.has(row.shop_id)) throw new Error('PLAN_STATE_DUPLICATE_SHOP');
    if (!PLAN_STATUSES.has(row.plan_coverage_status)) throw new Error('PLAN_STATE_STATUS_INVALID');
    const count = Number(row.active_plan_count);
    if (!Number.isInteger(count) || count < 0) throw new Error('PLAN_STATE_COUNT_INVALID');
    const latest = row.latest_plan_at == null ? null : requiredText(row.latest_plan_at, 'latest_plan_at');
    if (latest && !Number.isFinite(Date.parse(latest))) throw new Error('PLAN_STATE_TIME_INVALID');
    byShop.set(row.shop_id, {
      project_id: row.project_id,
      shop_id: row.shop_id,
      owner_staff_id: row.owner_staff_id,
      cbld_name: row.cbld_name,
      cskh_name: row.cskh_name,
      as_of: row.as_of,
      current_source_run_id: row.current_source_run_id,
      source_projection_sha: row.source_projection_sha,
      official_outstanding: nonNegativeDecimal(row.official_outstanding, 'official_outstanding'),
      active_plan_total: nonNegativeDecimal(row.active_plan_total, 'active_plan_total'),
      remaining_unplanned_amount: nonNegativeDecimal(row.remaining_unplanned_amount, 'remaining_unplanned_amount'),
      active_plan_count: count,
      latest_plan_at: latest,
      plan_coverage_status: row.plan_coverage_status
    });
  }
  if (byShop.size !== currentByShop.size || [...currentByShop.keys()].some(shopId => !byShop.has(shopId))) {
    throw new Error('PLAN_STATE_ROWSET_MISMATCH');
  }
  return byShop;
}

export function validatePlanHistoryRows(rows, projectId, shopId, allowedShops) {
  if (!Array.isArray(rows)) throw new Error('PLAN_HISTORY_NOT_ARRAY');
  const ids = new Set();
  return rows.map(row => {
    for (const field of ['project_id','shop_id','event_id','event_type','event_time','plan_effective_status']) requiredText(row?.[field], field);
    if (row.project_id !== projectId || row.shop_id !== shopId || !allowedShops.has(row.shop_id)) throw new Error('PLAN_HISTORY_SCOPE_MISMATCH');
    if (ids.has(row.event_id)) throw new Error('PLAN_HISTORY_DUPLICATE_EVENT');
    ids.add(row.event_id);
    if (!PLAN_EVENT_TYPES.has(row.event_type) || !PLAN_EFFECTIVE_STATUSES.has(row.plan_effective_status) || !Number.isFinite(Date.parse(row.event_time))) {
      throw new Error('PLAN_HISTORY_CONTRACT_INVALID');
    }
    if (row.amount != null) nonNegativeDecimal(row.amount, 'history_amount');
    if (row.expected_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.expected_date))) throw new Error('PLAN_HISTORY_DATE_INVALID');
    return { ...row };
  });
}

export function activePlanDates(history = []) {
  return history
    .filter(row => row.plan_effective_status === 'ACTIVE' && ['PLAN_CREATED','PLAN_CHANGED'].includes(row.event_type))
    .map(row => row.expected_date)
    .filter(Boolean)
    .sort();
}

export const planStatusLabel = status => ({
  ACTIVE: 'Đang hiệu lực',
  SUPERSEDED: 'Đã thay đổi',
  CANCELLED: 'Đã hủy'
}[status] || 'Không xác định');

export const planEventLabel = type => ({
  PLAN_CREATED: 'Tạo kế hoạch',
  PLAN_CHANGED: 'Thay đổi kế hoạch',
  PLAN_CANCELLED: 'Hủy kế hoạch'
}[type] || type);
