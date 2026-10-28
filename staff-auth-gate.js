// Staff Input operator authentication gate. No anonymous sign-up; proxy selection remains assignment-scoped.
const CONFIG = window.__STAFF_INPUT_GOVERNED_CONFIG__ || {};
const BASE_URL = 'https://aniuuzfacpvpgiotikik.supabase.co';
const SDK_URL = './supabase.min.js?v=2.117.2';
const NORMAL_APP = './app.js?v=20261028-operator-auth-r1';
const AUTH_KEY = 'sb-aniuuzfacpvpgiotikik-auth-token';

const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
if (params.get('type') === 'recovery' || hash.get('type') === 'recovery') {
  await import('./recovery-gate.js?v=20261011-recovery-only-r2');
} else {
  const configOk = String(CONFIG.baseUrl || BASE_URL).replace(/\/$/, '') === BASE_URL && CONFIG.publishableKey;
  const root = document.createElement('main');
  root.setAttribute('aria-labelledby', 'authTitle');
  root.style.cssText = 'box-sizing:border-box;position:fixed;inset:0;z-index:99999;overflow:auto;display:flex;flex-direction:column;justify-content:flex-start;width:100%;min-height:100vh;margin:0;padding:min(9vh,70px) max(16px,calc((100vw - 440px)/2));background:#fff;color:#172b27;font:16px system-ui,sans-serif'
  const title=document.createElement('h1'); title.id='authTitle'; title.textContent='Đăng nhập Staff Input';
  const message=document.createElement('p'); message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
  root.append(title,message); document.body.append(root);

  const loadSdk = async () => {
    if (window.supabase?.createClient) return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=SDK_URL;s.onload=resolve;s.onerror=()=>reject(new Error('SDK_LOAD_FAILED'));document.head.append(s);});
    if (!window.supabase?.createClient) throw new Error('SDK_UNAVAILABLE');
  };
  const scrubAuthUrl = () => {
    const url=new URL(location.href); for (const key of ['code','error','error_code','error_description','type','token_hash','access_token','refresh_token']) url.searchParams.delete(key);
    if(url.hash) url.hash=''; history.replaceState(null,'',url.pathname+url.search);
  };
  const showLogin = client => {
    const form=document.createElement('form'); form.autocomplete='on';
    const email=document.createElement('input'); email.type='email'; email.autocomplete='username'; email.required=true; email.maxLength=254; email.placeholder='Email operator đã được cấp quyền'; email.setAttribute('aria-label','Email operator');
    const button=document.createElement('button'); button.type='submit'; button.textContent='Gửi liên kết đăng nhập';
    button.style.cssText='width:100%;min-height:44px;margin-top:12px;background:#193e37;color:white;border:0;border-radius:8px';
    email.style.cssText='box-sizing:border-box;width:100%;min-height:44px;padding:10px';
    form.append(email,button);
    const note=document.createElement('p'); note.textContent='Chỉ tài khoản operator đã có và được cấp profile hoạt động mới truy cập được. Không cần tài khoản riêng cho từng CSKH; việc chọn CSKH chỉ xác định phạm vi Shop theo Assignment.';
    root.append(form,note);
    form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;message.textContent='Đang gửi liên kết đăng nhập…';
      try { const {error}=await client.auth.signInWithOtp({email:email.value.trim(),options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:false}}); if(error) throw error; message.textContent='Nếu email đã được cấp quyền, hãy mở liên kết đăng nhập trong tab này.'; email.value=''; }
      catch { message.textContent='Không gửi được liên kết. Kiểm tra tài khoản operator hoặc thử lại sau.'; button.disabled=false; }
    });
  };
  const validateAndRun = async client => {
    const {data:userData,error:userError}=await client.auth.getUser();
    const user=userData?.user;
    if(userError || !user?.id || user.is_anonymous===true) throw new Error('OPERATOR_SESSION_REQUIRED');
    const {data:role,error:roleError}=await client.rpc('my_role');
    if(roleError || typeof role!=='string' || !role.trim()) throw new Error('OPERATOR_NOT_AUTHORIZED');
    window.__STAFF_INPUT_AUTH_SESSION__=async()=>{const {data,error}=await client.auth.getSession();if(error||!data?.session?.access_token) throw new Error('AUTH_REQUIRED');return data.session.access_token;};
    root.remove();
    await import(NORMAL_APP);
    const header=document.querySelector('.app-header');
    if(header){const signOut=document.createElement('button');signOut.type='button';signOut.textContent='Đăng xuất';signOut.addEventListener('click',async()=>{await client.auth.signOut();location.reload();});header.append(signOut);}
  };

  try {
    if(!configOk) throw new Error('CONFIGURATION_INVALID');
    await loadSdk();
    const client=window.supabase.createClient(BASE_URL,CONFIG.publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:window.sessionStorage,storageKey:AUTH_KEY}});
    if(params.has('error')||params.has('error_code')){scrubAuthUrl();message.textContent='Liên kết đăng nhập không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.';showLogin(client);}
    else if(params.has('code')){
      const code=params.get('code'); scrubAuthUrl();
      const {error}=await client.auth.exchangeCodeForSession(code); if(error) throw new Error('AUTH_CALLBACK_INVALID');
      await validateAndRun(client);
    } else {
      const {data,error}=await client.auth.getSession(); if(error) throw error;
      if(data?.session) await validateAndRun(client); else {message.textContent='Dùng tài khoản operator đã cấp quyền để nhận liên kết đăng nhập một lần.';showLogin(client);}
    }
  } catch(error) {
    message.textContent=error?.message==='OPERATOR_NOT_AUTHORIZED'?'Tài khoản chưa có quyền Staff Input. Hãy dùng tài khoản operator được cấp quyền.':'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.';
    try { const client=window.supabase?.createClient?.(BASE_URL,CONFIG.publishableKey,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:AUTH_KEY}}); await client?.auth.signOut(); } catch {}
    if(window.supabase?.createClient) { const client=window.supabase.createClient(BASE_URL,CONFIG.publishableKey,{auth:{persistSession:true,storage:window.sessionStorage,storageKey:AUTH_KEY}}); showLogin(client); }
  }
}
