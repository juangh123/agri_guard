# DoraHacks BUIDL Form - AgriGuard

This is the field-by-field worksheet for the SATNAV G4-SAA submission. It keeps
the public metadata, copy-paste text, assets, and pre-submission questions in one
place.

## Submission Window

| Item | Time |
|:---|:---|
| Pre-registration opens | 2026-12-10 10:00 UTC / 18:00 Beijing |
| Submission window opens | 2026-12-14 08:23 UTC / 16:23 Beijing |
| Submission deadline | 2026-12-17 20:00 UTC / 2026-12-18 04:00 Beijing |

Rechecked on the hackathon page on 2026-11-14 (schema.org `startDate`
`2026-12-10T10:00:00.000Z`, `endDate` `2026-12-17T20:00:00.000Z`). The
organizers moved the whole timeline one month later without an announcement,
so recheck the page before acting on these dates.

Register for the hackathon before attempting to create the BUIDL. The page
states that eligibility for submissions, bounties, and prizes requires
registration.

## Field Values

| DoraHacks field | Value |
|:---|:---|
| Project name | AgriGuard |
| Tagline | Zero-Touch Parametric Crop Insurance & Real-Time Early Warning for Africa's Smallholder Farmers |
| Track | Challenge II - Synergizing Agriculture and Geomatics |
| Repository | https://github.com/juangh123/agri_guard |
| Live demo | https://agri-guard-api-live.vercel.app |
| Demo login | `demo` / `demo123` |
| Video | `docs/AgriGuard_Demo_Final.mp4` (re-recorded 2026-10-28 on the live URL); optionally upload as YouTube unlisted / Loom |
| Cover image | `docs/screenshots/09_overview_pipeline.png` |
| Gallery order | `09_overview_pipeline.png`, `10_live_map.png`, `11_claims_pending.png`, `12_reports_pipeline.png`, `13_sms_alerts.png`, `14_mobile_map.png` |
| License | MIT |
| Team | Jason (`juangh123`) - solo builder |
| Tech stack | Django, PostGIS, Celery, Redis, React, MapLibre GL, Esri Living Atlas, Web3.py, Solidity reference contract, OpenAI, Twilio |

## Short Description (copy-paste)

```markdown
AgriGuard is a zero-touch parametric crop insurance and early warning platform
designed to protect Sub-Saharan Africa's smallholder farmers against floods,
droughts, wildfires, and heatwaves.

Every year, African farmers lose about $9.3B to climate disasters, yet over 97%
lack insurance because verification is expensive and claims take 4-12 weeks.
AgriGuard combines GNSS-defined farm boundaries, Earth-observation signals, and
an auditable settlement workflow:

1. GNSS/WGS84 farm polygons walked on a phone or imported from a GNSS
   receiver's raw NMEA/GPX log, with a server-computed accuracy and a public
   per-farm GNSS evidence report (uncertainty grade, reproducibility checks).
2. NASA EONET event footprints plus live Esri Living Atlas VIIRS, GEOGLOWS, and
   stream-gauge layers. Automated threshold ingestion is a roadmap item; the
   demo labels simulated metrics clearly.
3. A PostGIS spatial trigger that identifies affected farms without paperwork.
4. Multi-source verification, published thresholds, district-level calibration,
   a basis-risk reserve, and an auditable review window to manage parametric
   basis risk.
5. Mobile money (M-Pesa / Flutterwave roadmap) as the intended first payout
   rail. ERC-20 settlement is an optional, explicitly gated audit rail; missing
   configuration leaves the claim PENDING instead of creating a fake TxHash.
6. SMS status updates and an AI damage report with deterministic fallbacks.

The target is to compress the claim cycle from 12 weeks to minutes, lower
routine verification costs, and improve post-disaster liquidity for
smallholders.
```

## Full Description

Use [`SUBMISSION_FULL.md`](SUBMISSION_FULL.md). It contains the architecture,
trigger logic, GNSS evidence boundary, settlement boundary, market thesis,
basis-risk management, and judging-criteria mapping.

## Review Notes to Include

- The public demo uses labeled simulated metrics and explicit `PENDING`
  settlement; it never fabricates a transaction hash.
- GNSS boundaries are WGS84 polygons in PostGIS and are intersected with hazard
  footprints using `ST_Intersects`.
- Receiver-log import: on the registration page choose *Receiver file* and
  *Try a synthetic sample log*. The sample is generated (file names start with
  `SYNTHETIC_`); the server rejects its injected defects and computes the
  accuracy from the receiver's GST sentences. Each farm's evidence report is at
  `/api/farms/<id>/gnss-evidence/html/` and is linked from the Live Map card.
- NASA EONET event locations are not presented as claim-grade threshold data.
- OpenAI, Twilio, and ERC-20 calls require both credentials and explicit
  `LIVE_*_ENABLED` gates.

## Questions for the Organizers

Ask these through DoraHacks before the submission window:

1. Is participation limited to people or teams based in Africa? The page says
   it invites those on the African continent to participate, but the eligibility
   wording is not explicit.
2. May a project that existed before the hackathon be submitted, as long as the
   hackathon-specific work and evidence are disclosed?
3. Is a solo builder eligible, and are there any team-size limits?
4. Are repository-hosted MP4 files acceptable, or is a YouTube/Loom link
   required for the demo video?

## Final Submission Checklist

- [ ] Complete hackathon registration on DoraHacks.
- [ ] Create the BUIDL after the submission window opens.
- [ ] Select Challenge II - Synergizing Agriculture and Geomatics.
- [ ] Paste the short and full descriptions.
- [ ] Upload the cover image and the six screenshots in order.
- [x] Re-record the demo video against the canonical live URL (done 2026-10-28); upload it with the BUIDL.
- [ ] Run `python scripts/verify_deployment.py` and confirm 18/18 PASS (includes the receiver-log sample, parse preview and GNSS evidence report).
- [ ] Save the BUIDL URL and update the README `Submission URL` field.
