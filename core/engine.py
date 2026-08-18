from datetime import datetime
from decimal import Decimal
from typing import Dict, Any

class ParametricClaimEngine:
    def __init__(self):
        # Preset thresholds based on crop type and region
        # In a real system, these would be loaded from the database or dynamically from agricultural data
        self.thresholds = {
            "maize": {
                "flood_water_level_m": 2.5,  # Water level threshold for flooding
                "flood_duration_days": 3,    # Duration needed for severe damage
                "fire_area_hectares": 5.0,   # Fire intersection area threshold
                "drought_ndwi_threshold": -0.2 # Normalized Difference Water Index for drought
            },
            "wheat": {
                "flood_water_level_m": 2.0,
                "flood_duration_days": 2,
                "fire_area_hectares": 3.0,
                "drought_ndwi_threshold": -0.15
            },
            "livestock": {
                "flood_water_level_m": 4.0,
                "flood_duration_days": 5,
                "fire_area_hectares": 10.0,
                "drought_ndwi_threshold": -0.3
            }
        }

    def evaluate_farm_status(self, farm, event, intersect_area_ha: float = 0.0) -> Dict[str, Any]:
        """
        Evaluate if a disaster event triggers a parametric claim for a specific farm.
        :param farm: Farm object
        :param event: DisasterEvent object containing eo_metrics
        :param intersect_area_ha: Pre-calculated intersection area between farm boundaries and disaster zone
        """
        crop_type = farm.crop_type
        rules = self.thresholds.get(crop_type, self.thresholds["maize"]) # Default to maize
        
        trigger_results = {
            "alert_needed": False,
            "claim_triggered": False,
            "confidence_score": 0.0,
            "disaster_type": event.event_type,
            "reason": ""
        }

        eo_data = event.eo_metrics or {}
        
        # 1. Flood Logic (GEOGLOWS ECMWF Streamflow data)
        if event.event_type == 'FLOOD':
            water_level = float(eo_data.get('water_level_m', 0))
            duration = int(eo_data.get('duration_days', 0))
            
            if water_level >= rules['flood_water_level_m'] and duration >= rules['flood_duration_days']:
                trigger_results['alert_needed'] = True
                trigger_results['claim_triggered'] = True
                trigger_results['reason'] = f"Flood parameters exceeded (Level: {water_level}m, Duration: {duration}d)"
                
                # Multi-source validation: e.g. rainfall anomalies boost confidence
                rain_anomaly = eo_data.get('rain_anomaly', False)
                trigger_results['confidence_score'] = 0.95 if rain_anomaly else 0.85
            elif water_level >= rules['flood_water_level_m'] * 0.8:
                # Warning zone
                trigger_results['alert_needed'] = True
                trigger_results['reason'] = f"Approaching flood threshold (Level: {water_level}m)"

        # 2. Wildfire Logic (VIIRS Thermal Hotspots & Area Intersection)
        elif event.event_type == 'WILDFIRE':
            fire_area = float(eo_data.get('fire_area_ha', intersect_area_ha))
            
            if fire_area >= rules['fire_area_hectares']:
                trigger_results['alert_needed'] = True
                trigger_results['claim_triggered'] = True
                trigger_results['reason'] = f"Wildfire affected area ({fire_area}ha) exceeds threshold."
                trigger_results['confidence_score'] = 0.99 # VIIRS thermal data is highly accurate
            elif fire_area > 0:
                trigger_results['alert_needed'] = True
                trigger_results['reason'] = f"Wildfire detected nearby/partially ({fire_area}ha)."

        # 3. Drought Logic
        elif event.event_type == 'DROUGHT':
            ndwi = float(eo_data.get('ndwi', 0.0))
            if ndwi < rules['drought_ndwi_threshold']:
                trigger_results['alert_needed'] = True
                trigger_results['claim_triggered'] = True
                trigger_results['reason'] = f"Severe drought detected (NDWI: {ndwi})."
                trigger_results['confidence_score'] = 0.90

        return trigger_results

    def calculate_payout(self, farm, event, trigger_results: Dict[str, Any]) -> Decimal:
        """
        Calculate the payout amount based on severity and parametric results.
        """
        if not trigger_results['claim_triggered']:
            return Decimal('0.00')
            
        # Micro-insurance pricing: smallholder policies should never become seven-figure
        # payouts just because a hand-drawn GNSS polygon spans many square kilometres.
        base_amount = Decimal('25.00')  # USD per insured hectare
        insured_area_cap_ha = Decimal('5.00')
        minimum_insured_area_ha = Decimal('0.50')

        farm_area = getattr(farm, 'area', None)
        if farm_area:
            farm_area_ha = Decimal(str(farm_area))
        else:
            try:
                # Transform geofence (srid 4326) to Mercator to get area in m², then convert to hectares
                geofence_m = farm.geofence.transform(3857, clone=True)
                farm_area_ha = Decimal(str(geofence_m.area / 10000))
            except Exception:
                farm_area_ha = Decimal('1.0')

        # Clamp to a realistic insured smallholder area. The raw polygon area is still used
        # for spatial intersection/detection; it is only capped for payout arithmetic.
        farm_area_ha = max(farm_area_ha, minimum_insured_area_ha)
        farm_area_ha = min(farm_area_ha, insured_area_cap_ha)

        severity_multiplier = Decimal(event.severity_level)
        confidence = Decimal(str(trigger_results['confidence_score']))

        # Payout = Base * capped insured area * Severity * Confidence
        payout = base_amount * farm_area_ha * severity_multiplier * confidence
        payout = payout.quantize(Decimal('0.01'))

        # In a tiered payout model: small disasters yield partial payout, big yield full.
        if event.severity_level >= 3:
            return payout  # Full claim
        else:
            return payout * Decimal('0.5') # Partial claim

    def process_payout(self, farm, event, trigger_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process the payout, returning a dictionary with status and amount.
        """
        amount = self.calculate_payout(farm, event, trigger_results)
        
        status = "REJECTED"
        if amount > 0 and trigger_results.get('confidence_score', 0) >= 0.8:
            status = "AUTO_APPROVED"
        elif amount > 0:
            status = "PENDING_REVIEW"
            
        return {
            "status": status,
            "amount": float(amount)
        }

# Initialize global engine instance
engine = ParametricClaimEngine()
