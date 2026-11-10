// Firebase's public project key, not a service-account credential.
const API_KEY = 'AIzaSyArcitG7fd8YkXISF3sQ1r09O7E8hRrgKE';
const actionTypes = { verifyEmail: 'VERIFY_EMAIL', resetPassword: 'PASSWORD_RESET', recoverEmail: 'RECOVER_EMAIL' };

export function parseAction(search) {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const code = params.get('oobCode');
  if (!Object.hasOwn(actionTypes, mode) || !code || code.length > 4096 || params.getAll('mode').length !== 1 || params.getAll('oobCode').length !== 1) {
    throw new Error('INVALID_LINK');
  }
  // Ignore apiKey and continueUrl from the URL: use our project and never redirect to untrusted input.
  return { mode, code, type: actionTypes[mode] };
}

export function passwordError(password, confirmation) {
  if (password.length < 8 || password.length > 128) return 'Use a password between 8 and 128 characters.';
  if (password !== confirmation) return 'The passwords don’t match. Please try again.';
  return null;
}

export function errorMessage(error) {
  const code = error.message?.split(' : ')[0];
  if (['INVALID_LINK', 'INVALID_OOB_CODE', 'EXPIRED_OOB_CODE'].includes(code)) return 'This link has expired, has already been used, or is incomplete. Request a fresh email from the app.';
  if (['USER_DISABLED', 'USER_NOT_FOUND', 'EMAIL_NOT_FOUND'].includes(code)) return 'This account is unavailable. Please contact us if you need help.';
  if (['WEAK_PASSWORD', 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS'].includes(code)) return 'Choose a stronger password that meets your account’s password requirements.';
  if (['TOO_MANY_ATTEMPTS_TRY_LATER', 'QUOTA_EXCEEDED'].includes(code)) return 'Too many attempts. Please wait a little before trying again.';
  return 'We couldn’t complete that right now. Check your connection and try again.';
}

export async function firebaseRequest(endpoint, payload, fetcher = globalThis.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'REQUEST_FAILED');
    return data;
  } finally { clearTimeout(timeout); }
}

export async function mountActionPage() {
  const byId = id => document.getElementById(id);
  const title = byId('title'), description = byId('description'), status = byId('status');
  const form = byId('password-form'), confirm = byId('confirm-action'), retry = byId('retry');
  const error = byId('error'), card = byId('action-card');
  let action;
  let busy = false;
  function heading(text, body) {
    title.textContent = text; description.textContent = body;
    document.title = `${text} — The Lazy Tax`;
  }
  function setBusy(value) {
    busy = value; card.setAttribute('aria-busy', String(value));
    confirm.disabled = value; byId('save-password').disabled = value; retry.disabled = value;
  }
  function showError(cause) {
    error.textContent = errorMessage(cause); error.hidden = false;
  }
  function success() {
    form.reset(); form.hidden = true; confirm.hidden = true; error.hidden = true; retry.hidden = true;
    const text = action.mode === 'resetPassword' ? 'Password updated.' : action.mode === 'recoverEmail' ? 'Email restored.' : 'Email verified.';
    heading(text, action.mode === 'verifyEmail' ? 'You’re ready for your first small win.' : 'You’re all set.');
    status.hidden = false;
    status.textContent = action.mode === 'verifyEmail' ? 'Return to the app to continue setting up your account.' : 'Return to the app and sign in with your updated account details.';
    byId('home').hidden = false;
    history.replaceState(null, '', location.pathname);
    title.focus();
  }
  async function checkLink() {
    setBusy(true); error.hidden = true; retry.hidden = true;
    status.hidden = false; status.textContent = 'Checking your email link…';
    try {
      action = parseAction(location.search);
      const info = await firebaseRequest('resetPassword', { oobCode: action.code });
      if (info.requestType !== action.type) throw new Error('INVALID_LINK');
      status.hidden = true;
      if (action.mode === 'resetPassword') {
        heading('A fresh password.', 'Choose a new password for your The Lazy Tax account.');
        form.hidden = false;
      } else {
        const recovery = action.mode === 'recoverEmail';
        heading(recovery ? 'Restore your email.' : 'Make it official.', recovery ? 'Restore the email address previously used for your account.' : 'Confirm your email address to finish setting up The Lazy Tax.');
        confirm.textContent = recovery ? 'Restore email address' : 'Verify email';
        confirm.hidden = false;
      }
    } catch (cause) {
      heading('Let’s check that link.', 'Open the full link from your most recent account email.');
      status.hidden = true; form.hidden = true; confirm.hidden = true;
      showError(cause);
      retry.hidden = ['INVALID_LINK', 'INVALID_OOB_CODE', 'EXPIRED_OOB_CODE'].includes(cause.message);
    } finally { setBusy(false); }
  }
  confirm.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true); error.hidden = true;
    try { await firebaseRequest('update', { oobCode: action.code }); success(); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const password = byId('password').value;
    const invalid = passwordError(password, byId('confirm-password').value);
    if (invalid) { error.textContent = invalid; error.hidden = false; return; }
    setBusy(true); error.hidden = true;
    byId('save-password').textContent = 'Saving…';
    try { await firebaseRequest('resetPassword', { oobCode: action.code, newPassword: password }); success(); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); byId('save-password').textContent = 'Save new password'; }
  });
  retry.addEventListener('click', checkLink);
  await checkLink();
}
if (typeof document !== 'undefined') mountActionPage();
