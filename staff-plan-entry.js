// Zero-login Staff Plan only. No Supabase session, no debt RPC, no frontend secret.
import {deriveShopKpis,formatScaledVnd,stableCanonical} from './shop-kpi-reference.mjs?v=20261028-shop-kpi-v1';
const API='https://aniuuzfacpvpgiotikik.supabase.co/functions/v1/staff-plan-public-v1';
const DEBT_REFERENCE_BASE='https://khaduyadv.github.io/Dashboard-thuno/';
const LABEL='UNVERIFIED_STAFF_PLAN_INPUT';
const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('vi-VN').format(Number(value))+' ₫';
const pendingKey='cong-no:staff-plan-pending-v1';
let catalog=[],lead='',staff='',shop=null,busy=false;
let debtReferencePromise=null;
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function button(text,handler){const node=element('button',text,'staff-card');node.type='button';node.addEventListener('click',handler);return node;}
async function api(action,payload={}){
  const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok||data.error){const error=new Error(data.error||'API_UNAVAILABLE');error.status=response.status;throw error;}return data;
}
async function loadDebtReference(){
  if(!debtReferencePromise)debtReferencePromise=(async()=>{
    const nonce='?readback='+Date.now();
    const [manifestResponse,dataResponse]=await Promise.all([
      fetch(DEBT_REFERENCE_BASE+'COMPOSITE_DASHBOARD_RELEASE_MANIFEST.json'+nonce,{cache:'no-store',signal:AbortSignal.timeout(15000)}),
      fetch(DEBT_REFERENCE_BASE+'shop-debt-reference.json'+nonce,{cache:'no-store',signal:AbortSignal.timeout(15000)})
    ]);
    if(!manifestResponse.ok||!dataResponse.ok)throw new Error('REFERENCE_NOT_PUBLISHED');
    const [manifest,bytes]=await Promise.all([manifestResponse.json(),dataResponse.arrayBuffer()]);
    const expected=manifest?.files_sha256?.['shop-debt-reference.json'];
    if(!/^[0-9a-f]{64}$/.test(expected||''))throw new Error('REFERENCE_HASH_MISSING');
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==expected)throw new Error('REFERENCE_HASH_MISMATCH');
    const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(payload.schema!=='CONG_NO_PUBLIC_SHOP_BALANCE_REFERENCE/1'||payload.latest_actual_run_id!==manifest.run_id||payload.latest_actual_certificate_sha256!==manifest.actual?.certificate_sha256)throw new Error('REFERENCE_RUN_BINDING_MISMATCH');
    if(payload.snapshot&&payload.snapshot_sha256){
      const canonical=stableCanonical(payload.snapshot);
      const inner=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(inner!==payload.snapshot_sha256)throw new Error('REFERENCE_SNAPSHOT_HASH_MISMATCH');
    }
    return {manifest,payload};
  })();
  return debtReferencePromise;
}
function renderDebtPlanSummary(row,plans,bundle){
  const section=document.querySelector('.plan-context');
  section.hidden=false;
  section.querySelector('small').textContent='SỐ CÒN PHẢI THU & MỨC ĐỘ LẬP KẾ HOẠCH';
  const labels=section.querySelectorAll('div span');
  if(labels[0])labels[0].textContent='Kế hoạch ACTIVE đã ghi nhận';
  if(labels[1])labels[1].textContent='Cần lập thêm theo tham chiếu';
  if(labels[2])labels[2].textContent='Tỷ lệ lập kế hoạch';
  const meta=section.querySelector('.debt-disclosure');
  const snapshot=bundle?.payload?.snapshot;
  const metrics=deriveShopKpis(row.shop_id,plans,bundle?.payload,bundle?.manifest);
  $('priorPlan').textContent=metrics.plansComplete?formatScaledVnd(metrics.planTotal*1000000n):'UNAVAILABLE';
  const staleRef=bundle?.payload?.reference_status==='STALE_LAST_VALID_REFERENCE';
  const balanceUnits=metrics.balance;
  $('planReference').textContent=balanceUnits===null?'UNAVAILABLE — không có dòng Shop trong snapshot':formatScaledVnd(balanceUnits);
  $('priorRemaining').textContent='UNAVAILABLE';
  $('activePlanCount').textContent='UNAVAILABLE';
  if(metrics.gap!==null){
    $('priorRemaining').textContent=formatScaledVnd(metrics.gap);
    if(metrics.coverage!==null){
      $('activePlanCount').textContent=metrics.coverage.toLocaleString('vi-VN',{maximumFractionDigits:2})+'% · '+metrics.activeCount+' kỳ';
    }else $('activePlanCount').textContent='Không áp dụng (tham chiếu bằng 0) · '+metrics.activeCount+' kỳ';
  }
  if(meta){
    const source=snapshot?.source||{};
    const reportPeriod=`Kỳ báo cáo theo certificate: ${source.business_report_as_of||'CHƯA RÕ'}`;
    meta.textContent=`Nguồn ${source.sheet||'UNAVAILABLE'}!${source.balance_cell_range||''} · RUN ${snapshot?.source_run_id||'UNAVAILABLE'} · ${reportPeriod} · SAP_REPORT_AS_OF: CHƯA ĐƯỢC CHỨNG MINH. Đây là số theo workbook tham chiếu, không khẳng định dư nợ SAP hiện hành.`;
  }
  if(staleRef){
    if(meta)meta.textContent='THAM CHIẾU CŨ — RUN Actual mới nhất đã thay đổi; số đang xem thuộc RUN '+(snapshot?.source_run_id||'UNAVAILABLE')+'. '+(meta.textContent||'');
    $('planReference').textContent=balanceUnits===null?'UNAVAILABLE — snapshot cũ không có Shop':formatScaledVnd(balanceUnits)+' · CŨ';
    $('priorRemaining').textContent='UNAVAILABLE · THAM CHIẾU CŨ';$('activePlanCount').textContent='UNAVAILABLE · THAM CHIẾU CŨ';
  }
  if(!metrics.plansComplete){$('priorPlan').textContent='UNAVAILABLE — kế hoạch bị phân trang';}
}
const scoped=()=>catalog.filter(row=>row.cbld===lead&&row.cskh===staff);
function showStaff(){
  $('entryError').textContent='';$('cbldStep').hidden=true;$('cskhStep').hidden=false;$('entryConfirm').hidden=true;
  $('selectedCbldText').textContent=lead;$('staffList').replaceChildren();
  for(const name of [...new Set(catalog.filter(row=>row.cbld===lead).map(row=>row.cskh))].sort())$('staffList').append(button(name,()=>{staff=name;showWorkspace();}));
}
function showLeads(){lead='';staff='';$('workspace').hidden=true;$('entry').hidden=false;$('cbldStep').hidden=false;$('cskhStep').hidden=true;$('entryConfirm').hidden=true;$('cbldList').replaceChildren();for(const name of [...new Set(catalog.map(row=>row.cbld))].sort())$('cbldList').append(button(name,()=>{lead=name;showStaff();}));}
function showWorkspace(){
  $('entry').hidden=true;$('workspace').hidden=false;$('personName').textContent=staff;$('workspaceCbld').textContent=lead;$('scopeCount').textContent=scoped().length+' Shop';$('workTitle').textContent='Chọn Shop để lập kế hoạch';renderShops();
}
function renderShops(){const term=$('search').value.trim().toLocaleLowerCase('vi');const rows=scoped().filter(r=>r.shop_id.toLocaleLowerCase('vi').includes(term));$('queue').replaceChildren();$('resultCount').textContent=rows.length+' Shop theo Assignment 27/10/2026';$('actionCount').textContent=String(rows.length);for(const row of rows){const card=element('article',undefined,'shop-card');card.append(element('h3',row.shop_id),element('p',row.cskh+' · '+row.cbld),button('Nhập / xem kế hoạch',()=>openShop(row)));$('queue').append(card);}}
async function showPlans(){
  const result=await api('plans',{shop_id:shop.shop_id});
  if(result.shop_id!==shop.shop_id||result.input_label!==LABEL)throw new Error('READBACK_SCOPE_MISMATCH');
  $('planHistory').replaceChildren();
  for(const row of result.rows){const card=element('article',undefined,'history-item');card.append(element('strong',money(row.amount_vnd)),element('p',(row.expected_date||'Thiếu ngày')+' · '+row.status),element('small','Cập nhật '+new Date(row.updated_at).toLocaleString('vi-VN')+' · '+row.source));$('planHistory').append(card);}
  if(!result.rows.length)$('planHistory').append(element('p','Chưa có kế hoạch ghi nhận cho Shop này.'));
  if(result.truncated)$('planHistory').append(element('p','Đang hiển thị 200 bản ghi gần nhất; không phải toàn bộ lịch sử.'));
  return result;
}
async function openShop(row){
  if(busy)return;shop=row;$('planTitle').textContent=row.shop_id;$('planStaff').textContent='Trách nhiệm hiện hành: '+row.cskh+' · '+row.cbld+'. Cho phép nhập hộ; không xác minh danh tính người nhập.';
  $('formError').textContent='';$('planFeedback').textContent='';$('readbackWarning').hidden=true;
  $('installments').replaceChildren();
  const amountLabel=element('label','Số tiền kế hoạch (VND)');const amount=element('input');amount.id='zeroPlanAmount';amount.type='number';amount.min='1';amount.max='1000000000000';amount.step='1';amount.required=true;amountLabel.append(amount);
  const dateLabel=element('label','Ngày dự kiến thu');const date=element('input');date.id='zeroPlanDate';date.type='date';date.min='2000-01-01';date.max='2100-12-31';date.required=true;dateLabel.append(date);$('installments').append(amountLabel,dateLabel);
  const pending=readPending();if(pending?.payload?.shop_id===row.shop_id){amount.value=String(pending.payload.amount_vnd);date.value=pending.payload.expected_date;$('formError').textContent='Có lần gửi chưa đối soát xong. Lưu lại sẽ dùng nguyên idempotency key, không tạo yêu cầu mới.';}
  $('planHistory').textContent='Đang đọc kế hoạch…';$('planner').showModal();
  debtReferencePromise=null;
  let planResult=null,bundle=null;
  const [planState,referenceState]=await Promise.allSettled([showPlans(),loadDebtReference()]);
  if(planState.status==='fulfilled')planResult=planState.value;else $('planHistory').textContent='Chưa đọc được kế hoạch.';
  if(referenceState.status==='fulfilled')bundle=referenceState.value;
  try{renderDebtPlanSummary(row,planResult,bundle);}catch{$('planReference').textContent='UNAVAILABLE';$('priorPlan').textContent='UNAVAILABLE';$('priorRemaining').textContent='UNAVAILABLE';$('activePlanCount').textContent='UNAVAILABLE';}
}
function readPending(){try{return JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{return null;}}
async function save(event){
  event.preventDefault();if(busy||!shop)return;
  const amount=Number($('zeroPlanAmount').value);const date=$('zeroPlanDate').value;
  if(!Number.isSafeInteger(amount)||amount<1||amount>1000000000000||!date||date<'2000-01-01'||date>'2100-12-31'){$('formError').textContent='Kiểm tra số tiền nguyên dương và ngày dự kiến hợp lệ.';return;}
  const old=readPending();
  if(old&&(old.payload.shop_id!==shop.shop_id||old.payload.amount_vnd!==amount||old.payload.expected_date!==date)){$('formError').textContent='Còn lần gửi chưa đối soát. Không đổi nội dung hoặc tạo khóa mới. Hãy mở lại Shop của lần gửi trước để đối soát.';return;}
  const payload=old?.payload||{shop_id:shop.shop_id,amount_vnd:amount,expected_date:date,idempotency_key:crypto.randomUUID()};
  try{localStorage.setItem(pendingKey,JSON.stringify({payload}));}catch{$('formError').textContent='Không lưu được khóa chống gửi trùng trên thiết bị; chưa gửi yêu cầu.';return;}
  busy=true;for(const control of $('planForm').querySelectorAll('button,input'))control.disabled=true;$('formError').textContent='';$('planFeedback').textContent='Đang lưu kế hoạch…';
  try{
    const receipt=await api('create',payload);
    if(!receipt.plan_id||receipt.shop_id!==payload.shop_id||Number(receipt.amount_vnd)!==amount||receipt.expected_date!==date||receipt.input_label!==LABEL)throw new Error('WRITE_RECEIPT_MISMATCH');
    const readback=await showPlans();const found=readback.rows.find(r=>r.plan_id===receipt.plan_id);
    if(!found||Number(found.amount_vnd)!==amount||found.expected_date!==date||found.status!=='ACTIVE')throw new Error('WRITE_READBACK_MISMATCH');
    try{renderDebtPlanSummary(shop,readback,await loadDebtReference());}catch{}
    localStorage.removeItem(pendingKey);$('planFeedback').textContent='Đã lưu có hiệu lực trong Staff Plan và đọc lại thành công. Dữ liệu chưa xác minh, không phải Actual hoặc Forecast được chứng nhận.';$('zeroPlanAmount').value='';$('zeroPlanDate').value='';
  }catch(error){
    // A rate limit on a later attempt does not prove an earlier UNKNOWN write
    // failed. Preserve the original key across 429 responses as well.
    if([400,409].includes(error.status)&&error.message!=='IDEMPOTENCY_CONFLICT')localStorage.removeItem(pendingKey);
    $('planFeedback').textContent='';$('formError').textContent='Chưa hoàn tất: '+error.message+'. Không tự gửi lại với khóa mới khi trạng thái chưa rõ.';
  }finally{busy=false;for(const control of $('planForm').querySelectorAll('button,input'))control.disabled=false;}
}
async function init(){
  // The original app and auth gate are not imported. No debt read path is loaded.
  for(const selector of ['.preview','#addPart','#existingNote','#planReadNotice','#type','#queueFilter','#discard','#toast']){const node=document.querySelector(selector);if(node)node.hidden=true;}
  document.querySelector('.plan-context').hidden=false;
  document.querySelector('.reference-note').textContent='Số tham chiếu từ workbook Actual đã chứng nhận; không khẳng định là dư nợ SAP hiện hành. Kế hoạch Staff Input là dữ liệu chưa xác minh.';
  document.querySelector('.entry-intro').textContent='Chọn CBLĐ → CSKH → Shop để nhập kế hoạch. Cho phép nhập hộ.';
  $('governedNotice').textContent='Assignment hiệu lực 27/10/2026. Tên được chọn là phạm vi trách nhiệm, không phải danh tính đã xác thực.';
  $('changeCbld').onclick=showLeads;$('changeStaff').onclick=showLeads;$('search').addEventListener('input',renderShops);
  $('closePlan').onclick=()=>{if(!busy)$('planner').close();};$('planner').addEventListener('cancel',e=>{if(busy)e.preventDefault();});$('planForm').addEventListener('submit',save);
  for(const nav of document.querySelectorAll('[data-view]'))nav.onclick=()=>{$('search').value='';renderShops();};
  $('info').onclick=()=>{$('infoBody').textContent='UNVERIFIED_STAFF_PLAN_INPUT: kế hoạch nhập không xác minh người thao tác. Không phải khoản thu Actual, cam kết đã xác nhận hoặc Forecast đã chứng nhận. Bản ghi cũ được giữ nguyên. Nguồn mới lưu riêng; chưa tự động công bố Dashboard.';$('information').showModal();};
  document.querySelector('[data-close="information"]').onclick=()=>$('information').close();
  document.querySelector('button[value="next"]').hidden=true;
  $('entryError').textContent='Đang tải danh mục được phép…';
  try{const response=await api('catalog');if(response.input_label!==LABEL||!Array.isArray(response.rows))throw new Error('INVALID_CATALOG');catalog=response.rows;showLeads();$('entryError').textContent='';}
  catch{$('entryError').textContent='Không tải được danh mục Staff Plan. Chưa thể lưu; không sử dụng dữ liệu mô phỏng.';}
}
init();

