# AgriGuard — 01: Pitch Script & Submission Abstract

> **Tagline:** Zero-Touch Parametric Insurance & Real-time Early Warning System for Africa's Smallholder Farmers, powered by GNSS, Earth Observation, and Web3.
>
> **Submission track:** Challenge II — Synergizing Agriculture and Geomatics.

---

## 90-Second Elevator Pitch

**[0:00 — The Problem]**

Every year, African farmers lose **$9.3 billion** to climate disasters. Yet agricultural insurance penetration is **below 3%**. Why? Because traditional insurance is broken for smallholders — claims take **up to 12 weeks**, verification requires expensive field visits, and premiums are unaffordable. A single delayed payout pushes a family from subsistence into bankruptcy.

**[0:30 — Our Solution]**

We built **AgriGuard** to reduce the human adjustment bottleneck with GNSS-defined farm evidence and space-derived hazard signals.

Here's how it works: We use GNSS-captured WGS84 boundaries to create auditable geo-fences around every insured farm. Every 6 hours, our system pulls live event footprints from **NASA EONET** and displays hydrological forecasts from **GEOGLOWS**. When a verified hazard footprint intersects a farmer's GNSS-defined plot, **PostGIS spatial queries** identify every potentially affected farmer without a field visit or manual paperwork.

**[0:55 — The Money Moment]**

The backend evaluates crop-specific thresholds and, when configured, signs an **ERC-20 settlement transfer** from the insurer/oracle wallet; otherwise the claim remains visibly `PENDING`. The farmer receives an **SMS status alert** via Twilio, and our **OpenAI damage estimator** generates an assessment report. A Solidity policy contract is included as the reference escrow design for the next phase.

**[1:10 — Impact & Business]**

Our target is to reduce claim settlement from 12 weeks to 3 minutes and cut verification costs by up to 90% while making farm-boundary evidence auditable. Our B2B2C SaaS model charges insurers per policy plus a micro-transaction fee per settlement. With 120,000 farmers onboarded, we project **~$3M ARR**. Every automated claim drives downstream satellite-service consumption, making AgriGuard a bridge between space technology and financial inclusion.

**AgriGuard: When the Earth speaks, farmers get paid.**

---

## Written Abstract (250 words)

**Problem:** Climate disasters cost African agriculture $9.3B annually, yet insurance covers less than 3% of smallholder farmers. Traditional insurance fails because claim verification requires costly field surveys, settlements take 4–12 weeks, and premiums are unaffordable for subsistence farmers. Delayed liquidity post-disaster forces families into irreversible poverty.

**Solution:** AgriGuard is a zero-touch parametric insurance platform that reduces the manual loss-adjustment bottleneck with geospatial evidence. The system integrates GNSS-captured WGS84 farm polygons, **NASA EONET** for event-footprint monitoring, **GEOGLOWS** for live flood-forecast visualization (automated threshold ingestion is a production roadmap item), **PostGIS** for spatial intersection analysis, a configured **ERC-20 settlement path**, and **Twilio SMS** for low-bandwidth farmer alerts (**USSD** planned). When verified hazard metrics intersect a farmer's GNSS-defined plot, the backend either executes a configured token transfer or records a transparent `PENDING` claim. The included Solidity contract is the reference escrow design for the next phase. An OpenAI-powered damage estimator generates assessment reports in parallel.

**Innovation:** AgriGuard closes the loop from GNSS-defined farm boundaries and space-derived hazard signals to auditable financial resilience for underserved farmers. Captured boundary metadata strengthens evidence integrity, while parametric rules remove routine administrative overhead. The platform supports seven UI languages, with USSD fallback planned for farmers without smartphones. A real-time MapLibre/Esri dashboard visualizes active hazards, affected farms, and claim status via WebSocket streaming.

**Impact target:** Claim settlement falls from 12 weeks to under 3 minutes when integrations are live. Verification costs approach zero. Our Year-3 target is 120,000 protected farmers, materially improved post-disaster liquidity, and ~$3M ARR from a $25 average annual micro-premium.

---

*Part 1 of 5 — AgriGuard Hackathon Submission, July 2026*
