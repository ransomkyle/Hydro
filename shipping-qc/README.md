# DAD Manufacturing — Shipping QC

Shipment quality-release and audit system for a stainless steel fabrication shop. Every shipment — from a 1" part to a 50 ft vessel — gets its own signed-off, time-stamped checklist, a materials/traceability record, a custody timeline (time, place, driver, signature), photos and certs, and a one-click PDF **Quality Release Package** for the customer.

Standalone app inside this repo (own `package.json`, own database). The existing SprinkSoft `client/` and `server/` are untouched.

## Run it

```bash
cd shipping-qc
npm install
npm run build
QC_DEMO=1 npm start        # demo users + starter checklists  ->  http://localhost:4100
```

Without `QC_DEMO=1` it creates a single account **admin / admin1234** — sign in, change the password, set a PIN, add your team (Users page).

Demo accounts (password `changeme123`): `admin` `manager` `inspector` `inspector2` `operator` `shipping` `auditor` — PINs `1111 2222 3333 3434 4444 5555 6666`. **Delete or reset these before real use.**

Develop: `npm run dev` (API on :4100, UI on :5174). Tests: `npm test` (35 integration tests). Types: `npm run typecheck`. CI runs typecheck, tests and build on every PR (`.github/workflows/shipping-qc.yml`).

## Deploy on the shop network (on-prem)

1. **HTTPS is required** for tablets/phones: browsers only allow the camera, GPS, offline mode and offline PIN crypto on HTTPS (or `localhost`). Either run behind Caddy/nginx with a certificate, or `scripts/make-cert.sh qc.yourshop.local 192.168.1.50` and start with `QC_TLS_CERT=data/tls/cert.pem QC_TLS_KEY=data/tls/key.pem`, then install that cert on each device once.
2. Run with Docker (`docker build -t shipping-qc . && docker run -d -p 4100:4100 -v qcdata:/data shipping-qc`) or `npm start` under systemd/pm2.
3. **Back up the data folder** (`QC_DATA_DIR`, default `shipping-qc/data`): `qc.db` (+ `-wal`), `uploads/`, `.jwt-secret`. Nightly copy to another machine is enough; the SQLite file can be copied while running with `sqlite3 qc.db ".backup out.db"`.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `4100` | listen port |
| `QC_DATA_DIR` | `./data` | database, uploads, secret |
| `SHOP_TZ` | `America/Chicago` | timezone printed on the PDF |
| `COMPANY_NAME` | `DAD Manufacturing, Inc.` | name on the PDF |
| `COMPANY_ADDRESS` / `COMPANY_PHONE` / `COMPANY_WEB` | DAD Hiawatha HQ | contact line on the PDF header and footer |
| `QC_TLS_CERT` / `QC_TLS_KEY` | – | enable HTTPS directly |
| `NOTIFY_WEBHOOK_URL` | – | POSTs `{text,kind,shipmentId}` for flags/overrides (Teams/Slack/email gateway) |
| `SMTP_URL` / `SMTP_FROM` / `APP_URL` | – | optional email alerts (`smtps://user:pass@host`); `APP_URL` adds links to emails |
| `QC_PLANTS` | `Hiawatha (HQ);Lisbon` | plants, semicolon-separated (first is the default) |
| `QC_REQUIRE_APPROVED_TEMPLATES` | off | `1` = shipments can only use checklist templates a QC manager approved. **Turn on for production.** |
| `ON_TIME_GRACE_MIN` | `60` | minutes after the pickup appointment still counted "on time" |
| `BACKUP_KEEP_DAYS` | `30` | `npm run backup` prunes older backups |
| `TOKEN_TTL_HOURS` | `12` | login lifetime |
| `MAX_UPLOAD_MB` | `25` | per-file upload cap |

## How it works

**Roles:** Operator/Packer (signs items, logs materials/photos) · QC Inspector (signs QC items, verifies hold points, resolves flags) · QC Manager (releases shipments, edits templates, resolves critical flags, reopens) · Shipping (creates shipments, logistics, events) · Admin (users) · Auditor (read-only + exports).

**Sign-off:** individual login **plus PIN re-entry on every sign-off**. The server stamps the time. Items can require a recorded value, photo, or document before they can pass; N/A and FAIL need a written reason. **Hold points** need a *different* QC person to verify. Sign-offs are never edited — a QC person can *revoke* (reason + PIN) and the old entry stays in the audit log.

