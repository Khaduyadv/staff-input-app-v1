import { createAdapter } from './governed-read-adapter.js?v=20261009-plan-read-r1';
import { buildStaffDirectory, normalizeStaffSearch } from './staff-entry-model.js?v=20261004-v23-final-r1';
import { cents, money, displayCents, groupDigits, parseInput, formatInput, today, addDays, dateLabel, validateParts } from './workbench-model.js?v=20261004-v23-final-r1';
import { planEventLabel, planStatusLabel } from './plan-read-model.js?v=20261009-plan-read-r1';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { mode:'scoped', adapter:null, data:[], events:[], planHistoryByShop:new Map(), meta:{}, selectedContext:null, cbldDirectory:[], cbld:null, persona:null, view:'work', type:'ALL', query:'', staffFilter:null, manager:false, editing:null, nextIds:[], dirty:false, undo:null, queueScroll:0, submitting:false, writeOutcomeUnconfirmed:false };
const labels = { work:'Cần xử lý', needs:'Chưa có kế hoạch', partial:'Chưa lập đủ kế hoạch', due:'Đến / quá ngày thu', covered:'Đã lập đủ kế hoạch', overplanned:'Vượt kế hoạch', all:'Danh mục được phân công' };
const statusLabels = { needs:'Chưa có kế hoạch', partial:'Chưa lập đủ', covered:'Đã lập đủ', overplanned:'Vượt kế hoạch', zero:'Số còn phải thu bằng 0', unknown:'Kế hoạch chưa đối soát' };
const eventDateTime = value => new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const scope = () => state.data;
const persistedMetrics = (entity, day=today()) => {
  if (!entity?.plan_state_available || entity.plan_state_stale) return { reference:null, planned:null, remainder:null, excess:null, status:'unknown', nextDate:null, due:false, percent:null };
  const reference=cents(entity.official_outstanding), planned=cents(entity.active_plan_total), remainder=cents(entity.remaining_unplanned_amount);
  const status={NO_PLAN:'needs',PARTIAL:'partial',FULLY_PLANNED:'covered',OVER_PLANNED:'overplanned'}[entity.plan_coverage_status] || 'unknown';
  const dates=(state.planHistoryByShop.get(entity.canonical_id)||[]).filter(x=>x.plan_effective_status==='ACTIVE'&&['PLAN_CREATED','PLAN_CHANGED'].includes(x.event_type)).map(x=>x.expected_date).filter(Boolean).sort();
  return {reference,planned,remainder,excess:planned>reference?planned-reference:0n,status,nextDate:dates[0]||null,due:dates.some(x=>x<=day),percent:reference>0n?Number((planned<reference?planned:reference)*10000n/reference)/100:null};
};
const matchesPersistedQueue = (m, queue) => queue==='all' || (queue==='work' ? m.status==='unknown'||(m.remainder!==null&&(m.remainder>0n||m.due)) : queue==='due' ? m.due : m.status===queue);
const visible = () => scope().filter(e => (!state.staffFilter || e.staff_id === state.staffFilter) && (state.type === 'ALL' || e.presentation_type === state.type) && normalizeStaffSearch(e.name || e.canonical_id).includes(normalizeStaffSearch(state.query)) && matchesPersistedQueue(persistedMetrics(e),state.view)).sort((a,b)=>{const x=persistedMetrics(a),y=persistedMetrics(b);if(x.due!==y.due)return x.due?-1:1;if(x.remainder!==y.remainder)return (x.remainder??-1n)>(y.remainder??-1n)?-1:1;return a.canonical_id.localeCompare(b.canonical_id,'vi');});
const getEntity = id => scope().find(e => e.canonical_id === id);

