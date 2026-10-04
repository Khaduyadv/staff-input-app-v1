import { createAdapter } from './governed-read-adapter.js?v=20261004-governed-r1';
import { buildStaffDirectory, normalizeStaffSearch } from './staff-entry-model.js?v=20261004-v23-final-r1';
import { cents, money, displayCents, groupDigits, parseInput, formatInput, today, addDays, dateLabel, metrics, matchesQueue, compareItems, planKey, validateParts } from './workbench-model.js?v=20261004-v23-final-r1';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { mode:'scoped', adapter:null, data:[], events:[], meta:{}, selectedContext:null, cbldDirectory:[], cbld:null, persona:null, view:'work', type:'ALL', query:'', plans:new Map(), staffFilter:null, manager:false, editing:null, nextIds:[], dirty:false, undo:null, queueScroll:0 };
const labels = { work:'Cần xử lý', needs:'Chưa có kế hoạch', partial:'Chưa lập đủ kế hoạch', due:'Đến / quá ngày thu', covered:'Đã lập đủ kế hoạch', all:'Danh mục được phân công' };
const statusLabels = { needs:'Chưa có kế hoạch', partial:'Chưa lập đủ', covered:'Đã lập đủ', zero:'Số còn phải thu bằng 0', unknown:'Chưa đối soát' };
const key = e => planKey(state.meta.project_id, state.persona?.id, e.canonical_id);
const parts = e => state.plans.get(key(e)) || [];
const scope = () => state.data;
const visible = () => scope().filter(e => (!state.staffFilter || e.staff_id === state.staffFilter) && (state.type === 'ALL' || e.presentation_type === state.type) && normalizeStaffSearch(e.name || e.canonical_id).includes(normalizeStaffSearch(state.query)) && matchesQueue(metrics(e,parts(e)),state.view)).sort((a,b) => compareItems(a,b,parts));
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
  state.data=[];state.events=[];state.meta={};state.selectedContext=null;state.cbld=null;state.persona=null;state.editing=null;state.nextIds=[];state.staffFilter=null;state.manager=false;
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
    state.data=result.entities;state.events=result.events;state.meta=result.meta;state.selectedContext=context;
    $('#cskhStep').hidden=true;$('#entryConfirm').hidden=false;
    $('#confirmCount').textContent=`${state.data.length} gian hàng được phân công`;
    $('#confirmTitle').setAttribute('tabindex','-1');$('#confirmTitle').focus();
  } catch (err) {
    state.data=[];state.events=[];state.meta={};state.selectedContext=null;
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
  $('#workTitle').textContent=state.manager ? 'Góc duyệt quản lý' : labels[state.view];
  $('#actionCount').textContent=all.filter(e=>matchesQueue(metrics(e,parts(e)),'work')).length;
  $('#actionCount').setAttribute('aria-label','Số gian hàng còn cần lập kế hoạch trong phiên');
  $('#queueFilter').value=state.view;
  for (const o of $('#queueFilter').options) o.textContent=`${labels[o.value]} (${all.filter(e=>matchesQueue(metrics(e,parts(e)),o.value)).length})`;
  $('.toolbar').hidden=state.manager;$('.list-caption').hidden=state.manager;
  $('#resultCount').textContent=`${rows.length} gian hàng${state.staffFilter ? ' · đang lọc cán bộ' : ''}`;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current', (b.dataset.view === 'work' ? !['due','all'].includes(state.view) : b.dataset.view === state.view) && !state.manager ? 'page':'false'));
  $('#queue').hidden=state.manager;$('#manager').hidden=!state.manager;
  if (state.manager) { renderManager();return; }
  const gapNotice = state.meta.entity_type_contract_gap ? '<div class="contract-note" role="status"><b>Đang chờ bổ sung loại gian hàng</b><span>Danh sách và số liệu đọc từ nguồn governed; bộ lọc SHOP / KHÁC chỉ hoạt động sau khi contract trả về loại nguồn.</span></div>' : '';
  $('#queue').innerHTML=gapNotice + (rows.map(card).join('') || `<div class="empty"><span class="empty-symbol" aria-hidden="true">✓</span><h3>${state.view==='due' ? 'Không có gian hàng đến hoặc quá ngày thu.' : 'Không có gian hàng trong danh sách này.'}</h3><p>${state.view==='due' ? 'Theo các đợt thu đã lưu trong phiên này.' : 'Bạn có thể đổi bộ lọc hoặc xem công việc cần xử lý.'}</p><button data-reset>Xem công việc cần xử lý</button></div>`);
}
function card(e) {
  const m=metrics(e,parts(e));
  return `<article class="work-item" data-entity="${esc(e.canonical_id)}" data-owner="${esc(e.staff_id)}" data-cbld="${esc(e.assigned_cbld)}"><div class="item-top"><div class="identity"><h3>${esc(e.name || e.canonical_id)}</h3><p>${esc(e.staff)}</p></div><span class="badge ${e.presentation_type==='KHÁC'?'other':''}">${e.presentation_type}</span></div><div class="amount-block"><small>Còn phải thu</small><strong class="amount">${money(e.source_reported_remaining)}</strong><div class="subamount">Đã thu · ${money(e.collected_amount)}</div></div><div class="item-plan"><div class="plan-status"><strong>${statusLabels[m.status]}</strong>${m.percent>0?`<b>${m.percent.toLocaleString('vi-VN')}%</b>`:''}</div><span>Kế hoạch đã lưu · ${displayCents(m.planned)}</span>${m.nextDate?`<div>${m.due?'Đến / quá ngày thu':'Ngày thu gần nhất'} · ${dateLabel(m.nextDate)}</div>`:''}</div><div class="item-action"><span>${m.excess>0n?'Vượt số còn phải thu '+displayCents(m.excess):'Còn cần lập '+displayCents(m.remainder)}</span><button data-plan="${esc(e.canonical_id)}">${parts(e).length?'Cập nhật kế hoạch':'Lập kế hoạch'} →</button></div></article>`;
}
function changeView(view) {state.view=view;state.manager=false;render();window.scrollTo(0,0);}
function openPlan(id, continuing=false) {
  const e=getEntity(id);if(!e)return;
  if(!continuing) { state.nextIds=visible().map(e=>e.canonical_id); state.queueScroll=window.scrollY; }
  state.editing=e;state.dirty=false;
  const saved=parts(e),m=metrics(e,saved);
  $('#planTitle').textContent=e.name||e.canonical_id;$('#planType').textContent=e.presentation_type;$('#planStaff').textContent=`CSKH: ${e.staff} · CBLĐ: ${state.cbld.name}`;
  $('#planReference').textContent=money(e.source_reported_remaining);$('#priorPlan').textContent=displayCents(m.planned);$('#priorRemaining').textContent=displayCents(m.remainder);
  $('#existingNote').textContent=saved.length?`${saved.length} đợt đã lưu. Bạn có thể chỉnh sửa hoặc thêm đợt; các đợt cũ vẫn được giữ.`:'Nhập số tiền và ngày dự kiến cho từng đợt thu.';
  $('#installments').innerHTML='';(saved.length?saved:[{amount:'',date:'',note:''}]).forEach(addPart);
  $('#formError').textContent='';$('#discard').hidden=true;$('#planFeedback').textContent=continuing?'Đã lưu gian hàng trước. Tiếp tục với gian hàng này.':'';
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
  const raw=rawParts();const valid=raw.every(p=>parseInput(p.amount)!==null);
  if(!valid){$('#previewRemaining').textContent='Nhập số tiền để xem';$('#excessNote').textContent='';return;}
  const m=metrics(state.editing,raw.map(p=>({...p,amount:parseInput(p.amount)})));
  $('#previewRemaining').textContent=displayCents(m.remainder);
  $('#excessNote').textContent=m.excess>0n?`Kế hoạch vượt số tham chiếu ${displayCents(m.excess)}. Hãy kiểm tra trước khi lưu.`:'';
}
function requestClose(){if(state.dirty){$('#discard').hidden=false;$('#discard').scrollIntoView({block:'nearest'});$('#keepEditing').focus();}else $('#planner').close();}
async function save(event){
  event.preventDefault();const raw=rawParts();let validated;
  document.querySelectorAll('#planner input').forEach(i=>i.removeAttribute('aria-invalid'));
  try {validated=validateParts(raw);}catch(err){$('#formError').textContent=err.message;const num=Number(err.message.match(/Đợt (\d+)/)?.[1]);const target=$(`#${err.message.includes('số tiền')?'amount':'date'}${num}`);target?.setAttribute('aria-invalid','true');target?.focus();return;}
  const e=state.editing;const k=key(e);state.undo={key:k,previous:structuredClone(parts(e)),entity:e.canonical_id};
  try { state.lastWrite=await state.adapter.appendPlan({context:state.selectedContext,shopId:e.canonical_id,installments:validated}); }
  catch (err) { $('#formError').textContent=friendlyScopeError(err); return; }
  state.plans.set(k,validated);state.dirty=false;$('#planner').close();render();
  $('#toastText').textContent=`${state.lastWrite?.dry_run?'Đã lưu bản thử nghiệm':'Đã lưu'} ${validated.length} đợt thu · ${e.canonical_id}`;$('#toast').hidden=false;
  if(event.submitter?.value==='next'){
    const position=state.nextIds.indexOf(e.canonical_id);
    const next=state.nextIds.slice(position+1).find(id=>{const item=getEntity(id);return item&&matchesQueue(metrics(item,parts(item)),state.view);});
    if(next)openPlan(next,true);else{$('#toastText').textContent+=' · Đã đến cuối danh sách.';$('#queue').focus();}
  }
}
function information(){
  const all=scope();const sum=f=>all.reduce((s,e)=>s+cents(e[f]),0n);const planned=all.reduce((s,e)=>s+metrics(e,parts(e)).planned,0n);const rem=all.reduce((s,e)=>s+metrics(e,parts(e)).remainder,0n);
  const meta=state.meta;
  $('#infoBody').innerHTML=`<p class="muted">Số liệu cập nhật đến ${dateLabel(meta.debt_as_of_values?.[0])}. Kế hoạch bạn nhập chỉ có trong phiên này; tải lại trang sẽ xóa kế hoạch thử.</p><p><b>CBLĐ:</b> ${esc(state.cbld.name)}<br><b>CSKH:</b> ${esc(state.persona.name)}</p><div class="info-stats"><div><span>Còn phải thu tham chiếu · ${all.length} gian hàng</span><b>${displayCents(sum('source_reported_remaining'))}</b></div><div><span>Đã thu · hiển thị riêng</span><b>${displayCents(sum('collected_amount'))}</b></div><div><span>Kế hoạch thu đã lưu trong phiên</span><b>${displayCents(planned)}</b></div><div><span>Còn cần lập kế hoạch</span><b>${displayCents(rem)}</b></div></div><p>Đây là số liệu đọc theo phạm vi đã được máy chủ kiểm tra. Danh sách đến ngày thu chỉ dựa trên ngày kế hoạch bạn nhập.</p><details><summary>Thông tin số liệu</summary><p>Phạm vi ${esc(meta.project_id)} · ${Number(meta.current_row_count||all.length).toLocaleString('vi-VN')} gian hàng · cập nhật ${esc(dateLabel(meta.debt_as_of_values?.[0]))}.</p><p>Số còn phải thu tham chiếu lấy từ trường số dư được contract trả về; đã thu lấy từ trường đã thu cùng nguồn. Hai trường này chưa có xác nhận semantic production, nên không được gọi là tổng nợ chính thức.</p><p>Loại nguồn SHOP / KIOSK / KDQC chưa có trong contract đọc hiện tại. Không suy đoán loại từ mã gian hàng; bộ lọc SHOP / KHÁC sẽ hoạt động sau khi contract bổ sung trường này.</p><p>Kế hoạch cục bộ tính bằng số nguyên chính xác; bộ ghi sự kiện V1.1 chỉ được bật khi sandbox được cấu hình cho phép.</p></details><details><summary>Công cụ duyệt bản thử nghiệm</summary><p>Bộ chọn CBLĐ → CSKH là lựa chọn context vận hành trong sandbox, không phải đăng nhập hay danh tính đã xác minh. Context được máy chủ kiểm tra trước khi mở phạm vi.</p><button id="openManager">Góc duyệt quản lý · Thử nghiệm</button><p>Thử trạng thái giao diện (không thay dữ liệu):</p><button data-demo="loading">Đang tải</button> <button data-demo="error">Lỗi tải</button></details>`;
  $('#information').showModal();
}
function renderManager(){
  const rows=buildStaffDirectory(scope());
  $('#manager').innerHTML=`<section class="manager-head"><small>GÓC DUYỆT · THỬ NGHIỆM</small><h2>Phân bổ công việc</h2><p>Phạm vi theo phân công tham chiếu; chưa xác nhận quyền quản lý. Kế hoạch chỉ tính trong phiên của cán bộ đang chọn.</p><p>Thứ tự theo tên, không đánh giá hiệu suất.</p><button data-back-work>Về công việc</button></section>`+rows.map(p=>{const ms=p.entities.map(e=>metrics(e,parts(e)));return `<article class="manager-row"><div><strong>${esc(p.name)}</strong><p>${p.entities.length} gian hàng · ${ms.filter(m=>m.remainder>0n).length} cần lập · ${ms.filter(m=>m.due).length} đến / quá ngày thu</p><p>Còn phải thu tham chiếu · ${displayCents(ms.reduce((s,m)=>s+m.reference,0n))}</p><p>Đã lập trong phiên · ${displayCents(ms.reduce((s,m)=>s+m.planned,0n))} · Còn cần lập ${displayCents(ms.reduce((s,m)=>s+m.remainder,0n))}</p></div><button data-drill="${esc(p.id)}">Xem danh sách →</button></article>`;}).join('');
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
$('#undo').onclick=()=>{if(!state.undo)return;state.plans.set(state.undo.key,state.undo.previous);state.undo=null;$('#toastText').textContent='Đã hoàn tác lần lưu gần nhất.';$('#toast').hidden=true;render();};
function connection(){ $('#connection').hidden=navigator.onLine; }
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
$('#planner').addEventListener('close',()=>{requestAnimationFrame(()=>{if(!$('#planner').open)window.scrollTo(0,state.queueScroll);});});
$('#installments').addEventListener('beforeinput',e=>{if(e.target.name==='amount' && e.inputType==='insertText' && e.data && /\D/.test(e.data)){e.preventDefault();$('#formError').textContent='Nhập chữ số nguyên VND. Dấu phân nhóm được thêm tự động.';}});
await load();


