import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, passwordError, errorMessage, firebaseRequest, mountActionPage } from '../auth/action/action.mjs';

test('only supported, unambiguous links are accepted; redirects and project overrides are ignored', () => {
  for (const mode of ['verifyEmail', 'resetPassword', 'recoverEmail']) {
    assert.equal(parseAction(`?mode=${mode}&oobCode=test-code`).mode, mode);
  }
  for (const query of ['', '?mode=unknown&oobCode=x', '?mode=verifyEmail', '?mode=verifyEmail&mode=resetPassword&oobCode=x', '?mode=verifyEmail&oobCode=x&oobCode=y']) {
    assert.throws(() => parseAction(query), /INVALID_LINK/);
  }
  assert.deepEqual(parseAction('?mode=verifyEmail&oobCode=x&apiKey=foreign&continueUrl=https://evil.example'), { mode: 'verifyEmail', code: 'x', type: 'VERIFY_EMAIL' });
});

test('password validation preserves the exact password and checks both fields', () => {
  assert.ok(passwordError('short', 'short'));
  assert.ok(passwordError('password1', 'password2'));
  assert.ok(passwordError('x'.repeat(129), 'x'.repeat(129)));
  assert.equal(passwordError('  password  ', '  password  '), null);
});

test('Firebase requests send only the action payload to our configured project', async () => {
  const result = await firebaseRequest('resetPassword', { oobCode: 'test', newPassword: ' password ' }, async (url, options) => {
    assert.match(url, /^https:\/\/identitytoolkit\.googleapis\.com\/v1\/accounts:resetPassword\?key=/);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(options.body), { oobCode: 'test', newPassword: ' password ' });
    return { ok: true, json: async () => ({ requestType: 'PASSWORD_RESET' }) };
  });
  assert.equal(result.requestType, 'PASSWORD_RESET');
});

test('Firebase error details become safe, useful messages', async () => {
  await assert.rejects(firebaseRequest('resetPassword', {}, async () => ({ ok: false, json: async () => ({ error: { message: 'EXPIRED_OOB_CODE' } }) })), /EXPIRED_OOB_CODE/);
  assert.match(errorMessage(new Error('EXPIRED_OOB_CODE')), /fresh email/);
  assert.match(errorMessage(new Error('WEAK_PASSWORD : private detail')), /stronger password/);
  assert.doesNotMatch(errorMessage(new Error('server-private-detail')), /server-private-detail/);
});

function page(mode, fetcher) {
  const elements = new Map();
  globalThis.document = {
    title: '',
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        hidden: true, value: '', disabled: false, textContent: '', listeners: {},
        setAttribute(name, value) { this[name] = value; },
        addEventListener(event, fn) { this.listeners[event] = fn; },
        focus() {}, reset() { document.getElementById('password').value = ''; document.getElementById('confirm-password').value = ''; },
      });
      return elements.get(id);
    },
  };
  globalThis.location = { search: `?mode=${mode}&oobCode=test-code`, pathname: '/auth/action/' };
  globalThis.history = { replaceState() {} };
  globalThis.fetch = fetcher;
  return id => document.getElementById(id);
}
const ok = data => ({ ok: true, json: async () => data });

test('verification checks first and consumes the code only on explicit confirmation', async () => {
  const requests = [];
  const el = page('verifyEmail', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return ok(requests.length === 1 ? { requestType: 'VERIFY_EMAIL' } : {});
  });
  await mountActionPage();
  assert.equal(requests.length, 1);
  assert.equal(el('confirm-action').hidden, false);
  await el('confirm-action').listeners.click();
  assert.match(requests[1].url, /accounts:update/);
  assert.equal(el('title').textContent, 'Email verified.');
  assert.equal(el('action-card')['aria-busy'], 'false');
});

test('reset form checks matching passwords, submits exact input, then clears fields', async () => {
  const requests = [];
  const el = page('resetPassword', async (_, options) => {
    requests.push(JSON.parse(options.body));
    return ok({ requestType: 'PASSWORD_RESET' });
  });
  await mountActionPage();
  assert.equal(el('password-form').hidden, false);
  el('password').value = ' password1 ';
  el('confirm-password').value = 'different';
  await el('password-form').listeners.submit({ preventDefault() {} });
  assert.equal(requests.length, 1);
  el('confirm-password').value = ' password1 ';
  await el('password-form').listeners.submit({ preventDefault() {} });
  assert.equal(requests[1].newPassword, ' password1 ');
  assert.equal(el('title').textContent, 'Password updated.');
  assert.equal(el('password').value, '');
});

test('wrong action types and expired codes cannot show a confirmation or reset form', async () => {
  for (const response of [ok({ requestType: 'VERIFY_EMAIL' }), { ok: false, json: async () => ({ error: { message: 'EXPIRED_OOB_CODE' } }) }]) {
    const el = page('resetPassword', async () => response);
    await mountActionPage();
    assert.equal(el('password-form').hidden, true);
    assert.equal(el('confirm-action').hidden, true);
    assert.equal(el('retry').hidden, true);
    assert.equal(el('error').hidden, false);
  }
});

test('network failures offer a retry and always stop loading', async () => {
  const el = page('verifyEmail', async () => { throw new TypeError('Failed to fetch'); });
  await mountActionPage();
  assert.equal(el('retry').hidden, false);
  assert.equal(el('action-card')['aria-busy'], 'false');
  assert.equal(el('error').hidden, false);
});

test('email recovery also requires explicit confirmation', async () => {
  let calls = 0;
  const el = page('recoverEmail', async () => { calls++; return ok({ requestType: 'RECOVER_EMAIL' }); });
  await mountActionPage();
  assert.equal(calls, 1);
  assert.equal(el('confirm-action').textContent, 'Restore email address');
  await el('confirm-action').listeners.click();
  assert.equal(el('title').textContent, 'Email restored.');
});
