export function stableCanonical(value){
  if(Array.isArray(value))return '['+value.map(stableCanonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableCanonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}

export function scaledVnd(value){
  const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if(!match)throw new Error('INVALID_REFERENCE_AMOUNT');
  const fraction=match[3]||'';
  if(fraction.length>6)throw new Error('REFERENCE_PRECISION_UNSUPPORTED');
  const units=BigInt(match[2])*1000000n+BigInt((fraction+'000000').slice(0,6));
  return match[1]? -units:units;
}

export function formatScaledVnd(value){
  const negative=value<0n,absolute=negative?-value:value;
  const rounded=(absolute+500000n)/1000000n;
  return (negative?'-':'')+new Intl.NumberFormat('vi-VN').format(rounded)+' VND';
}

export function deriveShopKpis(shopId,plans,payload,manifest){
  const rows=plans?.rows;
  const plansComplete=Array.isArray(rows)&&plans.truncated===false;
  let planTotal=0n,activeCount=0;
  if(plansComplete){
    for(const item of rows){
      if(item.status!=='ACTIVE')continue;
      if(!/^[0-9]+$/.test(String(item.amount_vnd)))throw new Error('PLAN_AMOUNT_INVALID');
      planTotal+=BigInt(String(item.amount_vnd));activeCount++;
    }
  }
  const snapshot=payload?.snapshot;
  const current=payload?.reference_status==='REFERENCE_AVAILABLE_REPORT_DATE_NOT_PROVEN'
    &&payload.latest_actual_run_id===manifest?.run_id
    &&payload.latest_actual_certificate_sha256===manifest?.actual?.certificate_sha256
    &&snapshot?.source_run_id===manifest?.run_id
    &&snapshot?.actual_certificate_sha256===manifest?.actual?.certificate_sha256;
  const stale=payload?.reference_status==='STALE_LAST_VALID_REFERENCE'&&!!snapshot;
  const refRow=(current||stale)&&Array.isArray(snapshot?.rows)
    ?snapshot.rows.find(item=>item.shop_id===shopId):null;
  const balance=refRow?scaledVnd(refRow.balance_vnd):null;
  const planTotalScaled=planTotal*1000000n;
  let gap=null,coverage=null;
  if(current&&balance!==null&&plansComplete){
    gap=balance>planTotalScaled?balance-planTotalScaled:0n;
    if(balance>0n){
      const hundredths=(planTotalScaled*10000n)/balance;
      coverage=Number(hundredths)/100;
    }
  }
  return {plansComplete,planTotal,activeCount,balance,gap,coverage,stale,referenceAvailable:current&&balance!==null};
}

