# Records retention and backup

## 1. Retention — **DAD must decide; these are starting points to confirm**
Keep shipping-quality records at least as long as the *longest* of: your quality manual, each customer contract/PO, and any code requirement. Figures commonly cited (verify before adopting — not legal advice):
- ISO 9001: you define the period; it must be documented and consistent (§7.5).
- ASME Section VIII Div. 1: the manufacturer keeps its data report for a minimum period (commonly cited ≥ 3 years) — confirm in the current edition.
- EU PED: technical documentation retained 10 years after the last unit is placed on the market.
- Customer contracts (pharma, defense, nuclear) can require 10+ years or “life of the equipment”.

Suggested policy to write into the quality manual: **“Shipment quality records are retained for __ years from the ship date (default: the longest customer/code requirement, minimum 10).”** Fill in the blank: ______

The app never deletes data. When the retention period ends, delete or archive deliberately, with QC manager approval, not automatically.

## 2. Backups
```bash
cd shipping-qc
npm run backup                  # -> data/backups/qc-YYYYMMDD-HHMMSS/ (DB copy + all uploads + MANIFEST.json), prunes backups older than BACKUP_KEEP_DAYS (30)
npm run verify-backup -- <dir>  # re-hashes every file, reopens the DB copy, re-verifies the audit hash chain
```
- Safe to run while the server is running.
- **Schedule nightly** (cron example): `15 1 * * * cd /opt/shipping-qc && npm run backup >> /var/log/qc-backup.log 2>&1`
- **Copy the backup folder off the machine** every night (second server, NAS, or cloud drive). A backup stored only on the server dies with the server.
- Keep: nightly for 30 days, plus one per month for 12 months (copy the monthly ones to a separate “archive” folder; the script only prunes `data/backups`).
- Photos dominate size. If disk gets tight, move old backups, not live `uploads/`.

## 3. Restore (practice this before go-live)
```bash
# 1. stop the QC server (the restore refuses to run while it is up)
cd shipping-qc
npm run restore -- /path/to/qc-YYYYMMDD-HHMMSS --yes
# 2. it verifies the backup, replaces DB + uploads, keeps the old DB as qc.db.pre-restore,
#    reopens the restored DB and re-checks the audit chain against the manifest.
# 3. start the server; Audit → Verify chain should be intact.
```
Restore test log — date / who / backup used / result: ______________________

## 4. Audit anchor (tamper evidence outside the server)
The audit log is hash-chained and append-only inside the database. To prove later that history was not rewritten, **save the anchor** (Audit page → *Show audit anchor*, or `npm run backup` prints it) weekly in a place the server’s admin cannot edit — e.g. email it to the QC manager and the plant manager, or paste into a locked spreadsheet. During an audit, compare the saved anchor with the chain.
