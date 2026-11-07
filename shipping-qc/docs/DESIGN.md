# Design notes, research, and assumptions

## What you asked for → where it lives
| Need | Implementation |
|---|---|
| Audited checklist, every sign-off time-stamped | `checklist_items` + hash-chained `audit_log`; server time on every action; PIN re-entry |
| What people did / materials used | Materials tab (base metal heat/lot + grade, consumables, packaging), Parts tab (heat per part), notes on every sign-off |
| Time + place shipped / picked up | `events` (ready, loaded, departed, picked-up, delivered): time, dock/place text, GPS, person, drawn signature |
| Anything around quality control | Flags, hold-point verification, photos, MTR/cert attachments, release package PDF, CSV exports |
| 1" part … 50 ft | Size classes + stackable checklist modules; tie-down guide; permit hints |
| Offline shop floor | Local queue + service worker (see README) |

## Industry research that shaped the checklists
These are **starting points**. Your customer PO/spec and your quality manual always win — edit templates accordingly.

* **ISO 9001 §8.5.2 (identification/traceability), §8.6 (release of products), §8.7 (nonconforming outputs), §7.1.5 (calibrated gauges):** why every shipment records who released it and when, heat-number traceability, and a gauge ID when a value is measured.
* **Stainless-specific contamination control (ASTM A380 / A967):** iron pick-up from carbon steel tooling, slings, forks, and racks is the classic stainless quality escape — the base checklist covers surface condition, dedicated/nonmetallic dunnage, nylon slings, and no steel fasteners against stainless.
* **Sanitary (3-A, ASME BPE):** surface finish by Ra (profilometer + calibration), passivation records (A967 test method), weld color per AWS D18.2, borescope of internal welds, weld logs/maps with welder IDs and purge records, drainability, cleanliness, documentation package. Ra limits are shown as examples only (e.g. ≤32 µin 3-A, ≤20 µin BPE SF2) — use the customer's spec.
* **Pressure (ASME B31.3 §341/§345, ASME VIII, PED):** nameplate/stamp, test record (pressure, hold time, gauge calibration), NDE records, WPS/PQR/welder qualifications, MTR traceability with PMI, data report (U-1A etc.), Authorized Inspector hold point, and the stainless-specific **test-water chloride limit (commonly ≤ 50 ppm) and drain/dry** requirement.
* **Oversize/heavy:** length/width/height/weight, permits per state on the route, escorts, trailer type (flatbed/step-deck/RGN), lift points and rigging (ASME B30.9/B30.20), cradles, **FMCSA cargo securement (49 CFR 393.100–393.136)**: aggregate working load limit ≥ 50% of cargo weight, and minimum tie-down count — 1–2 for ≤10 ft, then 2 for the first 10 ft plus 1 per additional 10 ft or fraction (a 50 ft load → 6). The Logistics tab computes this. It is **guidance**: carrier, state and customer rules can be stricter; verify against current regulations.
* **Legal-limit hints** (width 102 in, height 13 ft 6 in, length 53 ft trailer, 80,000 lb gross) drive the "likely needs permits" banner. State rules vary.

## Key decisions
* **Per-job checklists (your answer: "fully custom per customer/job").** A shipment *copies* template items at creation, so editing a template never rewrites history, and per-job edits (add/edit/remove with reason) are audited. Templates are a convenience, not a constraint.
* **Failure = flag + notify (your answer), with a soft release gate.** Nothing technically blocks a release, but nothing slips through silently either: a manager must type an override reason that prints on the package and alerts QC. If you want hard blocking later, it's a one-line change in `readiness.ts` / the release route.
* **Locking.** After release the checklist and materials lock; logistics, events and photos stay open until delivery (securement photos happen at pickup). A manager can reopen with reason + PIN.
* **Offline signature scheme.** PIN → PBKDF2-SHA256 (150k) key → HMAC over `opId|action|item|result|value|note|clientAt`. Server stores the derived key (equivalent to a salted PIN hash) and recomputes the HMAC. The device only holds a *hash of the key* to catch typos. Replays are deduplicated by op id.
* **Tamper-evidence, not tamper-proof.** The hash chain and append-only triggers detect edits; someone with raw access to both the DB file *and* the ability to recompute every later hash could still rewrite history. For stronger guarantees, periodically export the latest hash (shown in *Verify chain*) somewhere independent, or ship the CSV to write-once storage.

## Assumptions I made (tell me if any are wrong)
1. 5–25 users, one plant, one on-prem server, shop Wi-Fi mostly works with dead spots (offline is a safety net, not the primary mode).
2. Sign-offs use **individual login + PIN**: the PIN must belong to the person logged in, so on a shared tablet people sign out/in between sign-offs (the PIN alone does not switch users). If sign-out friction is too high on the dock, a "badge/PIN switches user" mode can be added.
3. Shipments are keyed in by hand now; job numbers are free text; no ERP integration yet.
4. US units (inches, pounds), US timezone default, English only.
5. Starter checklist wording is my best-practice default, **not reviewed against your quality manual or customer requirements** — have your QC manager review and edit each template before first use.

## Known limitations
* Offline PINs need a prior online login on that device (to receive the PIN salt/verifier) and HTTPS.
* Photos are shown in the PDF only if JPEG/PNG (phone photos are converted to JPEG on upload; HEIC is stored but not embedded).
* PDF layout is functional, not branded — send me a logo and a sample of a customer's required package and I'll match it.
* No email; notifications are in-app and optional webhook.
* Brute-force throttling is in-memory (resets on restart).
