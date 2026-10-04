const CONTRACT_VERSION = 'STAFF_INPUT_MODEL_B_SCOPE_V1_1';
const DEFAULT_PROJECT_ID = 'OCEAN_CITY';
const DEFAULT_BASE_URL = 'https://aniuuzfacpvpgiotikik.supabase.co';
const DEFAULT_CATALOG = './scoped-context-catalog.json';
const CURRENT_FIELDS = ['project_id','shop_id','owner_staff_id','cskh_name','cbld_name','as_of','ps_kpi','ps_collected','ps_outstanding','official_kpi','official_collected','official_outstanding','source_hash'];
const EVENT_FIELDS = ['project_id','event_id','shop_id','event_type','event_time','actor_verification'];

export class GovernedReadError extends Error {
  constructor(code, message = code) { super(message); this.name = 'GovernedReadError'; this.code = code; }
}

const configFromWindow = () => ({
  baseUrl: window.__STAFF_INPUT_GOVERNED_CONFIG__?.baseUrl || DEFAULT_BASE_URL,
  publishableKey: window.__STAFF_INPUT_GOVERNED_CONFIG__?.publishableKey || '',
  projectId: window.__STAFF_INPUT_GOVERNED_CONFIG__?.projectId || DEFAULT_PROJECT_ID,
  cutoffAt: window.__STAFF_INPUT_GOVERNED_CONFIG__?.cutoffAt || new Date().toISOString(),
  pageSize: Math.min(1000, Math.max(1, Number(window.__STAFF_INPUT_GOVERNED_CONFIG__?.pageSize || 250))),
  eventPageSize: Math.min(1000, Math.max(1, Number(window.__STAFF_INPUT_GOVERNED_CONFIG__?.eventPageSize || 1000))),
  contextCatalogPath: window.__STAFF_INPUT_GOVERNED_CONFIG__?.contextCatalogPath || DEFAULT_CATALOG,
  writeEnabled: window.__STAFF_INPUT_GOVERNED_CONFIG__?.writeEnabled === true
});

const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value || {}, field);
const text = (value, field) => { if (typeof value !== 'string' || !value.trim()) throw new GovernedReadError('MALFORMED_RESPONSE', `MISSING_${field.toUpperCase()}`); return value; };
const nonNegative = (value, field) => { const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new GovernedReadError('MALFORMED_RESPONSE', `INVALID_${field.toUpperCase()}`); return n; };
const httpCode = response => response.status === 401 ? 'AUTH_REQUIRED' : response.status === 403 ? 'SCOPE_VIOLATION' : response.status === 404 ? 'RESOURCE_UNAVAILABLE' : response.status === 409 ? 'CONTRACT_CONFLICT' : response.status === 429 ? 'RATE_LIMIT' : response.status >= 500 ? 'UPSTREAM_FAILURE' : `HTTP_${response.status}`;

async function readJson(response, fallbackCode) {
  let body = null; try { body = await response.json(); } catch { /* normalize transport errors */ }
  if (!response.ok) throw new GovernedReadError(httpCode(response), body?.message || fallbackCode);
  return body;
}

function validateContext(context) {
  for (const field of ['owner_staff_id','cbld_name','cskh_name']) text(context?.[field], field);
  return context;
}

function validateCurrentRow(row, projectId, context) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new GovernedReadError('MALFORMED_RESPONSE', 'CURRENT_ROW_NOT_OBJECT');
  for (const field of CURRENT_FIELDS) if (!hasOwn(row, field)) throw new GovernedReadError('MALFORMED_RESPONSE', `CURRENT_FIELD_${field.toUpperCase()}_MISSING`);
  if (row.project_id !== projectId) throw new GovernedReadError('SCOPE_VIOLATION', 'CURRENT_PROJECT_SCOPE_MISMATCH');
  for (const field of ['shop_id','owner_staff_id','cskh_name','cbld_name','as_of','source_hash']) text(row[field], field);
  for (const field of ['ps_kpi','ps_collected','ps_outstanding','official_kpi','official_collected','official_outstanding']) nonNegative(row[field], field);
  if (context && row.owner_staff_id !== context.owner_staff_id) throw new GovernedReadError('SCOPE_VIOLATION', 'CURRENT_CONTEXT_MISMATCH');
  if (context && row.cskh_name !== context.cskh_name) throw new GovernedReadError('SCOPE_VIOLATION', 'CURRENT_CSKH_MISMATCH');
  if (context && row.cbld_name !== context.cbld_name) throw new GovernedReadError('SCOPE_VIOLATION', 'CURRENT_CBLD_MISMATCH');
}

