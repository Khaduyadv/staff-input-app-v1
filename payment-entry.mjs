// Public client: no secret, no Supabase session, no debt/Actual RPC.
const API='https://aniuuzfacpvpgiotikik.supabase.co/functions/v1/staff-plan-public-v1';
const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('vi-VN').format(n)+' VND';
const STORE='cong-no:payment-confirmation-v2',PENDING=STORE+':pending';
// AMOUNT_HELPERS_BEGIN — pure helpers also exercised by the isolated delta tests.
function formatAmountEdit(value,start=value.length,end=start){
 if(!/^[0-9.]*$/.test(value))return {value,start,end,invalid:true};
 const digits=value.replace(/\./g,'');
 const formatted=digits.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
 const position=p=>{let n=value.slice(0,p).replace(/\./g,'').length;if(!n)return 0;for(let i=0;i<formatted.length;i++)if(/\d/.test(formatted[i])&&!--n)return i+1;return formatted.length;};
 return {value:formatted,start:position(start),end:position(end),invalid:false};
}
function paymentAmount(value){
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value))throw Error('Số tiền phải là VND nguyên dương, không nhập phần thập phân.');
 const n=Number(value.replace(/\./g,''));
 if(!Number.isSafeInteger(n)||n<1||n>1000000000000)throw Error('Số tiền phải từ 1 đến 1.000.000.000.000 VND.');
 return n;
}
function deleteAmountSeparator(value,caret,type){
 if(type==='deleteContentBackward'&&caret>1&&value[caret-1]==='.')return {value:value.slice(0,caret-2)+value.slice(caret),caret:caret-2};
 if(type==='deleteContentForward'&&value[caret]==='.'&&caret+1<value.length)return {value:value.slice(0,caret)+value.slice(caret+2),caret};
 return null;
}
// AMOUNT_HELPERS_END
function attachAmountInput(input){
 let composing=false;
 const update=()=>{if(composing)return;const f=formatAmountEdit(input.value,input.selectionStart??0,input.selectionEnd??0);if(!f.invalid){input.value=f.value;input.setSelectionRange(f.start,f.end);}try{if(input.value)paymentAmount(input.value);input.setCustomValidity(f.invalid?'Chỉ nhập chữ số VND.':'');}catch(e){input.setCustomValidity(e.message);}};
 input.addEventListener('input',update);
 input.addEventListener('compositionstart',()=>{composing=true;});
 input.addEventListener('compositionend',()=>{composing=false;update();});
 input.addEventListener('beforeinput',e=>{if(composing||input.selectionStart!==input.selectionEnd)return;const d=deleteAmountSeparator(input.value,input.selectionStart,e.inputType);if(d){e.preventDefault();input.value=d.value;input.setSelectionRange(d.caret,d.caret);update();}});
 input.form.addEventListener('reset',()=>input.setCustomValidity(''));
}
attachAmountInput($('amount'));
let catalog=[],lead='',staff='',shop=null,relationships=[],busy=false;
const records=()=>JSON.parse(localStorage.getItem(STORE)||'[]');
function text(tag,value,cls){const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;}
function button(label,run){const b=text('button',label,'staff-card');b.type='button';b.addEventListener('click',run);return b;}
async function api(action,payload={}){const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),cache:'no-store',signal:AbortSignal.timeout(15000)});const x=await r.json();if(!r.ok||x.error)throw Error(x.error||'API_UNAVAILABLE');return x;}
function capability(){return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function context(){return 'UNAUTHENTICATED_PROXY_SELECTION:'+staff;}
function showLeads(){lead='';staff='';$('workspace').hidden=true;$('entry').hidden=false;$('cbldStep').hidden=false;$('cskhStep').hidden=true;$('cbldList').replaceChildren();for(const l of [...new Set(catalog.map(r=>r.cbld))].sort())$('cbldList').append(button(l,()=>{lead=l;showStaff();}));}
function showStaff(){$('cbldStep').hidden=true;$('cskhStep').hidden=false;$('selectedCbldText').textContent=lead;$('staffList').replaceChildren();for(const s of [...new Set(catalog.filter(r=>r.cbld===lead).map(r=>r.cskh))].sort())$('staffList').append(button(s,()=>{staff=s;$('entry').hidden=true;$('workspace').hidden=false;$('personName').textContent=staff;$('workspaceCbld').textContent=lead;renderShops();}));}
function renderShops(){const scope=catalog.filter(r=>r.cbld===lead&&r.cskh===staff);const term=$('search').value.trim().toLocaleUpperCase('vi');const rows=scope.filter(r=>r.shop_id.toLocaleUpperCase('vi').includes(term));$('scopeCount').textContent=scope.length+' Shop theo Assignment hiện hành';$('resultCount').textContent=rows.length+' Shop';$('queue').replaceChildren();for(const r of rows){const c=text('article','', 'shop-card');c.append(text('h3',r.shop_id),text('p',r.cskh+' · '+r.cbld),button('Xác nhận thanh toán',()=>openShop(r)));$('queue').append(c);}}
async function openShop(r){shop=r;$('paymentForm').reset();$('paymentShop').textContent=r.shop_id;$('responsibility').textContent='Phụ trách hiện hành: '+r.cskh+' · '+r.cbld+'; backend xác định theo ngày nghiệp vụ, không theo người thao tác.';$('formError').textContent='';$('saved').textContent='';$('relationship').replaceChildren(new Option('Chọn khách / hợp đồng',''));$('paymentDialog').showModal();try{const result=await api('relationships',{shop_id:r.shop_id});relationships=result.rows;for(const [i,x]of relationships.entries())$('relationship').append(new Option(x.customer_id+' / '+x.contract_id,i));if(relationships.length===1)$('relationship').value='0';if(!relationships.length)$('formError').textContent='Chưa có quan hệ Shop–khách–hợp đồng hợp lệ. Không tự gán khách hàng.';await refresh();}catch(e){$('formError').textContent=e.message;}finally{$('retryPending').hidden=!localStorage.getItem(PENDING);}}
async function refresh(){
 if(!shop)return;const p=await api('pending',{shop_id:shop.shop_id});$('pendingTotal').textContent='Tiền khách xác nhận còn chờ SAP: '+fmt(p.amount_vnd)+' (chưa xác minh)';$('ownConfirmations').replaceChildren();
 for(const rec of records().filter(r=>r.shop_id===shop.shop_id)){
  const x=await api('readback',{confirmation_id:rec.confirmation_id,capability:rec.capability});const c=text('article','','history-item');c.append(text('strong',fmt(x.amount_vnd)),text('p',x.confirmation_date+' · '+x.status),text('p','Đã khớp SAP '+fmt(x.matched_vnd)+' · Còn chờ '+fmt(x.pending_vnd)));
  if(x.confirmation_type==='CUSTOMER_CONFIRMED'&&!['CANCELLED','EXPIRED'].includes(x.status))c.append(button('Đã nhận UNC — cập nhật cùng giao dịch',()=>upgrade(rec,x)));
  c.append(button('Bổ sung / thử lại UNC vào giao dịch này',()=>{const f=document.createElement('input');f.type='file';f.accept='application/pdf,image/png,image/jpeg';f.addEventListener('change',async()=>{if(!f.files[0]||busy)return;busy=true;try{await uploadEvidence(rec,f.files[0]);}catch(e){$('formError').textContent=e.message+'; bản ghi tiền vẫn giữ nguyên.';}finally{busy=false;}});f.click();}));
  $('ownConfirmations').append(c);
 }
}
async function sendStored(){const p=JSON.parse(localStorage.getItem(PENDING)||'null');if(!p)throw Error('NO_PENDING_REQUEST');const x=await api(p.action,p.payload);const id=x.confirmation_id||p.payload.confirmation_id;
 const rb=await api('readback',{confirmation_id:id,capability:p.payload.capability});if(rb.confirmation_id!==id||rb.shop_id!==p.shop_id)throw Error('WRITE_READBACK_SCOPE_MISMATCH');
 const list=records();if(!list.some(r=>r.confirmation_id===id))list.push({confirmation_id:id,capability:p.payload.capability,shop_id:rb.shop_id});localStorage.setItem(STORE,JSON.stringify(list));localStorage.removeItem(PENDING);$('retryPending').hidden=true;
 $('saved').textContent='Đã lưu và đọc lại: '+rb.status+'. Không cộng vào Actual.';await refresh();return {confirmation_id:id,capability:p.payload.capability};}
async function upgrade(rec,x){if(busy)return;busy=true;try{localStorage.setItem(PENDING,JSON.stringify({action:'upgrade',shop_id:rec.shop_id,payload:{confirmation_id:rec.confirmation_id,expected_revision:x.revision,capability:rec.capability,operator_context:context(),idempotency_key:crypto.randomUUID()}}));await sendStored();}catch(e){$('formError').textContent=e.message+'; giữ nguyên mã yêu cầu để đối soát.';$('retryPending').hidden=false;}finally{busy=false;}}
async function uploadEvidence(rec,file){
 if(file.size>5242880||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error('UNC_FILE_TYPE_OR_SIZE_INVALID');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const base={confirmation_id:rec.confirmation_id,capability:rec.capability,operator_context:context()};
 const reservation=await api('attachment_begin',{...base,sha256:hash,mime_type:file.type,size_bytes:file.size,idempotency_key:crypto.randomUUID()});
 if(reservation.status==='STORED_PRIVATE'){$('saved').textContent='UNC này đã lưu riêng; không tạo bản thứ hai.';return;}
 const u=new URL(reservation.upload_url);if(u.origin!=='https://aniuuzfacpvpgiotikik.supabase.co'||!u.pathname.startsWith('/storage/v1/object/upload/sign/unc-payment-confirmations-v2/'))throw Error('PRIVATE_UPLOAD_SCOPE_MISMATCH');
 const sent=await fetch(u.href,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
 // Existing upload may be the successful first attempt after a lost response.
 // Commit verifies the actual private bytes/hash; never enable overwrite.
 if(!sent.ok&&![400,409].includes(sent.status))throw Error('PRIVATE_UPLOAD_FAILED_CONFIRMATION_ALREADY_SAVED');
 await api('attachment_commit',{...base,attachment_id:reservation.attachment_id,sha256:hash,idempotency_key:crypto.randomUUID()});$('saved').textContent+=' UNC đã lưu riêng, không có URL đọc công khai.';
}
$('paymentForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;if(localStorage.getItem(PENDING)){$('formError').textContent='Có yêu cầu chưa rõ kết quả. Dùng Đối soát / thử lại cùng mã trước khi tạo mới.';$('retryPending').hidden=false;return;}
 if(!shop||!relationships[Number($('relationship').value)]||$('relationship').value==='')return;
 if(!$('paymentForm').reportValidity())return;const relation=relationships[Number($('relationship').value)];busy=true;$('savePayment').disabled=true;
 try{const amount=paymentAmount($('amount').value);const file=$('evidence').files[0];if(file&&(file.size>5242880||!['application/pdf','image/png','image/jpeg'].includes(file.type)))throw Error('UNC tối đa 5 MB, PDF/PNG/JPEG.');
 const payload={shop_id:shop.shop_id,customer_id:relation.customer_id,contract_id:relation.contract_id,amount_vnd:amount,confirmation_date:$('confirmationDate').value,confirmation_type:$('confirmationType').value,reference:$('reference').value.trim(),note:$('note').value.trim(),operator_context:context(),capability:capability(),idempotency_key:crypto.randomUUID()};
 localStorage.setItem(PENDING,JSON.stringify({action:'submit',shop_id:shop.shop_id,payload}));const rec=await sendStored();if(file)await uploadEvidence(rec,file);
 }catch(error){$('formError').textContent=error.message+' — không tạo yêu cầu khác để thử lại.';$('retryPending').hidden=!localStorage.getItem(PENDING);}finally{busy=false;$('savePayment').disabled=false;}});
$('retryPending').addEventListener('click',async()=>{if(busy)return;busy=true;try{await sendStored();}catch(e){$('formError').textContent=e.message;}finally{busy=false;}});
$('search').addEventListener('input',renderShops);$('changeCbld').addEventListener('click',showLeads);$('changeStaff').addEventListener('click',showLeads);$('closePayment').addEventListener('click',()=>$('paymentDialog').close());
try{const result=await api('catalog');catalog=result.rows;if(!Array.isArray(catalog)||new Set(catalog.map(r=>r.shop_id)).size!==catalog.length)throw Error('CATALOG_KEY_ERROR');$('assignmentInfo').textContent='Phân công '+(result.assignment_effective_date||'theo nguồn đã ghim')+' · '+catalog.length+' Shop';showLeads();}catch(e){$('entryError').textContent='Chưa tải được danh mục hợp lệ: '+e.message;}

