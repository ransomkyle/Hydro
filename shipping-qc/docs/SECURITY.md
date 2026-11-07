# Security notes

## What is in place
- **Individual accounts + PIN re-entry** for every sign-off; roles limit who can sign, verify, release, approve, edit.
- **Optional two-factor sign-in** (authenticator app, RFC 6238 TOTP): password then a 6-digit code; each code works once; lost phone → admin reset (audited, user alerted). Recommended for QC managers and administrators.
- Passwords hashed (bcrypt); PINs stored as a salted PBKDF2-SHA256 (150k) derived key; password policy (10+, not common, not containing the username).
- **Lockout** after 5 failures (5 minutes) for logins and PIN checks, stored in the database so a restart does not reset it.
- **Session revocation**: changing or resetting a password, deactivating, or changing a role invalidates existing sessions. New/reset accounts must change their temporary password and set a PIN before using anything else.
- Offline sign-offs are authenticated by an HMAC derived from the PIN; the PIN is never stored on the device or sent while offline. Replays are exactly-once (op ids); device clocks in the future or >14 days old are rejected.
- Append-only, hash-chained audit log (DB triggers refuse edits and deletes); `Verify chain`, weekly **anchor**, and backup manifests re-check it.
- Uploads: allow-list (JPEG, PNG, WebP, HEIC, PDF), magic-byte check, SHA-256 fingerprint, served only with a valid login, `nosniff`. No SVG/HTML.
- CSV exports neutralise spreadsheet formula injection.
- Headers: Content-Security-Policy (no inline scripts, same-origin only), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy.
- Soft-gated overrides (release with open items, departed without release) are recorded and alert QC.

## Review log
A manual review of authentication, signing, offline replay, uploads, SQL construction and exports found and fixed (with regression tests):
- an op id was recorded before validation, so a rejected attempt could make a later valid retry look like a duplicate → now recorded only inside the transaction that applies the change;
- offline back-dating window was 14 days → now 3 days (`MAX_OFFLINE_AGE_DAYS`);
- email subjects could carry newlines → stripped;
- admin password/PIN resets were silent → the person and the QC managers are now alerted (and it is audited).
Checked and fine: all SQL is parameterised (dynamic column names come only from validated, allow-listed keys); uploads are allow-listed, magic-byte checked, stored under a server-generated hash name; auth is by `Authorization` header (no cookies, so no CSRF); React escapes all rendered text; PDFs/CSVs are generated server-side with formula neutralisation.

## Accepted risks (understand these)
- **Back-dating within the offline window.** A dishonest user with their own PIN can submit a sign-off flagged “offline” with a time up to 3 days earlier. It is always visible: the record shows *offline*, the device time, and the server-receipt time. Reviewers should look at offline entries (Audit → “Offline only”) where the gap is large.
- **Lock-out can be triggered by someone else** who types wrong passwords/PINs for your username (5 failures → 5 minutes). Annoying, not a breach; stops brute-forcing.
- **An administrator can take over an account** (reset password + PIN). Every reset is audited and alerts the user and QC managers; keep the number of admins small.

## Known gaps — decide whether they matter to DAD
| Gap | Risk | Mitigation / next step |
|---|---|---|
| Two-factor sign-in is optional, not enforced | Accounts without it rely on password + PIN | Have managers/admins turn it on (My account); keep the server off the internet (VPN only) |
| Session token kept in browser storage | XSS would expose it | CSP blocks inline/third-party script; tokens expire in 12 h |
| Uploads/DB not encrypted at rest | Stolen disk | Use OS disk encryption (BitLocker/LUKS) on the server |
| Single server, single SQLite file | Outage on hardware failure | Nightly off-box backups; restore tested |
| Not validated for FDA 21 CFR Part 11 | Pharma customers may ask | Controls are aligned (unique attributable signatures, time stamps, audit trail) but there is no IQ/OQ/PQ package — scope a validation if a customer requires it |
| Template/PDF content not reviewed by a code-body or customer | Wrong requirement printed | QC manager review + approval workflow (do this) |
| Self-signed HTTPS requires installing the cert on each device | Users click through warnings | Use a real certificate or an internal CA pushed to devices |
| Email alerts rely on your SMTP | Missed alert | Also keep in-app alerts + webhook; test monthly |

## Reporting
Security problems: tell the QC manager and IT immediately; do not post details in chat. Revoke an account by setting it inactive (Users page) — sessions end at once.
