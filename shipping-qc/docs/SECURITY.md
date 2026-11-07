# Security notes

## What is in place
- **Individual accounts + PIN re-entry** for every sign-off; roles limit who can sign, verify, release, approve, edit.
- Passwords hashed (bcrypt); PINs stored as a salted PBKDF2-SHA256 (150k) derived key; password policy (10+, not common, not containing the username).
- **Lockout** after 5 failures (5 minutes) for logins and PIN checks, stored in the database so a restart does not reset it.
- **Session revocation**: changing or resetting a password, deactivating, or changing a role invalidates existing sessions. New/reset accounts must change their temporary password and set a PIN before using anything else.
- Offline sign-offs are authenticated by an HMAC derived from the PIN; the PIN is never stored on the device or sent while offline. Replays are exactly-once (op ids); device clocks in the future or >14 days old are rejected.
- Append-only, hash-chained audit log (DB triggers refuse edits and deletes); `Verify chain`, weekly **anchor**, and backup manifests re-check it.
- Uploads: allow-list (JPEG, PNG, WebP, HEIC, PDF), magic-byte check, SHA-256 fingerprint, served only with a valid login, `nosniff`. No SVG/HTML.
- CSV exports neutralise spreadsheet formula injection.
- Headers: Content-Security-Policy (no inline scripts, same-origin only), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy.
- Soft-gated overrides (release with open items, departed without release) are recorded and alert QC.

## Known gaps — decide whether they matter to DAD
| Gap | Risk | Mitigation / next step |
|---|---|---|
| No multi-factor sign-in (password + PIN only) | Stolen password+PIN | Keep the server off the internet (VPN only); add TOTP if exposed |
| Session token kept in browser storage | XSS would expose it | CSP blocks inline/third-party script; tokens expire in 12 h |
| Uploads/DB not encrypted at rest | Stolen disk | Use OS disk encryption (BitLocker/LUKS) on the server |
| Single server, single SQLite file | Outage on hardware failure | Nightly off-box backups; restore tested |
| Not validated for FDA 21 CFR Part 11 | Pharma customers may ask | Controls are aligned (unique attributable signatures, time stamps, audit trail) but there is no IQ/OQ/PQ package — scope a validation if a customer requires it |
| Template/PDF content not reviewed by a code-body or customer | Wrong requirement printed | QC manager review + approval workflow (do this) |
| Self-signed HTTPS requires installing the cert on each device | Users click through warnings | Use a real certificate or an internal CA pushed to devices |
| Email alerts rely on your SMTP | Missed alert | Also keep in-app alerts + webhook; test monthly |

## Reporting
Security problems: tell the QC manager and IT immediately; do not post details in chat. Revoke an account by setting it inactive (Users page) — sessions end at once.