const buildContextDirectory = contexts => {
  const groups = new Map();
  for (const context of contexts) {
    let group = groups.get(context.cbld_name);
    if (!group) { group = { id:context.cbld_name, name:context.cbld_name, staff:[] }; groups.set(context.cbld_name, group); }
    group.staff.push({ id:`${context.cbld_name}::${context.owner_staff_id}`, name:context.cskh_name, relationship:'SERVER_SCOPE_CONTEXT', context });
  }
  return [...groups.values()];
};
const friendlyScopeError = err => {
  if (err?.code === 'SCOPE_VIOLATION') return 'Phạm vi này không hợp lệ hoặc không còn được phân công. Hãy chọn lại.';
  if (err?.code === 'AUTH_REQUIRED') return 'Chưa tạo được phiên làm việc. Hãy thử lại.';
  if (err?.code === 'CONTRACT_CONFLICT') return 'Contract phạm vi chưa sẵn sàng cho lựa chọn này.';
  return 'Chưa tải được phạm vi. Hãy thử lại.';
};
async function load() {
  $('#cbldList').innerHTML = '<p role="status">Đang tải phạm vi phụ trách…</p>';
  state.adapter=createAdapter();
  try {
    const contexts = await state.adapter.loadContextCatalog();
    state.cbldDirectory = buildContextDirectory(contexts);
    $('#governedNotice').textContent = 'Chọn CBLĐ và CSKH. Phạm vi sẽ được kiểm tra trên máy chủ trước khi mở công việc.';
    resetEntry();
  } catch {
    $('#cbldList').innerHTML = '<div class="empty" role="alert"><h3>Chưa tải được danh sách</h3><p>Kiểm tra kết nối rồi thử lại. Chưa có dữ liệu để mở công việc.</p><button id="retry">Thử lại</button></div>';
    $('#retry').onclick = load;
  }
}
function resetEntry() {
  state.data=[];state.events=[];state.planHistoryByShop=new Map();state.meta={};state.selectedContext=null;state.cbld=null;state.persona=null;state.editing=null;state.nextIds=[];state.staffFilter=null;state.manager=false;
  $('#entryError').textContent='';
  $('#cbldStep').hidden=false;$('#cskhStep').hidden=true;$('#entryConfirm').hidden=true;
  $('#cbldList').innerHTML=state.cbldDirectory.map(cbld=>`<button class="person-choice" data-cbld="${esc(cbld.id)}"><div><b>${esc(cbld.name)}</b><span>${cbld.staff.length} CSKH · Chọn để kiểm tra phạm vi</span></div><em aria-hidden="true">→</em></button>`).join('');
  $('#staffList').innerHTML='';
}
function selectCbld(id) {
  state.cbld=state.cbldDirectory.find(cbld=>cbld.id===id)||null;state.persona=null;
  if(!state.cbld)return;
  $('#entryError').textContent='';
  $('#cbldStep').hidden=true;$('#cskhStep').hidden=false;$('#entryConfirm').hidden=true;
  $('#selectedCbldText').textContent=`CBLĐ: ${state.cbld.name}`;
  $('#staffList').innerHTML=state.cbld.staff.map(person=>`<button class="person-choice" data-person="${esc(person.id)}"><div><b>${esc(person.name)}</b><span>Chọn để kiểm tra phạm vi được phân công</span></div><em aria-hidden="true">→</em></button>`).join('');
  $('#cskhTitle').setAttribute('tabindex','-1');$('#cskhTitle').focus();
}
async function selectCskh(id) {
  state.persona=state.cbld?.staff.find(person=>person.id===id)||null;
  if(!state.persona)return;
  const context=state.persona.context;
  $('#entryError').textContent='';$('#confirmCbld').textContent=state.cbld.name;$('#confirmCskh').textContent=state.persona.name;$('#confirmCount').textContent='Đang kiểm tra phạm vi…';
  try {
    const result=await state.adapter.loadScoped(context);
    state.data=result.entities;state.events=result.events;state.planHistoryByShop=result.planHistoryByShop||new Map();state.meta=result.meta;state.selectedContext=context;
    $('#cskhStep').hidden=true;$('#entryConfirm').hidden=false;
    $('#confirmCount').textContent=`${state.data.length} gian hàng được phân công`;
    $('#confirmTitle').setAttribute('tabindex','-1');$('#confirmTitle').focus();
  } catch (err) {
    state.data=[];state.events=[];state.planHistoryByShop=new Map();state.meta={};state.selectedContext=null;
    $('#entryError').textContent=friendlyScopeError(err);
  }
}
function enter() {
  if (!state.cbld || !state.persona || !state.selectedContext || !state.data.length) return;
  state.view='work';state.type='ALL';state.query='';state.staffFilter=null;state.manager=false;state.undo=null;
  $('#search').value='';$('#type').value='ALL';$('#toast').hidden=true;$('#entry').hidden=true;$('#workspace').hidden=false;
  render(); window.scrollTo(0,0); $('#personName').setAttribute('tabindex','-1');$('#personName').focus();
}
function render() {
  const all = scope(); const rows = visible();
  $('#personName').textContent=state.persona.name;
  $('#scopeLabel').textContent='CSKH';$('#workspaceCbld').textContent=state.cbld.name;
  $('#scopeCount').textContent=`${all.length} gian hàng được phân công`;
  $('#asOf').textContent=dateLabel(state.meta.debt_as_of_values?.[0]);
  const planNotice=$('#planReadNotice');
  if(!state.meta.plan_state_available){planNotice.hidden=false;planNotice.textContent='PLAN_STATE_UNAVAILABLE · Kế hoạch chưa tải được; số liệu công nợ vẫn giữ nguyên. Không thể lập kế hoạch lúc này.';}
  else if(!state.meta.plan_history_available){planNotice.hidden=false;planNotice.textContent='PLAN_HISTORY_UNAVAILABLE · Tổng kế hoạch được đọc từ máy chủ; lịch sử chưa tải đủ nên tạm khóa thao tác lập kế hoạch.';}
  else{planNotice.hidden=true;planNotice.textContent='';}
  $('#workTitle').textContent=state.manager ? 'Góc duyệt quản lý' : labels[state.view];
  const planUnavailable=all.some(e=>!e.plan_state_available||e.plan_state_stale);
  $('#actionCount').textContent=planUnavailable?'—':all.filter(e=>matchesPersistedQueue(persistedMetrics(e),'work')).length;
  $('#actionCount').setAttribute('aria-label',planUnavailable?'Chưa xác định được trạng thái kế hoạch':'Số gian hàng còn cần lập kế hoạch trong phiên');
  $('#queueFilter').value=state.view;
  for (const o of $('#queueFilter').options) o.textContent=`${o.value==='work'&&planUnavailable?'Cần đối soát':labels[o.value]} (${o.value==='work'&&planUnavailable?'—':all.filter(e=>matchesPersistedQueue(persistedMetrics(e),o.value)).length})`;
  $('.toolbar').hidden=state.manager;$('.list-caption').hidden=state.manager;
  $('#resultCount').textContent=`${rows.length} gian hàng${state.staffFilter ? ' · đang lọc cán bộ' : ''}`;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current', (b.dataset.view === 'work' ? !['due','all'].includes(state.view) : b.dataset.view === state.view) && !state.manager ? 'page':'false'));
  $('#queue').hidden=state.manager;$('#manager').hidden=!state.manager;
  if (state.manager) { renderManager();return; }
  const gapNotice = state.meta.entity_type_contract_gap ? '<div class="contract-note" role="status"><b>Đang chờ bổ sung loại gian hàng</b><span>Danh sách và số liệu đọc từ nguồn governed; bộ lọc SHOP / KHÁC chỉ hoạt động sau khi contract trả về loại nguồn.</span></div>' : '';
  $('#queue').innerHTML=gapNotice + (rows.map(card).join('') || `<div class="empty"><span class="empty-symbol" aria-hidden="true">✓</span><h3>${state.view==='due' ? 'Không có gian hàng đến hoặc quá ngày thu.' : 'Không có gian hàng trong danh sách này.'}</h3><p>${state.view==='due' ? 'Theo các đợt thu đã lưu trong phiên này.' : 'Bạn có thể đổi bộ lọc hoặc xem công việc cần xử lý.'}</p><button data-reset>Xem công việc cần xử lý</button></div>`);
}
function card(e) {
  const m=persistedMetrics(e),ready=e.plan_state_available&&!e.plan_state_stale&&state.meta.plan_history_available;
  return `<article class="work-item" data-entity="${esc(e.canonical_id)}" data-owner="${esc(e.staff_id)}" data-cbld="${esc(e.assigned_cbld)}"><div class="item-top"><div class="identity"><h3>${esc(e.name || e.canonical_id)}</h3><p>${esc(e.staff)}</p></div><span class="badge ${e.presentation_type==='KHÁC'?'other':''}">${e.presentation_type}</span></div><div class="amount-block"><small>Còn phải thu</small><strong class="amount">${money(e.source_reported_remaining)}</strong><div class="subamount">Đã thu · ${money(e.collected_amount)}</div></div><div class="item-plan"><div class="plan-status"><strong>${statusLabels[m.status]}</strong>${m.percent>0?`<b>${m.percent.toLocaleString('vi-VN')}%</b>`:''}</div><span>Đã lập kế hoạch · ${displayCents(m.planned)}</span><span>Còn cần lập · ${displayCents(m.remainder)}</span>${e.plan_state_available?`<span>Đợt đang hiệu lực · ${e.active_plan_count}</span>`:''}${m.nextDate?`<div>${m.due?'Đến / quá ngày thu':'Ngày thu gần nhất'} · ${dateLabel(m.nextDate)}</div>`:''}</div><div class="item-action"><span>${m.excess>0n?'Vượt số còn phải thu '+displayCents(m.excess):'Còn cần lập '+displayCents(m.remainder)}</span><button data-plan="${esc(e.canonical_id)}" ${ready?'':'disabled'}>${ready?'Lập đợt kế hoạch mới':'Kế hoạch chưa sẵn sàng'} →</button></div></article>`;
}
function changeView(view) {state.view=view;state.manager=false;render();window.scrollTo(0,0);}
function renderPlanHistory(shopId) {
  if(!state.meta.plan_history_available)return '<p role="status">Lịch sử kế hoạch chưa tải được. Số liệu không được thay bằng 0.</p>';
  const rows=[...(state.planHistoryByShop.get(shopId)||[])].sort((a,b)=>Date.parse(a.event_time)-Date.parse(b.event_time));
  if(!rows.length)return '<p class="muted">Chưa có lịch sử kế hoạch.</p>';
  return `<ol class="plan-history-list">${rows.map(row=>`<li class="plan-history-row"><div class="plan-history-top"><strong>${esc(planEventLabel(row.event_type))}</strong><span class="history-status status-${esc(row.plan_effective_status.toLowerCase())}">${esc(planStatusLabel(row.plan_effective_status))}</span></div><div>${eventDateTime(row.event_time)} · ${row.amount==null?'Không có số tiền':money(row.amount)}</div><div>Ngày dự kiến · ${row.expected_date?dateLabel(row.expected_date):'Không có'}</div>${row.superseded_by_event_id?`<small>Được thay bởi · ${esc(row.superseded_by_event_id)}</small>`:''}${row.cancelled_reason?`<small>Lý do hủy · ${esc(row.cancelled_reason)}</small>`:''}${row.note?`<small>Ghi chú · ${esc(row.note)}</small>`:''}</li>`).join('')}</ol>`;
}
function openPlan(id, continuing=false) {
  const e=getEntity(id);if(!e)return;
  if(!e.plan_state_available||e.plan_state_stale||!state.meta.plan_history_available){$('#planReadNotice').hidden=false;$('#planReadNotice').textContent='PLAN_STATE_UNAVAILABLE · Chưa thể mở biểu mẫu khi trạng thái kế hoạch chưa được xác nhận.';return;}
  if(!continuing) { state.nextIds=visible().map(e=>e.canonical_id); state.queueScroll=window.scrollY; }
  state.editing=e;state.dirty=false;
  const m=persistedMetrics(e);
  $('#planTitle').textContent=e.name||e.canonical_id;$('#planType').textContent=e.presentation_type;$('#planStaff').textContent=`CSKH: ${e.staff} · CBLĐ: ${state.cbld.name}`;
  $('#planReference').textContent=money(e.official_outstanding);$('#priorPlan').textContent=money(e.active_plan_total);$('#priorRemaining').textContent=money(e.remaining_unplanned_amount);$('#activePlanCount').textContent=String(e.active_plan_count);
  $('#existingNote').textContent=`Kế hoạch đã lưu được giữ nguyên trong lịch sử. Biểu mẫu này chỉ ghi thêm đợt mới; ${e.active_plan_count} đợt hiện đang hiệu lực.`;
  $('#planHistory').innerHTML=renderPlanHistory(e.canonical_id);
  $('#installments').innerHTML='';addPart();
  $('#formError').textContent='';$('#readbackWarning').hidden=true;$('#retryPlanReadback').hidden=true;$('#discard').hidden=true;$('#planFeedback').textContent=continuing?'Đã đối soát gian hàng trước. Tiếp tục với gian hàng này.':'';
  preview();if(!$('#planner').open)$('#planner').showModal();$('.sheet-body').scrollTop=0;$('#planTitle').focus();
}
function addPart(p={amount:'',date:'',note:''}) {
  const n=$('#installments').children.length+1;
  const node=document.createElement('fieldset');node.className='installment';
  node.innerHTML=`<legend>Đợt thu ${n}</legend><label for="amount${n}">Số tiền dự kiến thu</label><div class="money-wrap"><input id="amount${n}" name="amount" inputmode="numeric" autocomplete="off" value="${esc(groupDigits(p.amount))}" aria-describedby="formError"><span>đ</span></div><div class="date-grid"><label for="date${n}">Ngày dự kiến thu</label><div class="date-control"><span class="date-display" id="dateDisplay${n}" aria-hidden="true">${p.date?dateLabel(p.date):'DD/MM/YYYY'}</span><span class="date-icon" aria-hidden="true">▦</span><input class="date-native" id="date${n}" name="date" type="date" value="${esc(p.date)}" aria-describedby="dateDisplay${n} datePreview${n} formError"></div><span class="date-preview" id="datePreview${n}">${p.date?'':'Chưa chọn ngày'}</span></div><div class="date-shortcuts" aria-label="Chọn ngày nhanh"><button type="button" data-days="0">Hôm nay</button><button type="button" data-days="1">Ngày mai</button><button type="button" data-days="3">+3 ngày</button><button type="button" data-days="7">+7 ngày</button></div><label class="note-label" for="note${n}">Ghi chú <span class="muted">· không bắt buộc</span></label><textarea id="note${n}" name="note" rows="2" maxlength="500">${esc(p.note)}</textarea>`;
  $('#installments').append(node);
}
function rawParts(){return [...document.querySelectorAll('.installment')].map(row=>({amount:row.querySelector('[name=amount]').value,date:row.querySelector('[name=date]').value,note:row.querySelector('[name=note]').value}));}
function preview(){
  const raw=rawParts(),valid=raw.every(p=>parseInput(p.amount)!==null);
  if(!valid){$('#previewRemaining').textContent='Nhập số tiền để xem';$('#excessNote').textContent='';return;}
  const base=cents(state.editing?.remaining_unplanned_amount),draft=raw.reduce((sum,p)=>sum+BigInt(parseInput(p.amount))*100n,0n),remaining=base>draft?base-draft:0n,excess=draft>base?draft-base:0n;
  $('#previewRemaining').textContent=displayCents(remaining);
  $('#excessNote').textContent=excess>0n?`Đợt mới vượt số còn cần lập ${displayCents(excess)}. Tổng kế hoạch vượt mức vẫn được hiển thị để kiểm tra.`:'';
}
function setSubmitLocked(locked){state.submitting=locked;document.querySelectorAll('#planForm button[type="submit"]').forEach(button=>{button.disabled=locked;});$('#planForm').setAttribute('aria-busy',locked?'true':'false');}
function requestClose(){if(state.submitting){$('#planFeedback').textContent='Đang gửi và đối soát với máy chủ. Vui lòng chờ trước khi đóng.';return;}if(state.writeOutcomeUnconfirmed){$('#readbackWarning').hidden=false;$('#readbackWarning').textContent='Chưa xác nhận được dữ liệu sau khi gửi. Hãy tải lại trạng thái trước khi đóng hoặc gửi lại.';$('#retryPlanReadback').focus();return;}if(state.dirty){$('#discard').hidden=false;$('#discard').scrollIntoView({block:'nearest'});$('#keepEditing').focus();}else $('#planner').close();}
async function refreshPlanReadback(){
  const e=state.editing;if(!e)return false;
  try {
    const result=await state.adapter.loadPlanReadback(state.selectedContext,e.canonical_id);
    e.plan_state_available=true;e.plan_state_stale=false;e.official_outstanding=result.planState.official_outstanding;e.active_plan_total=result.planState.active_plan_total;e.remaining_unplanned_amount=result.planState.remaining_unplanned_amount;e.active_plan_count=result.planState.active_plan_count;e.latest_plan_at=result.planState.latest_plan_at;e.plan_coverage_status=result.planState.plan_coverage_status;
    state.planHistoryByShop.set(e.canonical_id,result.history);state.meta.cutoff_at=result.cutoffAt||state.meta.cutoff_at;state.meta.plan_state_available=true;state.meta.plan_history_available=true;
    state.writeOutcomeUnconfirmed=false;setSubmitLocked(false);$('#readbackWarning').hidden=true;$('#retryPlanReadback').hidden=true;return true;
  } catch {
    e.plan_state_stale=true;state.writeOutcomeUnconfirmed=true;setSubmitLocked(true);$('#readbackWarning').hidden=false;$('#readbackWarning').textContent='Đã gửi yêu cầu nhưng chưa đối soát được trạng thái đã lưu. Không gửi lại để tránh tạo đợt trùng; hãy thử tải lại trạng thái.';$('#retryPlanReadback').hidden=false;return false;
  }
}
async function save(event){
  event.preventDefault();if(state.submitting||state.writeOutcomeUnconfirmed)return;const raw=rawParts();let validated;
  document.querySelectorAll('#planner input').forEach(i=>i.removeAttribute('aria-invalid'));
  try {validated=validateParts(raw);}catch(err){$('#formError').textContent=err.message;const num=Number(err.message.match(/Đợt (\d+)/)?.[1]);const target=$(`#${err.message.includes('số tiền')?'amount':'date'}${num}`);target?.setAttribute('aria-invalid','true');target?.focus();return;}
  const e=state.editing,submitIntent=event.submitter?.value;setSubmitLocked(true);$('#formError').textContent='';
  try { state.lastWrite=await state.adapter.appendPlan({context:state.selectedContext,shopId:e.canonical_id,installments:validated}); }
  catch (err) { $('#formError').textContent=friendlyScopeError(err);setSubmitLocked(false);return; }
  if(state.lastWrite?.dry_run){$('#formError').textContent='Đây là bản thử nghiệm; chưa có kế hoạch nào được ghi vào máy chủ.';setSubmitLocked(false);return;}
  state.writeOutcomeUnconfirmed=true;$('#readbackWarning').hidden=false;$('#readbackWarning').textContent='Đã ghi. Đang đọc lại trạng thái và lịch sử từ máy chủ…';
  if(!await refreshPlanReadback())return;
  state.dirty=false;state.undo=null;$('#planner').close();render();
  $('#toastText').textContent=`Đã ghi và đối soát ${validated.length} đợt thu · ${e.canonical_id}`;$('#toast').hidden=false;$('#undo').hidden=true;
  if(submitIntent==='next'){
    const position=state.nextIds.indexOf(e.canonical_id);
    const next=state.nextIds.slice(position+1).find(id=>{const item=getEntity(id);return item&&matchesPersistedQueue(persistedMetrics(item),state.view);});
    if(next)openPlan(next,true);else{$('#toastText').textContent+=' · Đã đến cuối danh sách.';$('#queue').focus();}
  }
}
function information(){
  const all=scope(),hasPlanState=all.every(e=>e.plan_state_available&&!e.plan_state_stale);const sum=f=>all.reduce((s,e)=>s+cents(e[f]),0n);const planned=hasPlanState?all.reduce((s,e)=>s+cents(e.active_plan_total),0n):null;const rem=hasPlanState?all.reduce((s,e)=>s+cents(e.remaining_unplanned_amount),0n):null;
  const meta=state.meta;
  $('#infoBody').innerHTML=`<p class="muted">Số liệu cập nhật đến ${dateLabel(meta.debt_as_of_values?.[0])}. Trạng thái kế hoạch được đọc từ governed server read model.</p><p><b>CBLĐ:</b> ${esc(state.cbld.name)}<br><b>CSKH:</b> ${esc(state.persona.name)}</p><div class="info-stats"><div><span>Còn phải thu · ${all.length} gian hàng</span><b>${displayCents(sum('source_reported_remaining'))}</b></div><div><span>Đã thu · hiển thị riêng</span><b>${displayCents(sum('collected_amount'))}</b></div><div><span>Đã lập kế hoạch</span><b>${displayCents(planned)}</b></div><div><span>Còn cần lập kế hoạch</span><b>${displayCents(rem)}</b></div></div><p>Trạng thái và tổng kế hoạch lấy từ RPC đọc có kiểm tra scope; lịch sử chỉ để tra cứu, không tự cộng ở giao diện.</p><details><summary>Thông tin số liệu</summary><p>Phạm vi ${esc(meta.project_id)} · ${Number(meta.current_row_count||all.length).toLocaleString('vi-VN')} gian hàng · cập nhật ${esc(dateLabel(meta.debt_as_of_values?.[0]))}.</p><p>Nếu trạng thái hoặc lịch sử kế hoạch chưa tải được, giao diện hiển thị cảnh báo và không giả định tổng kế hoạch bằng 0.</p><p>Loại nguồn SHOP / KIOSK / KDQC chưa có trong contract đọc hiện tại. Không suy đoán loại từ mã gian hàng.</p></details><details><summary>Công cụ duyệt bản thử nghiệm</summary><p>Bộ chọn CBLĐ → CSKH là lựa chọn context vận hành trong sandbox, không phải danh tính đã xác minh. Context được máy chủ kiểm tra trước khi mở phạm vi.</p><button id="openManager">Góc duyệt quản lý · Thử nghiệm</button><p>Thử trạng thái giao diện (không thay dữ liệu):</p><button data-demo="loading">Đang tải</button> <button data-demo="error">Lỗi tải</button></details>`;
  $('#information').showModal();
}
function renderManager(){
  const rows=buildStaffDirectory(scope());
  $('#manager').innerHTML=`<section class="manager-head"><small>GÓC DUYỆT · THỬ NGHIỆM</small><h2>Phân bổ công việc</h2><p>Phạm vi theo Assignment authority; kế hoạch lấy từ governed server read model.</p><p>Thứ tự theo tên, không đánh giá hiệu suất.</p><button data-back-work>Về công việc</button></section>`+rows.map(p=>{const ms=p.entities.map(e=>persistedMetrics(e));return `<article class="manager-row"><div><strong>${esc(p.name)}</strong><p>${p.entities.length} gian hàng · ${ms.filter(m=>m.remainder!==null&&m.remainder>0n).length} cần lập · ${ms.filter(m=>m.due).length} đến / quá ngày thu</p><p>Còn phải thu · ${displayCents(ms.reduce((s,m)=>s+(m.reference??0n),0n))}</p><p>Đã lập kế hoạch · ${displayCents(ms.every(m=>m.planned!==null)?ms.reduce((s,m)=>s+m.planned,0n):null)} · Còn cần lập ${displayCents(ms.every(m=>m.remainder!==null)?ms.reduce((s,m)=>s+m.remainder,0n):null)}</p></div><button data-drill="${esc(p.id)}">Xem danh sách →</button></article>`;}).join('');
}
$('#cbldList').addEventListener('click',e=>{const b=e.target.closest('[data-cbld]');if(b)selectCbld(b.dataset.cbld);});
$('#staffList').addEventListener('click',e=>{const b=e.target.closest('[data-person]');if(b)selectCskh(b.dataset.person);});
$('#changeCbld').onclick=resetEntry;
$('#confirmChangeCbld').onclick=resetEntry;
$('#changeCskh').onclick=()=>{state.persona=null;$('#entryConfirm').hidden=true;$('#cskhStep').hidden=false;$('#cskhTitle').focus();};
$('#enterWorkspace').onclick=enter;
$('#changeStaff').onclick=()=>{$('#workspace').hidden=true;$('#entry').hidden=false;$('#toast').hidden=true;resetEntry();window.scrollTo(0,0);$('#cbldTitle').setAttribute('tabindex','-1');$('#cbldTitle').focus();};
$('.main-nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b){state.staffFilter=null;changeView(b.dataset.view);}};
$('#queueFilter').onchange=e=>changeView(e.target.value);
$('#type').onchange=e=>{state.type=e.target.value;render();};
$('#search').oninput=e=>{state.query=e.target.value;render();};
$('#queue').onclick=e=>{const b=e.target.closest('[data-plan]');if(b)openPlan(b.dataset.plan);if(e.target.closest('[data-reset]')){state.type='ALL';state.query='';state.staffFilter=null;$('#type').value='ALL';$('#search').value='';changeView('work');}};
$('#info').onclick=information;
$('#information').onclick=e=>{if(e.target.closest('[data-close]'))$('#information').close();if(e.target.closest('#openManager')){$('#information').close();state.manager=true;render();window.scrollTo(0,0);}const demo=e.target.closest('[data-demo]');if(demo){$('#information').close();$('#queue').innerHTML=`<div class="empty" role="status"><h3>${demo.dataset.demo==='loading'?'Đang tải danh sách…':'Chưa tải được danh sách'}</h3><p>Trạng thái minh họa để duyệt giao diện.</p><button data-reset>Trở lại công việc</button></div>`;}};
$('#manager').onclick=e=>{const d=e.target.closest('[data-drill]');if(d){state.staffFilter=d.dataset.drill;state.type='ALL';state.query='';$('#type').value='ALL';$('#search').value='';changeView('all');}if(e.target.closest('[data-back-work]')){state.staffFilter=null;changeView('work');}};
$('#closePlan').onclick=requestClose;$('#planner').addEventListener('cancel',e=>{e.preventDefault();requestClose();});
$('#keepEditing').onclick=()=>{$('#discard').hidden=true;};$('#discardChanges').onclick=()=>{state.dirty=false;$('#planner').close();};
$('#addPart').onclick=()=>{addPart();state.dirty=true;preview();$('#installments').lastElementChild.querySelector('input').focus();};
  $('#installments').addEventListener('input',e=>{state.dirty=true;if(e.target.name==='amount')formatInput(e.target);if(e.target.name==='date'){const row=e.target.closest('.installment');row.querySelector('.date-display').textContent=e.target.value?dateLabel(e.target.value):'DD/MM/YYYY';row.querySelector('.date-preview').textContent=e.target.value?'':'Chưa chọn ngày';}$('#formError').textContent='';e.target.removeAttribute('aria-invalid');preview();});
$('#installments').addEventListener('paste',e=>{if(e.target.name!=='amount')return;const pasted=e.clipboardData.getData('text');if(parseInput(pasted)===null){e.preventDefault();$('#formError').textContent='Chỉ dán số tiền nguyên VND; dấu chấm chỉ dùng phân nhóm hàng nghìn.';e.target.setAttribute('aria-invalid','true');}});
$('#installments').onclick=e=>{const b=e.target.closest('[data-days]');if(b){const row=b.closest('.installment');const date=addDays(today(),Number(b.dataset.days));row.querySelector('[name=date]').value=date;row.querySelector('.date-display').textContent=dateLabel(date);row.querySelector('.date-preview').textContent='';state.dirty=true;}};
$('#planForm').onsubmit=save;
$('#retryPlanReadback').onclick=async()=>{if(state.submitting)return;$('#retryPlanReadback').disabled=true;setSubmitLocked(true);const ok=await refreshPlanReadback();$('#retryPlanReadback').disabled=false;if(ok){state.dirty=false;$('#planner').close();render();$('#toastText').textContent='Trạng thái kế hoạch và lịch sử đã được đối soát.';$('#toast').hidden=false;$('#undo').hidden=true;}};
$('#undo').onclick=()=>{};
function connection(){ $('#connection').hidden=navigator.onLine; }
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
$('#planner').addEventListener('close',()=>{requestAnimationFrame(()=>{if(!$('#planner').open)window.scrollTo(0,state.queueScroll);});});
$('#installments').addEventListener('beforeinput',e=>{if(e.target.name==='amount' && e.inputType==='insertText' && e.data && /\D/.test(e.data)){e.preventDefault();$('#formError').textContent='Nhập chữ số nguyên VND. Dấu phân nhóm được thêm tự động.';}});
await load();


