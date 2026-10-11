// STAFF INPUT — Recovery-only gate. Business modules remain untouched.
// Auth is handled by the bundled Supabase JS SDK; session data stays in memory.
const CONFIG = window.__STAFF_INPUT_GOVERNED_CONFIG__ || {};
const AUTH_ORIGIN = 'https://aniuuzfacpvpgiotikik.supabase.co';
const NORMAL_APP = './app.js?v=20261009-plan-read-r2';
const SDK_ASSET = './supabase.min.js?v=2.117.2';
const STORAGE_KEY = 'sb-aniuuzfacpvpgiotikik-auth-token';
const AUTH_CALLBACK_KEYS = [
  'access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at',
  'provider_token', 'provider_refresh_token', 'type', 'error', 'error_code',
  'error_description', 'code', 'token_hash', 'sb_flow_id', 'state', 'recovery_status'
];

function parseParams(value) {
  return new URLSearchParams(value.startsWith('#') ? value.slice(1) : value);
}

const hash = parseParams(location.hash);
const query = new URLSearchParams(location.search);
const hasPkceCode = query.has('code');
const pkceFlowId = query.get('sb_flow_id');
const implicitRecovery = hash.get('type') === 'recovery';
const callbackError = [hash, query].some(params =>
  params.has('error') || params.has('error_code') || params.has('error_description'));
const callbackLike = implicitRecovery || hasPkceCode || callbackError ||
  query.get('type') === 'recovery' || hash.has('access_token') || hash.has('refresh_token') ||
  query.has('access_token') || query.has('refresh_token') || query.has('token_hash') ||
  query.get('recovery_status') === 'blocked';