**Checklists are per job.** Pick one or more templates at intake (Base + Oversize + Sanitary + Pressure + Small parts + any customer template), the shipment gets its own copy, QC edits/adds/removes items for that job, and any job's checklist can be saved as a new customer template.

**Failures flag, not block.** A FAIL auto-raises a flag and notifies QC (in-app + optional webhook). Release is a soft gate: a manager sees every unsigned item / unverified hold point / open flag and may release with a written override, which is printed in red on the release package and notifies QC. A shipment recorded as picked up or departed *without* release raises a critical flag.

**Offline:** sign-offs, verifications, materials, events and photos made with no network are saved on the device with their original time and a unique id, then replay automatically (exactly once). Offline PINs are never stored or sent: the device checks the PIN against a verifier and signs the action with an HMAC derived from the PIN; the server re-verifies it on sync. Entries show both the device time and the server-receipt time and are labeled "offline" everywhere. Device clocks that are in the future or >14 days old are rejected.

**Audit trail:** every change is written to an append-only, hash-chained log (DB triggers refuse edit/delete; *Audit & reports → Verify chain* detects tampering). Filter, export CSV, and include it in audits.

## Also included
- **Plants** (Hiawatha, Lisbon) on every shipment, with filters and per-plant reports.
- **Gauge calibration register.** Measurement items record the gauge used; out-of-calibration, out-of-service or unknown gauges are rejected (ISO 9001 §7.1.5).
- **CAPA** (corrective/preventive action): open from any flag; a QC manager closes it with PIN only after root cause, corrective action and an effectiveness check are recorded.
- **Template approval** (document control): editing a checklist template clears its approval; a QC manager (a different one than the last editor, unless there is only one) approves with PIN. Set `QC_REQUIRE_APPROVED_TEMPLATES=1` to make approval mandatory.
- **Reports**: first-pass release %, on-time pickup %, median time to release, item failure rate, flags by checklist section, escapes (left dock without release), overrides, open/overdue CAPAs and gauges.
- **CSV import** of jobs from any ERP/Excel export (flexible column names, parts grouped per job, duplicate detection, row-level errors, preview before import).
- **Labels**: 4×6 shipping label with QR and a big **QC RELEASED / HOLD — NOT RELEASED** status. **Scan** QR/barcodes with the phone camera (Chrome/Android) or any USB/Bluetooth scanner.
- **Email alerts** (optional) alongside in-app and webhook alerts.
- **Backups**: `npm run backup`, `npm run verify-backup -- <dir>`, `npm run restore -- <dir> --yes`, plus a weekly **audit anchor** — see `docs/RETENTION-AND-BACKUP.md`.
- **Security**: lockouts that survive restarts, session revocation on password change, forced first-login password change + PIN, password policy, Content-Security-Policy — see `docs/SECURITY.md`.

## Rolling it out
`docs/GO-LIVE-CHECKLIST.md` → `docs/PILOT-PLAN.md` (4 weeks, parallel with paper, exit criteria) → `docs/TRAINING.md` (one-page cards per role).

## Branding (DAD Manufacturing)
Logo, colors and fonts come from dadmfg.com: navy `#002E5D`, magenta `#ED1566` accent, light blue `#83B7E6`; Raleway headings and Open Sans body (open-source, bundled so nothing loads from a CDN). The same identity is used in the app (header, login, installed-app icon) and the PDF release package (navy header band with logo, tagline, address, ISO line, running header and footer on every page). Brand constants live in `server/src/brand.ts` (PDF) and the top of `web/src/styles.css` (app); the logo files are `server/assets/dad-logo.png` and `web/public/dad-logo.png`. The ISO line reads "built to ISO 9001:2015 standards", matching the website wording (not "certified"). Font licenses (OFL) are included next to the font files.

## Not built yet (ask if you want them)
Live ERP integration (CSV import covers one-way job intake today — tell me which ERP DAD uses), MFA beyond PIN, customer portal / emailed packages, MTR OCR, HEIC photos in the PDF (stored fine), customer-specific PDF layouts (send me a customer's required package), FDA Part 11 validation package, multi-server/high-availability.

See [docs/DESIGN.md](docs/DESIGN.md) for the research behind the checklists and every assumption made.