function validateEventRow(row, projectId, context) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new GovernedReadError('MALFORMED_RESPONSE', 'EVENT_ROW_NOT_OBJECT');
  for (const field of EVENT_FIELDS) if (!hasOwn(row, field)) throw new GovernedReadError('MALFORMED_RESPONSE', `EVENT_FIELD_${field.toUpperCase()}_MISSING`);
  if (row.project_id !== projectId) throw new GovernedReadError('SCOPE_VIOLATION', 'EVENT_PROJECT_SCOPE_MISMATCH');
  text(row.event_id, 'event_id'); text(row.shop_id, 'shop_id'); text(row.event_type, 'event_type'); text(row.event_time, 'event_time'); text(row.actor_verification, 'actor_verification');
  if (row.owner_staff_key != null && row.owner_staff_key !== context.owner_staff_id) throw new GovernedReadError('SCOPE_VIOLATION', 'EVENT_CONTEXT_MISMATCH');
  if (row.owner_cskh_name != null && row.owner_cskh_name !== context.cskh_name) throw new GovernedReadError('SCOPE_VIOLATION', 'EVENT_CSKH_MISMATCH');
  if (row.owner_cbld_name != null && row.owner_cbld_name !== context.cbld_name) throw new GovernedReadError('SCOPE_VIOLATION', 'EVENT_CBLD_MISMATCH');
}

function mapCurrent(row) {
  return {
    canonical_id: row.shop_id, name: row.shop_id, source_entity_type: null, presentation_type: 'CHƯA XÁC ĐỊNH',
    staff_id: row.owner_staff_id, staff: row.cskh_name, assigned_cbld: row.cbld_name,
    source_reported_remaining: Number(row.official_outstanding), collected_amount: Number(row.official_collected),
    source_official_kpi: Number(row.official_kpi), source_official_collected: Number(row.official_collected),
    source_ps_kpi: Number(row.ps_kpi), source_ps_collected: Number(row.ps_collected), source_ps_remaining: Number(row.ps_outstanding),
    data_as_of: row.as_of, source_hash: row.source_hash, total_obligation: null, total_remaining: null,
    old_remaining: null, current_remaining: null, cleared: null, overdue: null, plan_covered: null,
    unplanned_remaining: null, coverage_pct: null, plans: null, due: null, priority: null,
    next_action: 'Chờ xác nhận loại gian hàng'
  };
}

