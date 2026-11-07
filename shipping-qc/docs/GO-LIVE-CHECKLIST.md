# Go-live checklist — DAD Manufacturing Shipping QC

Work top to bottom. Nothing here is optional except where marked. Owner suggestions are in brackets.

## 1. Server and network [IT]
- [ ] Server machine chosen (always-on, UPS recommended). Node 22 or Docker installed.
- [ ] **HTTPS working** from a tablet on the shop Wi-Fi *and* from Lisbon if used there (`scripts/make-cert.sh`, Caddy, or a real certificate). Camera, GPS and offline mode do not work without it.
- [ ] Wi-Fi coverage walked: note dead spots (the app queues work offline, but know where they are).
- [ ] `QC_DATA_DIR` on a disk with room for photos (budget ~1–3 GB per year as a starting estimate; check after the pilot).
- [ ] Start on boot (systemd/Docker restart policy). Reboot test passed.
- [ ] Env vars set: `COMPANY_*`, `SHOP_TZ`, `QC_PLANTS`, `APP_URL`, `SMTP_URL`/`SMTP_FROM` (email) or `NOTIFY_WEBHOOK_URL` (Teams/Slack), `QC_REQUIRE_APPROVED_TEMPLATES=1`.
- [ ] Test email and/or webhook received for a failed item.

## 2. Backups [IT + QC manager]
- [ ] Nightly job runs `npm run backup` (see RETENTION-AND-BACKUP.md) and copies the folder **off the server**.
- [ ] **Restore test done on a spare machine** and `npm run verify-backup` printed OK. Date: ______
- [ ] Weekly audit anchor recorded somewhere independent (Audit page → Show audit anchor).

## 3. Accounts [Admin]
- [ ] Demo accounts removed (never start with `QC_DEMO=1` in production). Default `admin` password changed on first sign-in.
- [ ] One account per person, correct role. Everyone has an email if alerts by email are wanted.
- [ ] Everyone has set their own PIN (the app forces this at first sign-in).
- [ ] QC managers and admins have turned on **two-factor sign-in** (My account → Two-factor sign-in).
- [ ] At least **two** QC managers exist (template approval needs a second person; a sole manager may self-approve).

## 4. Content [QC manager — this is the most important section]
- [ ] Each starter template reviewed **line by line** against the quality manual and the top customers’ requirements; edited; **approved** (Checklists → Approve).
- [ ] Customer-specific templates created for the top customers.
- [ ] Gauge register entered with real calibration due dates (Gauges).
- [ ] Plants list correct (`QC_PLANTS`).
- [ ] Size thresholds sensible for DAD’s trailers (`web/src/lib/format.ts` and `server/src/size.ts`).
- [ ] Sample release package and label printed and approved by QC (and by one friendly customer if possible).
- [ ] Records-retention period decided (RETENTION-AND-BACKUP.md §1).

## 5. People [QC manager]
- [ ] Training done with TRAINING.md quick cards (30 minutes per role).
- [ ] PILOT-PLAN.md started; paper process still running in parallel.
- [ ] Who to call when it breaks is written on the dock whiteboard.

## 6. Exit from pilot → cut over [Plant manager + QC manager]
- [ ] Pilot exit criteria in PILOT-PLAN.md met and signed.
- [ ] Paper checklist retired for the pilot scope; old paper records archived per retention policy.
