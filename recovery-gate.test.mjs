import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./recovery-gate.js', import.meta.url), 'utf8')
  .replace('await import(NORMAL_APP);', 'window.__normalAppImported = true;');

function element(tag) {
  return {
    tagName: tag.toUpperCase(), children: [], attributes: {}, style: {}, listeners: {}, value: '',
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); return item; },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    remove() { this.removed = true; },
    focus() { this.focused = true; }
  };
}

async function runCase({scenario, hash = '', search = '', historyThrows = false}) {
  const allElements = [];
  const body = element('body');
  const head = element('head');
  const stored = new Map();
  const startUrl = new URL(`https://staff.example/staff-input-app-v1/${search}${hash}`);
  const location = {
    href: startUrl.href, origin: startUrl.origin, pathname: startUrl.pathname, search: startUrl.search, hash: startUrl.hash,
    replace(value) {
      const next = new URL(value, this.href);
      Object.assign(this, {href: next.href, pathname: next.pathname, search: next.search, hash: next.hash});
    }
  };
  const session = {user: {id: 'fixture-user', is_anonymous: false}};
  const authCalls = {exchange: null, update: null, listeners: [], clientOptions: null};
  const logs = [];
  const window = {
    __STAFF_INPUT_GOVERNED_CONFIG__: {
      baseUrl: 'https://aniuuzfacpvpgiotikik.supabase.co', publishableKey: 'fixture-publishable-key'
    },
    localStorage: {
      getItem(key) { return stored.get(key) ?? null; },
      setItem(key, value) { stored.set(key, value); },
      removeItem(key) { stored.delete(key); }
    }
  };
  const document = {
    body, head,
    createElement(tag) { const item = element(tag); allElements.push(item); return item; }
  };
  const historyCalls = [];
  const mockSupabase = {
    createClient(_url, _key, options) {
      authCalls.clientOptions = options;
      const auth = {
        onAuthStateChange(callback) {
          authCalls.listeners.push(callback);
          return {data: {subscription: {unsubscribe(){ authCalls.unsubscribed = true; }}}};
        },
        async getSession() {
          if (scenario === 'expired-implicit') return {data: {session: null}, error: new Error('expired')};
          if (scenario === 'implicit-valid') {
            queueMicrotask(() => authCalls.listeners.forEach(fn => fn('PASSWORD_RECOVERY', session)));
            return {data: {session}, error: null};
          }
          return {data: {session: null}, error: null};
        },
        async exchangeCodeForSession(code, opts) {
          authCalls.exchange = {code, opts, urlAtCall: location.href};
          if (scenario === 'missing-verifier') return {data: {session: null, redirectType: null}, error: new Error('verifier missing')};
          const redirectType = scenario === 'ordinary-pkce' ? 'signup' : 'recovery';
          const event = redirectType === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN';
          queueMicrotask(() => authCalls.listeners.forEach(fn => fn(event, session)));
          return {data: {session, redirectType}, error: null};
        },
        async getUser() {
          return {data: {user: scenario === 'anonymous' ? {...session.user, is_anonymous: true} : session.user}, error: null};
        },
        async updateUser(payload) { authCalls.update = payload; return {data: {user: session.user}, error: null}; }
      };
      return {auth};
    }
  };
  window.supabase = mockSupabase;
  const context = {
    window, document, location,
    history: {replaceState(_state, _title, value) {
      historyCalls.push(value);
      if (historyThrows) throw new Error('history denied');
      location.replace(value);
    }},
    URL, URLSearchParams, console: {
      log(...args) { logs.push(args.join(' ')); },
      warn(...args) { logs.push(args.join(' ')); },
      error(...args) { logs.push(args.join(' ')); }
    },
    setTimeout, clearTimeout, Promise, Error, queueMicrotask
  };

  await vm.runInNewContext(`(async () => { ${source}\n })()`, context, {timeout: 3000});
  const root = body.children.find(item => item.id === 'passwordRecovery');
  const form = root?.children.find(item => item.tagName === 'FORM');
  return {window, body, root, form, allElements, authCalls, historyCalls, location, logs, stored};
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({name, result: 'PASS'}); }
  catch (error) { results.push({name, result: 'FAIL', detail: String(error?.message || error)}); }
}

await test('implicit recovery is SDK-verified before form and password uses updateUser', async () => {
  const r = await runCase({scenario: 'implicit-valid', hash: '#access_token=fixture-access&refresh_token=fixture-refresh&token_type=bearer&type=recovery'});
  assert.ok(r.form);
  assert.equal(r.authCalls.clientOptions.auth.detectSessionInUrl, true);
  const inputs = r.form.children.filter(x => x.tagName === 'INPUT');
  inputs[0].value = 'fixture-password-1'; inputs[1].value = 'fixture-password-1';
  await r.form.listeners.submit({preventDefault(){}});
  assert.equal(r.authCalls.update.password, 'fixture-password-1');
  assert.equal(r.form.removed, true);
  assert.doesNotMatch(r.location.href, /access_token|refresh_token|type=recovery/i);
});