export function createGovernedAdapter({ fetchImpl = fetch, config = configFromWindow() } = {}) {
  const base = String(config.baseUrl).replace(/\/$/, '');
  let tokenPromise;
  const headers = () => ({ apikey: config.publishableKey, 'Content-Type': 'application/json' });
  const session = async () => {
    if (!config.publishableKey) throw new GovernedReadError('AUTH_REQUIRED', 'GOVERNED_READ_NOT_CONFIGURED');
    if (!tokenPromise) tokenPromise = (async () => {
      let response; try { response = await fetchImpl(`${base}/auth/v1/signup`, { method:'POST', headers:headers(), body:'{}' }); } catch { throw new GovernedReadError('AUTH_REQUIRED', 'AUTH_SERVICE_UNAVAILABLE'); }
      const auth = await readJson(response, 'AUTH_REQUIRED');
      if (!auth?.access_token) throw new GovernedReadError('AUTH_REQUIRED', 'AUTH_TOKEN_MISSING');
      return auth.access_token;
    })();
    return tokenPromise;
  };
  const rpc = async (name, body) => {
    const token = await session();
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, { method:'POST', headers:{...headers(), Authorization:`Bearer ${token}`}, body:JSON.stringify(body) });
    return readJson(response, `${name.toUpperCase()}_FAILED`);
  };
  const pageCurrent = async context => {
    validateContext(context); const rows=[]; let offset=0;
    while (true) {
      const page = await rpc('staff_current_v1_1_scoped', {p_project_id:config.projectId,p_cutoff_at:config.cutoffAt,p_selected_staff_context:context.owner_staff_id,p_selected_cbld:context.cbld_name,p_selected_cskh:context.cskh_name,p_limit:config.pageSize,p_offset:offset});
      if (!Array.isArray(page)) throw new GovernedReadError('MALFORMED_RESPONSE','CURRENT_MUST_BE_ARRAY');
      page.forEach(row=>{validateCurrentRow(row,config.projectId,context);rows.push(row);});
      offset += page.length; if (page.length < config.pageSize) break; if (!page.length) throw new GovernedReadError('PAGINATION_ERROR','CURRENT_PAGINATION_DID_NOT_ADVANCE');
    }
    const ids=new Set(rows.map(row=>row.shop_id)); if(ids.size!==rows.length) throw new GovernedReadError('MALFORMED_RESPONSE','CURRENT_SHOP_ID_NOT_UNIQUE');
    return rows;
  };
  const pageEvents = async context => {
    validateContext(context); const rows=[]; let offset=0;
    while (true) {
      const page = await rpc('staff_events_v1_1_scoped', {p_project_id:config.projectId,p_cutoff_at:config.cutoffAt,p_selected_staff_context:context.owner_staff_id,p_selected_cbld:context.cbld_name,p_selected_cskh:context.cskh_name,p_limit:config.eventPageSize,p_offset:offset});
      if (!Array.isArray(page)) throw new GovernedReadError('MALFORMED_RESPONSE','EVENTS_MUST_BE_ARRAY');
      page.forEach(row=>{validateEventRow(row,config.projectId,context);rows.push(row);});
      offset += page.length; if (page.length < config.eventPageSize) break; if (!page.length) throw new GovernedReadError('PAGINATION_ERROR','EVENT_PAGINATION_DID_NOT_ADVANCE');
    }
    return rows;
  };
  return {
    async loadContextCatalog() {
      const response = await fetchImpl(config.contextCatalogPath, {cache:'no-store'});
      const data = await readJson(response, 'CONTEXT_CATALOG_UNAVAILABLE');
      if (data?.contract_version !== CONTRACT_VERSION || data?.mode !== 'PRESENTATION_CHOICES_ONLY' || !Array.isArray(data.entities) || !data.entities.length) throw new GovernedReadError('CONTRACT_CONFLICT','CONTEXT_CATALOG_INVALID');
      data.entities.forEach(validateContext);
      return data.entities;
    },
    async loadScoped(context) {
      validateContext(context); const [current, events] = await Promise.all([pageCurrent(context), pageEvents(context)]);
      const asOf=[...new Set(current.map(row=>row.as_of))].sort();
      return {entities:current.map(mapCurrent), events, meta:{mode:CONTRACT_VERSION, governed_read:true, scoped_read:true, project_id:config.projectId, cutoff_at:config.cutoffAt, debt_as_of_values:asOf, current_row_count:current.length, event_count:events.length, selected_context:{...context}, auth_model:'AUTH_ACTOR=auth.uid(); selected context is not verified identity', entity_type_contract_gap:true, debt_field_mapping:'official_outstanding → source_reported_remaining (display-only; authority unproven)', collected_field_mapping:'official_collected → collected_amount (display-only; authority unproven)', write_mode:config.writeEnabled?'LIVE_ENABLED':'SANDBOX_DRY_RUN', local_snapshot_fallback:false, v1_fallback:false}};
    },
    async appendPlan({context, shopId, installments}) {
      validateContext(context); if (!shopId) throw new GovernedReadError('WORKSPACE_CONTEXT_REQUIRED','SHOP_ID_REQUIRED');
      if (!Array.isArray(installments) || !installments.length) throw new GovernedReadError('INVALID_PLAN','INSTALLMENTS_REQUIRED');
      if (!config.writeEnabled) return {dry_run:true, events:installments.map((part,index)=>({event_type:index?'PLAN_CHANGED':'PLAN_CREATED',shop_id:shopId,amount:String(part.amount),expected_date:part.date||null,note:part.note||''}))};
      const events=[]; for (const part of installments) events.push(await rpc('workspace_append_event_v1_1',{p_project_id:config.projectId,p_shop_id:shopId,p_selected_staff_context:context.owner_staff_id,p_selected_cbld:context.cbld_name,p_selected_cskh:context.cskh_name,p_event_type:'PLAN_CREATED',p_amount:String(part.amount),p_expected_date:part.date||null,p_note:part.note||null,p_payload:{actor_verification_status:'UNVERIFIED_SHARED_WORKSPACE'}}));
      return {dry_run:false,events};
    },
    async registerEvidence(input) {
      validateContext(input.context); if (!config.writeEnabled) return {dry_run:true};
      return rpc('workspace_register_evidence_v1_1',{p_payment_event_id:input.paymentEventId,p_project_id:config.projectId,p_shop_id:input.shopId,p_selected_staff_context:input.context.owner_staff_id,p_selected_cbld:input.context.cbld_name,p_selected_cskh:input.context.cskh_name,p_storage_path:input.storagePath,p_original_filename:input.originalFilename,p_mime_type:input.mimeType,p_size_bytes:input.sizeBytes});
    }
  };
}

export function createAdapter(options = {}) { return createGovernedAdapter(options); }