if (!callbackLike) {
  // Preserve the exact existing app module on ordinary visits.
  await import(NORMAL_APP);
} else {
  // A callback or auth error must never fall through to CBLĐ/CSKH workspace.
  const mode = hasPkceCode ? 'pkce' : implicitRecovery ? 'implicit' : null;
  const implicitTokens = mode === 'implicit' && hash.get('access_token') &&
    hash.get('refresh_token') && hash.get('token_type') === 'bearer';
  const pkceCode = mode === 'pkce' ? query.get('code') : null;
  const callbackAllowed = !callbackError && Boolean(implicitTokens || pkceCode) &&
    (!query.has('type') || query.get('type') === 'recovery');

  function clearCallbackUrl() {
    try {
      const url = new URL(location.href);
      // The fallback marker is deliberately non-sensitive and keeps the app
      // fail-closed if history.replaceState is unavailable in the browser.
      if (url.searchParams.get('recovery_status') === 'blocked') return;
      let changed = false;
      for (const key of AUTH_CALLBACK_KEYS) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (url.hash.length > 1) {
        const fragment = new URLSearchParams(url.hash.slice(1));
        const hasAuthCallback = AUTH_CALLBACK_KEYS.some(key => fragment.has(key));
        if (hasAuthCallback) {
          for (const key of AUTH_CALLBACK_KEYS) fragment.delete(key);
          const remaining = fragment.toString();
          url.hash = remaining ? `#${remaining}` : '';
          changed = true;
        }
      }
      if (changed) {
        const safeUrl = `${url.pathname}${url.search}${url.hash}`;
        try { history.replaceState(null, '', safeUrl); }
        catch {
          const blockedUrl = new URL(url.pathname, url.origin);
          blockedUrl.searchParams.set('recovery_status', 'blocked');
          location.replace(`${blockedUrl.pathname}${blockedUrl.search}`);
        }
      }
    } catch {
      // Do not echo callback material. The caller remains fail-closed.
      try {
        const blockedUrl = new URL(location.pathname, location.origin);
        blockedUrl.searchParams.set('recovery_status', 'blocked');
        location.replace(`${blockedUrl.pathname}${blockedUrl.search}`);
      } catch { /* remain on the fail-closed recovery screen */ }
    }
  }

  // Invalid, expired, rejected, or unsupported callbacks no longer need their
  // URL material. For PKCE, code and flowId were captured above before scrubbing.
  if (!callbackAllowed) clearCallbackUrl();

  document.body.replaceChildren();
  const root = document.createElement('main');
  root.id = 'passwordRecovery';
  root.setAttribute('aria-labelledby', 'recoveryTitle');
  Object.assign(root.style, {
    boxSizing: 'border-box', width: 'min(100% - 32px, 440px)',
    margin: 'min(9vh, 70px) auto', padding: '24px', background: '#fff',
    borderRadius: '12px', boxShadow: '0 5px 24px #0001', color: '#172b27',
    fontFamily: 'system-ui, sans-serif'
  });
  const title = document.createElement('h1');
  title.id = 'recoveryTitle';
  title.textContent = 'Đặt lại mật khẩu Staff Input';
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.textContent = callbackAllowed
    ? 'Đang xác minh liên kết khôi phục…'
    : 'Liên kết khôi phục không hợp lệ hoặc không được hỗ trợ. Hãy yêu cầu email khôi phục mới.';
  root.append(title, message);
  document.body.append(root);

  function loadSupabaseSdk() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return Promise.resolve(window.supabase);
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_ASSET;
      script.async = true;
      script.onload = () => window.supabase?.createClient
        ? resolve(window.supabase) : reject(new Error('SDK_UNAVAILABLE'));
      script.onerror = () => reject(new Error('SDK_LOAD_FAILED'));
      document.head.append(script);
    });
  }

  function createMemorySessionStorage(flowId) {
    // PKCE's verifier must be read from the same browser/device that initiated
    // recovery. Session tokens are deliberately never written to localStorage.
    let sessionValue = null;
    const verifierKeys = new Set([
      `${STORAGE_KEY}-code-verifier`,
      `${STORAGE_KEY}-flows-code-verifier`,
      ...(flowId ? [`${STORAGE_KEY}-flow-${flowId}-code-verifier`] : [])
    ]);
    return {
      async getItem(key) {
        if (key === STORAGE_KEY) return sessionValue;
        if (verifierKeys.has(key)) {
          try { return window.localStorage.getItem(key); } catch { return null; }
        }
        return null;
      },
      async setItem(key, value) {
        if (key === STORAGE_KEY) { sessionValue = value; return; }
        if (verifierKeys.has(key)) {
          try { window.localStorage.setItem(key, value); } catch { /* exchange will fail closed */ }
        }
      },
      async removeItem(key) {
        if (key === STORAGE_KEY) { sessionValue = null; return; }
        if (verifierKeys.has(key)) {
          try { window.localStorage.removeItem(key); } catch { /* verifier remains unusable */ }
        }
      },
      clearSession() { sessionValue = null; }
    };
  }

  function observeRecoveryEvent(client) {
    let resolveRecovery;
    const recoveryEvent = new Promise(resolve => { resolveRecovery = resolve; });
    const result = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') resolveRecovery({ event, session });
    });
    return { recoveryEvent, subscription: result?.data?.subscription };
  }

  async function waitForRecoveryEvent(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('RECOVERY_EVENT_MISSING')), 15000); })
      ]);
    } finally { clearTimeout(timer); }
  }

  async function verifyRecoveryUser(client, eventSession) {
    const result = await client.auth.getUser();
    const user = result?.data?.user;
    if (result?.error || !user?.id || user.is_anonymous === true ||
        !eventSession?.user?.id || eventSession.user.id !== user.id) {
      throw new Error('RECOVERY_SESSION_INVALID');
    }
    return user;
  }

  function showPasswordForm(client, storage, subscription) {
    const form = document.createElement('form');
    form.autocomplete = 'off';
    const p1 = document.createElement('input');
    p1.type = 'password'; p1.name = 'new-password'; p1.required = true;
    p1.minLength = 12; p1.autocomplete = 'new-password';
    p1.placeholder = 'Mật khẩu mới (ít nhất 12 ký tự)';
    p1.setAttribute('aria-label', 'Mật khẩu mới');
    const p2 = document.createElement('input');
    p2.type = 'password'; p2.name = 'confirm-password'; p2.required = true;
    p2.minLength = 12; p2.autocomplete = 'new-password';
    p2.placeholder = 'Nhập lại mật khẩu mới';
    p2.setAttribute('aria-label', 'Nhập lại mật khẩu mới');
    const submit = document.createElement('button');
    submit.type = 'submit'; submit.textContent = 'Cập nhật mật khẩu';
    submit.style.cssText = 'box-sizing:border-box;width:100%;margin-top:16px;min-height:44px;background:#193e37;color:#fff;';
    for (const input of [p1, p2]) {
      input.style.cssText = 'box-sizing:border-box;width:100%;min-height:44px;margin-top:12px;padding:10px;';
    }
    form.append(p1, p2, submit);
    root.append(form);
    message.textContent = 'Phiên khôi phục đã xác minh. Đặt mật khẩu mới cho tài khoản Auth.';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (p1.value !== p2.value) { message.textContent = 'Hai mật khẩu chưa khớp.'; return; }
      if (p1.value.length < 12) { message.textContent = 'Mật khẩu phải có ít nhất 12 ký tự.'; return; }
      submit.disabled = true;
      message.textContent = 'Đang cập nhật mật khẩu…';
      try {
        const { error } = await client.auth.updateUser({ password: p1.value });
        p1.value = ''; p2.value = '';
        if (error) throw new Error('PASSWORD_UPDATE_FAILED');
        form.remove();
        storage.clearSession();
        subscription?.unsubscribe?.();
        message.textContent = 'Đã cập nhật mật khẩu. Có thể đóng tab này và tiếp tục bước bootstrap trên Windows.';
      } catch {
        p1.value = ''; p2.value = '';
        message.textContent = 'Không cập nhật được mật khẩu. Hãy yêu cầu liên kết mới hoặc liên hệ quản trị viên.';
        submit.disabled = false;
      }
    });
    p1.focus();
  }

  if (callbackAllowed) {
    const baseUrl = String(CONFIG.baseUrl || AUTH_ORIGIN).replace(/\/$/, '');
    const key = CONFIG.publishableKey;
    let subscription;
    const storage = createMemorySessionStorage(pkceFlowId);
    try {
      if (!key || baseUrl !== AUTH_ORIGIN) throw new Error('CONFIGURATION_INVALID');
      // Remove a PKCE code from browser history before any network operation.
      if (mode === 'pkce') clearCallbackUrl();
      const sdk = await loadSupabaseSdk();
      const client = sdk.createClient(baseUrl, key, {
        auth: {
          flowType: mode === 'pkce' ? 'pkce' : 'implicit',
          detectSessionInUrl: mode === 'implicit',
          persistSession: true,
          autoRefreshToken: false,
          storageKey: STORAGE_KEY,
          storage
        }
      });
      const observed = observeRecoveryEvent(client);
      subscription = observed.subscription;
      let eventResult;

      if (mode === 'pkce') {
        // The SDK consumes the same-device verifier; missing/expired verifier fails closed.
        const { data, error } = await client.auth.exchangeCodeForSession(
          pkceCode,
          pkceFlowId ? { flowId: pkceFlowId } : undefined
        );
        if (error || data?.redirectType !== 'recovery' || !data?.session) {
          throw new Error('PKCE_RECOVERY_EXCHANGE_FAILED');
        }
        eventResult = await waitForRecoveryEvent(observed.recoveryEvent);
        if (eventResult.event !== 'PASSWORD_RECOVERY' ||
            eventResult.session?.user?.id !== data.session.user?.id) {
          throw new Error('PKCE_NOT_RECOVERY');
        }
      } else {
        // Supabase JS validates the implicit callback and emits PASSWORD_RECOVERY.
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session) throw new Error('IMPLICIT_RECOVERY_INVALID');
        eventResult = await waitForRecoveryEvent(observed.recoveryEvent);
        if (eventResult.event !== 'PASSWORD_RECOVERY' ||
            eventResult.session?.user?.id !== data.session.user?.id) {
          throw new Error('IMPLICIT_NOT_RECOVERY');
        }
      }

      await verifyRecoveryUser(client, eventResult.session);
      clearCallbackUrl();
      showPasswordForm(client, storage, subscription);
    } catch {
      clearCallbackUrl();
      subscription?.unsubscribe?.();
      storage.clearSession();
      message.textContent = 'Phiên khôi phục đã hết hạn, thiếu xác minh PKCE hoặc không hợp lệ. Hãy yêu cầu email khôi phục mới.';
    }
  }
}