await test('valid PKCE captures then scrubs code and flow before SDK exchange', async () => {
  const r = await runCase({scenario: 'pkce-valid', search: '?keep=ok&code=fixture-code&sb_flow_id=fixture-flow'});
  assert.ok(r.form);
  assert.equal(r.authCalls.exchange.code, 'fixture-code');
  assert.equal(r.authCalls.exchange.opts.flowId, 'fixture-flow');
  assert.equal(r.authCalls.clientOptions.auth.flowType, 'pkce');
  assert.equal(r.authCalls.clientOptions.auth.detectSessionInUrl, false);
  assert.doesNotMatch(r.authCalls.exchange.urlAtCall, /code=|sb_flow_id=/i);
  assert.match(r.authCalls.exchange.urlAtCall, /keep=ok/);
  assert.doesNotMatch(r.location.href, /code=|sb_flow_id=/i);
});

await test('rejected query callback is scrubbed before failure UI and preserves unrelated query', async () => {
  const r = await runCase({scenario: 'rejected', search: '?error=access_denied&error_description=private-detail&state=fixture-state&keep=ok'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.equal(r.historyCalls.length, 1);
  assert.doesNotMatch(r.location.href, /error|state=/i);
  assert.match(r.location.href, /keep=ok/);
  assert.match(r.root.children[1].textContent, /không hợp lệ/i);
});

await test('unsupported type callback is scrubbed without exchanging its code', async () => {
  const r = await runCase({scenario: 'unsupported', search: '?code=fixture-code&type=signup&sb_flow_id=fixture-flow'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.equal(r.authCalls.exchange, null);
  assert.doesNotMatch(r.location.href, /code=|type=|sb_flow_id=/i);
});

await test('implicit error fragment is scrubbed before SDK initialization', async () => {
  const r = await runCase({scenario: 'implicit-error', hash: '#error=access_denied&error_description=private-detail&state=fixture-state'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.equal(r.historyCalls.length, 1);
  assert.equal(r.location.hash, '');
  assert.equal(r.authCalls.clientOptions, null);
});

await test('history failure uses a non-sensitive blocked URL and never opens workspace', async () => {
  const r = await runCase({scenario: 'rejected', search: '?error=access_denied&error_description=private-detail&state=fixture-state', historyThrows: true});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.doesNotMatch(r.location.href, /error|state=|private-detail/i);
  assert.match(r.location.href, /recovery_status=blocked/);
});

await test('fallback blocked marker keeps recovery flow fail-closed on a later load', async () => {
  const r = await runCase({scenario: 'rejected', search: '?recovery_status=blocked'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.match(r.root.children[1].textContent, /không hợp lệ/i);
});

await test('expired implicit callback fails closed without form or workspace', async () => {
  const r = await runCase({scenario: 'expired-implicit', hash: '#access_token=expired&refresh_token=expired&token_type=bearer&type=recovery'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.match(r.root.children[1].textContent, /hết hạn|không hợp lệ/i);
  assert.doesNotMatch(r.location.href, /access_token|refresh_token|type=recovery/i);
});

await test('missing PKCE verifier fails closed without form or workspace', async () => {
  const r = await runCase({scenario: 'missing-verifier', search: '?code=fixture-code&sb_flow_id=fixture-flow'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.doesNotMatch(r.location.href, /code=|sb_flow_id=/i);
});

await test('ordinary non-anonymous session without recovery callback stays on existing app path', async () => {
  const r = await runCase({scenario: 'ordinary-session'});
  assert.equal(r.window.__normalAppImported, true);
  assert.equal(r.root, undefined);
});

await test('anonymous user cannot reach password form and callback data is scrubbed', async () => {
  const r = await runCase({scenario: 'anonymous', hash: '#access_token=fixture-access&refresh_token=fixture-refresh&token_type=bearer&type=recovery'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.doesNotMatch(r.location.href, /access_token|refresh_token|type=recovery/i);
});

await test('non-recovery PKCE callback cannot reach form or workspace', async () => {
  const r = await runCase({scenario: 'ordinary-pkce', search: '?code=fixture-code'});
  assert.equal(r.form, undefined);
  assert.equal(r.window.__normalAppImported, undefined);
  assert.doesNotMatch(r.location.href, /code=/i);
});

await test('callback values, errors and password are never logged or rendered', async () => {
  const r = await runCase({scenario: 'implicit-valid', hash: '#access_token=fixture-access&refresh_token=fixture-refresh&token_type=bearer&type=recovery'});
  const visible = JSON.stringify(r.body.children);
  const output = r.logs.join('\n') + visible;
  for (const secretLike of ['fixture-access', 'fixture-refresh', 'fixture-password', 'private-detail']) {
    assert.equal(output.includes(secretLike), false);
  }
});

await test('recovery session remains memory-only while same-device PKCE verifier is readable', async () => {
  const r = await runCase({scenario: 'pkce-valid', search: '?code=fixture-code'});
  const storage = r.authCalls.clientOptions.auth.storage;
  await storage.setItem('sb-aniuuzfacpvpgiotikik-auth-token', 'fixture-session-only');
  assert.equal(r.stored.has('sb-aniuuzfacpvpgiotikik-auth-token'), false);
  await r.window.localStorage.setItem('sb-aniuuzfacpvpgiotikik-auth-token-code-verifier', 'fixture-verifier');
  assert.equal(await storage.getItem('sb-aniuuzfacpvpgiotikik-auth-token-code-verifier'), 'fixture-verifier');
});

console.log(JSON.stringify({passed: results.filter(x => x.result === 'PASS').length, total: results.length, results}, null, 2));
if (results.some(x => x.result !== 'PASS')) process.exitCode = 1;

