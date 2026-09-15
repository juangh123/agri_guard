# AgriGuard — 03: Impact Metrics & Market Size

> Projected impact, milestone roadmap, TAM/SAM/SOM analysis, and SDG alignment.
>
> These figures describe the product target and market thesis, not measured pilot results.

---

## Impact: Before vs. After

| Metric | Traditional Insurance | AgriGuard target (Parametric + GNSS) | Improvement target |
|:---|:---|:---|---:|
| **Claim Settlement Time** | 4–12 Weeks (human adjuster dispatch) | **Minutes** after verified data + settlement configuration | **>99% faster** |
| **Claim Verification Cost** | $50–$200 per claim (field visit) | **Near $0 marginal cost** for routine PostGIS evaluation | **Up to 90% lower** |
| **Fraud Rate** | 10–15% (subjective farmer reporting) | **Reduced** through GNSS boundary metadata and auditable claim evidence | **Design objective** |
| **Payout Currency Risk** | Local currency (depreciation risk) | **USDC Stablecoin** (dollar-denominated, no inflation loss) | **Protected** |
| **Farmer Onboarding Reach** | Limited to large commercial farms | **Any farmer with SMS** (USSD 规划中) | **10x reach** |
| **Premium Affordability** | $50–$200/year (unaffordable) | **~$25/year micro-premium** (90% cost reduction via automation) | **5–10x cheaper** |

---

## Target Milestones (Year 1–3)

| Year | Key Milestones |
|:---|:---|
| **Year 1** | Pilot with 2 insurance partners in Kenya + Nigeria. Onboard 5,000 farmers. Validate EONET ingestion, trusted threshold feeds, and configured settlement. |
| **Year 2** | Scale to 25,000 farmers. Add GEOGLOWS flood forecasting integration. Launch USSD fallback channel. |
| **Year 3** | 120,000+ farmers across East & West Africa. Integrate IoT soil sensor validation layer. 60% reduction in post-disaster bankruptcy rates. |

---

## Market Size Estimation

```
TAM (Total Addressable Market)
├── 485 million African smallholder livelihoods exposed to climate losses
├── Uninsured climate losses: $9.3B per year
└── Current insurance penetration: < 3%

SAM (Serviceable Addressable Market)
├── 120 million farms across Sub-Saharan Africa + SE Asia
├── Serviceable value: $2.4B per year
└── Reachable via mobile money / SMS (USSD 规划中)

SOM (Serviceable Obtainable Market — 3-Year Target)
├── Pilot 2 countries (Kenya, Nigeria): 12 million farms → $240M per year
├── Year-3 target penetration: 1% of SOM = 120,000 insured farmers
├── Average micro-premium margin: $25 per policy per year
└── Projected ARR: 120,000 × $25 = ~$3M
```

### Revenue Model Breakdown

| Revenue Stream | Unit Economics | Year 3 Projection |
|:---|:---|:---|
| **Micro-premium margin (B2C)** | $25/policy/year | 120,000 × $25 = **$3.0M** |
| **Platform License (B2B)** | $10K–$50K/insurer/year | Upside (not counted in base ARR target) |
| **Settlement Fee** | $0.50 per processed payout | Upside (not counted in base ARR target) |
| **Total ARR (base)** | — | **~$3M** |

---

## SDG Alignment

| SDG | How AgriGuard Contributes |
|:---|:---|
| **SDG 1 — No Poverty** | Target: faster post-disaster liquidity reduces farm bankruptcy and the poverty spiral |
| **SDG 2 — Zero Hunger** | Protecting farmers = protecting food supply chains in vulnerable regions |
| **SDG 13 — Climate Action** | EO monitoring ties premiums to sustainable practices; incentivizes climate-resilient farming |
| **SDG 9 — Industry & Innovation** | GNSS + geospatial automation infrastructure for inclusive agricultural insurance |

---

*Part 3 of 5 — AgriGuard Hackathon Submission, July 2026*
