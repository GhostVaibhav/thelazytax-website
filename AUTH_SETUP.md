# Firebase email action pages

Public handler: **https://thelazy.site/auth/action/**

The same URL displays separate verification, password reset, and email recovery screens. Firebase supplies `mode` and the one-time `oobCode`. Opening a link only checks it; verification, recovery, and password changes require an explicit button press. The page uses the existing website stylesheet, Nunito files, logo, header, and footer.

## 1. Publish and check the website

These are static files, served by the website's existing GitHub Pages deployment. No Firebase Hosting, Lambda, server secret, or new dependency is required.

- Open `https://thelazy.site/auth/action/`. With no email code, it should show a styled incomplete-link message. This is expected.
- Check that `https://thelazy.site/auth/action/action.mjs` and `action.css` load successfully before changing Firebase's settings.
- Do not paste a sample `oobCode` into an email template. Every recipient needs Firebase's generated, single-use link.

## 2. Configure Firebase

1. Open [the Firebase project](https://console.firebase.google.com/project/thelazytax-bc9a8/authentication/emails).
2. Under **Authentication → Settings → Authorized domains**, add `thelazy.site` if it is not present. Keep existing app and Firebase domains. This also permits this domain for future continue URLs.
3. Under **Authentication → Templates**, edit **Email address verification**.
4. Choose **Customize action URL**, enter exactly `https://thelazy.site/auth/action/`, and save.
5. Firebase applies that custom handler to **all the project's email templates**. Reopen **Password reset** and **Email address change** to confirm the URL shown. The handler supports `resetPassword`, `verifyEmail`, and `recoverEmail`; unsupported modes display an error without modifying an account.
6. Keep `%LINK%` in each template's action link. Firebase replaces it with the handler URL and its action parameters.
7. Set the sender display name to **The Lazy Tax**, and a monitored reply-to address if desired. A custom sender domain is a separate optional DNS/Firebase configuration; it is not needed for these pages.

Do not change Firebase's OAuth redirect URL or the app's `authDomain` for this feature. Do not turn off App Check or relax API-key restrictions. The handler already uses the project's existing public Web API key; no secret key belongs in this repository. If switching to a dedicated website API key later, update `API_KEY` in `auth/action/action.mjs`, enable Identity Toolkit API access for it, and retest both code flows before publication.

## 3. Test real emails

Use disposable test accounts, not a customer's account.

### Verification

1. Register a test account in the app and request the verification email.
2. Confirm the emailed button points to `https://thelazy.site/auth/action/?mode=verifyEmail&...`.
3. Open it on a phone and desktop. Check the branded page, then press **Verify email**.
4. Confirm the success screen. Return to the app and use its email-verification refresh/continue action.
5. Try the same link again: an expired/used-link message is expected, not another account mutation.

### Password reset

1. In Firebase Authentication's Users section, select a disposable password account and send a password reset email, or use the app's reset request flow if present.
2. Confirm the link's `mode=resetPassword` and the correct website hostname.
3. Check empty/short passwords and mismatched confirmation are rejected.
4. Save a valid new password. Return to the app and sign in with it; the old password should fail.
5. Reusing the link must fail cleanly. Google/Apple sign-in accounts without a password do not need a password reset to access their social login.

### Email recovery and error states

- For a test account with an email-change recovery link, confirm **Restore email address** restores the previous address.
- Check a missing, expired, or tampered link; it must not show an actionable reset form.
- Disconnect the network and retry; the page should stop loading and offer **Try again**.

## 4. App integration

The existing app `sendEmailVerification()` calls can stay unchanged: Firebase's template setting supplies the handler URL. Sending a password reset email through `sendPasswordResetEmail()` will use this handler as well. Changing the website handler does not add a missing Forgot Password entry point to the app.

`ActionCodeSettings.url` is an optional post-action continue URL, not the handler URL. This page deliberately ignores incoming `continueUrl` and `apiKey` values so links cannot redirect visitors to another site or operate against another Firebase project. It tells users to return to the app manually. Automatic universal/app-link return navigation is a separate app association and routing change.

## Checks and rollback

Run `node --test tests/auth-action.test.mjs` (Node 20+). Tests mock Firebase; they do not send emails or mutate accounts.

To roll back routing, restore the previous action URL in Firebase's email template settings, then request a fresh email. Existing emails retain their original URLs, so keep this page deployed for previously issued links.

No passwords or action codes are saved, logged, or sent to this website's server by JavaScript. Codes remain in the emailed URL until success, when the query is removed from browser history. Hosting infrastructure may still receive query strings on the initial page request. The page has no analytics, external fonts, or third-party scripts, and sets a no-referrer policy.

References: [Custom action handlers](https://firebase.google.com/docs/auth/custom-email-handler), [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth).
