# AgriGuard - Pitch Deck Outline

> **Submission track:** Challenge II — Synergizing Agriculture and Geomatics.

## Slide 1: The Problem - Climate Crisis & Farm Vulnerability
- **Visuals:** High-impact photos of drought or flooded African farms.
- **Key Stats:**
  - 60% of Africa's population relies on agriculture.
  - Climate extremes cause $9.3 billion in losses annually.
  - **The Real Problem:** Traditional insurance is broken. Claim verification takes 21+ days manually. High operational costs deter insurers, leaving smallholder farms uninsured and vulnerable to bankruptcy.

## Slide 2: The Solution - AgriGuard
- **Visuals:** Clean, modern logo & one-liner description.
- **Key Message:** "AgriGuard is an automated parametric insurance and real-time disaster alert platform."
- **Core Pillars:**
  - 100% Automated (Zero manual verification needed)
  - Real-time Alerts
  - Parametric Triggered Payouts

## Slide 3: The Engine - How it Works (The Tech Stack)
- **Visuals:** Simple diagram showing Satellite -> Backend Engine -> Action.
- **Key Message:** We fuse multi-source Earth Observation data with GNSS-captured WGS84 farm evidence.
- **Data Highlight:** Mention specific sources to impress judges.
  - *GEOGLOWS ECMWF* for flood prediction (live map layer; demo trigger uses simulated metrics).
  - *VIIRS Thermal Hotspots* for wildfire detection.
  - *GNSS/WGS84 capture* for farm geo-fencing with device, accuracy, and timestamp metadata.

## Slide 4: LIVE DEMO (The Climax)
- **Visuals:** Switch to live dashboard screen.
- **Action Sequence:**
  1. Show the farm mapped with a GNSS polygon.
  2. Explain the threshold rules (e.g., Water level > 2.5m).
  3. *Execute the clearly labelled simulation* behind the scenes.
  4. Point to screen as alert pops up. "We just detected a critical flood through the same claim engine used for production feeds; the live GEOGLOWS/VIIRS layers provide map context, while this demo uses clearly labeled simulated metrics."
  5. Show automated claim generation and confidence scoring.
  6. Show the claim status. Without blockchain credentials it remains `PENDING`; never imply a fake on-chain payout.
  7. *Hold up phone* to show SMS alert received.

## Slide 5: The Business Model & Impact
- **Visuals:** Simple flow chart of revenue model or bar chart showing cost reduction.
- **Key Message:** B2B2C model.
  - We sell to Insurers (SaaS Subscription + % of processed claims).
  - Target: reduce routine verification costs by up to 90%.
  - Target: compress claim processing from weeks to minutes once verified data feeds and settlement credentials are live.

## Slide 6: Future Vision & The Team
- **Visuals:** Team photo, roadmap timeline.
- **Key Message:** Start with maize/wheat -> expand to livestock -> scale across multiple African nations.
- **Closing:** "AgriGuard: Because climate resilience shouldn't take 21 days."
