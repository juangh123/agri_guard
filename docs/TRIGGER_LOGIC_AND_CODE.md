# AgriGuard - Trigger Logic and Code

> **Status:** This document describes the implementation in this repository. The source files are authoritative.
>
> **Honest boundary:** GNSS/WGS84 boundaries, PostGIS intersections, crop-specific threshold rules, EONET event ingestion, REST/WebSocket flows, AI reports, and SMS fallbacks are implemented. Demo metrics are simulated. The Solidity contract is a reference escrow design and is not called by the current settlement service. An unconfigured or failed transfer leaves the claim `PENDING`; AgriGuard never fabricates a transaction hash.

## 1. Trigger Pipeline

```text
GNSS/WGS84 farm boundary
        |
NASA EONET event footprint / labeled demo event
        |
PostGIS ST_Intersects
        |
Crop-specific parametric rules
        |
Claim + evidence hash + timeline
        |
Configured ERC-20 settlement OR explicit PENDING status
        |
WebSocket update + Twilio SMS + OpenAI report fallback
```

The map also displays live Esri Living Atlas layers for VIIRS fire activity, GEOGLOWS streamflow, and stream gauges. Direct threshold ingestion from those layers is roadmap work, so the demo uses clearly labeled simulated metrics.

## 2. GNSS-Anchored Farm Model

```python
class Farm(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='farms')
    name = models.CharField(max_length=255)
    geofence = models.PolygonField(
        srid=4326,
        help_text="GNSS/WGS84 boundary polygon",
    )
    gnss_device_id = models.CharField(max_length=100, blank=True, default='')
    gnss_accuracy_m = models.FloatField(null=True, blank=True)
    gnss_captured_at = models.DateTimeField(null=True, blank=True)
    crop_type = models.CharField(max_length=50, default='maize')
    phone_number = models.CharField(max_length=20)
    wallet_address = models.CharField(max_length=42, null=True, blank=True)
```

The registration API validates that the submitted geometry is a WGS84 polygon and stores the optional GNSS capture metadata.

## 3. Parametric Decision Engine

Thresholds are crop-specific. For example, maize has a flood threshold of `2.5 m` for `3 days`, a wildfire threshold of `5 ha`, a drought trigger at `NDWI < -0.2`, and a heatwave trigger at a `+2.0 C` anomaly for `3 days`.

```python
trigger_results = engine.evaluate_farm_status(farm, event)

if not trigger_results['alert_needed']:
    continue

if trigger_results['claim_triggered']:
    payout_info = engine.process_payout(farm, event, trigger_results)
```

The payout calculation uses the farm area capped to a realistic smallholder envelope, disaster severity, and confidence:

```python
payout = (
    Decimal('25.00')
    * insured_area_ha
    * Decimal(event.severity_level)
    * Decimal(str(trigger_results['confidence_score']))
)
```

This avoids making a hand-drawn or erroneous large polygon produce an unrealistically large claim.

## 4. Orchestration in `core/tasks.py`

```python
affected_farms = Farm.objects.filter(
    geofence__intersects=event.affected_area
).distinct()

for farm in affected_farms:
    trigger_results = engine.evaluate_farm_status(farm, event)
    if not trigger_results['alert_needed']:
        continue

    alert, created = RiskAlert.objects.get_or_create(
        farm=farm,
        event=event,
        defaults={
            'status': 'DISASTER' if trigger_results['claim_triggered'] else 'WARNING',
            'confidence': trigger_results['confidence_score'] * 100,
        },
    )
```

For an approved claim, AgriGuard:

1. Creates the claim with status `PENDING`.
2. Builds a SHA-256 evidence hash that includes the event, confidence, farm ID, and GNSS metadata.
3. Writes a claim timeline for detection, verification, trigger, and notification.
4. Attempts a configured ERC-20 settlement.
5. Retains `PENDING` and `tx_hash=None` if settlement is unavailable or fails.
6. Sends WebSocket, SMS, and AI-report tasks without making settlement success a prerequisite.

## 5. ERC-20 Settlement Path

`core/services/blockchain_service.py` treats `SMART_CONTRACT_ADDRESS` as the ERC-20 token address. It validates the wallet and amount, converts USD to token units, signs the transfer from the oracle wallet, and returns a real transaction hash only after the node accepts the transaction.

Required settings:

```dotenv
WEB3_PROVIDER_URI=
WEB3_PRIVATE_KEY=
SMART_CONTRACT_ADDRESS=
WEB3_PAYOUT_DECIMALS=6
LIVE_SETTLEMENT_ENABLED=True
```

Credentials alone never trigger a real transfer. `LIVE_SETTLEMENT_ENABLED`
must also be `True`; if any required setting is missing or the gate is false,
the task logs the reason and leaves the claim pending. This behavior is covered
by tests.

## 6. NASA EONET Event Ingestion

`core/management/commands/fetch_nasa_eonet.py` runs every six hours through Celery Beat. It ingests severe-storm and wildfire event footprints as GeoDjango polygons.

EONET does not provide verified flood depth, duration, or fire area for this workflow. The command therefore stores:

```python
eo_metrics = {
    'source': 'NASA EONET',
    'ingestion_mode': 'event-footprint',
    'threshold_metrics_verified': False,
}
```

Without verified threshold metrics, the engine produces no automatic claim. This prevents an event location from being mistaken for claim-grade evidence.

## 7. Solidity Policy Contract

`contracts/AgriGuardParametric.sol` is the reference design for the insurer escrow phase:

- Oracle creates a policy with a farm wallet, coverage amount, and boundary hash.
- Oracle can trigger a payout once.
- The contract transfers an ERC-20 token and deactivates the policy.

The current backend does not deploy or invoke this contract. Keeping the boundary explicit makes the roadmap auditable and prevents the reference design from being presented as a live integration.

## 8. API and Verification

Manual analysis endpoint:

```text
POST /api/events/{id}/trigger_analysis/
```

Demo simulation endpoint:

```text
POST /api/events/simulate/
```

The simulation endpoint injects labeled, deterministic threshold values so the complete UI workflow can be demonstrated without paid data feeds.

Run the backend tests with:

```bash
python manage.py test core -v 2
```

The test suite covers flood, wildfire, drought, and heatwave thresholds; farm permissions; idempotent event processing; GNSS evidence fields; NASA ingestion integrity; Web3 6/7 signing compatibility; and the safety gates that prevent credentials alone from creating fake payouts or real external actions. Live AI, SMS, and settlement each require an explicit `LIVE_*_ENABLED` opt-in.
