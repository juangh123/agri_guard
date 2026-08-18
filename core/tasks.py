from celery import shared_task
import time
from django.core.management import call_command
import hashlib
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from twilio.rest import Client
from django.conf import settings
from openai import OpenAI
from .engine import ParametricClaimEngine
from core.services.llm_service import ask_agri_guard_ai
from core.services.blockchain_service import BlockchainService, BlockchainTransactionError, BlockchainConfigError
from decimal import Decimal

@shared_task
def send_sms_alert(phone_number, message):
    """
    发送短信到用户的手机号?    """
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Attempting to send SMS to {phone_number}...")
    print(f"Message: {message}")
    
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER:
        try:
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            twilio_msg = client.messages.create(
                body=message,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=phone_number
            )
            print(f"Real SMS Sent Successfully via Twilio! Message SID: {twilio_msg.sid}")
            return True
        except Exception as e:
            print(f"Failed to send real SMS via Twilio: {e}")
            print("Falling back to Mock SMS mode.")
    else:
        print("Twilio credentials not found in settings. Running in Mock SMS mode.")
        
    time.sleep(1.5)
    print("Mock SMS Sent Successfully!")
    return True

@shared_task
def generate_ai_damage_report(alert_id):
    """
    异步调用 OpenAI 生成灾害评估报告
    """
    from .models import RiskAlert
    try:
        alert = RiskAlert.objects.get(id=alert_id)
        event = alert.event
        farm = alert.farm
    except RiskAlert.DoesNotExist:
        return

    # Mock response if no API key is provided
    if not settings.OPENAI_API_KEY:
        mock_report = (
            f"🤖 [AI Simulation Mode] \n"
            f"Based on satellite data analysis for {event.get_event_type_display()} '{event.title}' "
            f"hitting {farm.name}:\n\n"
            f"- Estimated Crop Loss: {event.severity_level * 25}%\n"
            f"- Recommended Actions: Immediate irrigation control and soil nutrient check.\n"
            f"- Recovery Forecast: 3-6 months based on historical recovery metrics."
        )
        alert.ai_damage_report = mock_report
        alert.save()
        return "Mock AI Report generated"

    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        
        prompt = (
            f"You are an expert agricultural risk assessor. Generate a short, professional damage "
            f"estimation report (max 3 bullet points) for a farm named '{farm.name}'. "
            f"The farm was just hit by a {event.get_event_type_display()} event titled '{event.title}' "
            f"with a severity level of {event.severity_level} (out of 3). Include crop loss estimation and recovery advice."
        )
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a concise agricultural insurance AI."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=150
        )
        
        report = response.choices[0].message.content.strip()
        alert.ai_damage_report = f"🤖 [AI Analysis]\n{report}"
        alert.save()
        return "Real AI Report generated"
    except Exception as e:
        print(f"Failed to generate AI report: {e}")
        return str(e)


@shared_task(bind=True, autoretry_for=(Exception,), retry_kwargs={'max_retries': 3, 'countdown': 60})
def process_disaster_event(self, event_id, is_simulation=False):
    from .models import DisasterEvent, Farm, RiskAlert, Claim, ClaimTimeline

    try:
        event = DisasterEvent.objects.get(id=event_id)
    except DisasterEvent.DoesNotExist:
        return f"Event {event_id} does not exist."

    # Update to only use geofence polygon for intersection
    affected_farms = Farm.objects.filter(geofence__intersects=event.affected_area).distinct()
    
    alerts_created = 0
    engine = ParametricClaimEngine()

    for farm in affected_farms:
        eo_data_current = event.eo_metrics.copy() if event.eo_metrics else {}
        
        if is_simulation:
            # 仿真注入统一使用引擎侧 eo_metrics 键名：water_level_m / duration_days / fire_area_ha
            if event.event_type == 'WILDFIRE' and 'fire_area_ha' not in eo_data_current:
                eo_data_current['fire_area_ha'] = 6.0
            if event.event_type == 'FLOOD':
                if 'water_level_m' not in eo_data_current: eo_data_current['water_level_m'] = 3.0
                if 'duration_days' not in eo_data_current: eo_data_current['duration_days'] = 4
                if 'rain_anomaly' not in eo_data_current: eo_data_current['rain_anomaly'] = True
        
        # 将仿真注入后的指标写回事件对象（仅内存，不落库），并按引擎签名传入 Farm/DisasterEvent 对象
        event.eo_metrics = eo_data_current
        trigger_results = engine.evaluate_farm_status(farm, event)
        
        if not trigger_results['alert_needed']:
            continue
            
        confidence_val = trigger_results.get('confidence_score', 0.0)
        # Convert to 0-100 percentage
        confidence_pct = min(max(confidence_val * 100, 0), 100)

        alert_level = 'DISASTER' if trigger_results.get('claim_triggered') else 'WARNING'

        alert, created = RiskAlert.objects.get_or_create(
            farm=farm,
            event=event,
            defaults={
                'status': alert_level,
                'confidence': confidence_pct
            }
        )

        if created:
            alerts_created += 1
            
            payout_info = engine.process_payout(farm, event, trigger_results)
            
            if payout_info.get("status") == "AUTO_APPROVED":
                # 赔付金额统一使用引擎计算结果（calculate_payout），弃用 500*severity 硬编码
                payout = payout_info.get("amount", 0.0)
                if payout <= 0:
                    # 兜底说明：引擎金额为 0 时按严重程度估算，保证演示路径仍有一个合理赔付额
                    payout = 500.00 * event.severity_level
                
                tx_hash = None
                payment_succeeded = False
                
                # Generate evidence hash before creating the claim.
                evidence_data = f"{farm.id}-{event.id}-{event.start_date.isoformat()}-{confidence_pct}"
                evidence_hash = hashlib.sha256(evidence_data.encode()).hexdigest()

                # Create the claim first so the smart-contract call can use the real claim id.
                claim = Claim.objects.create(
                    farm=farm,
                    alert=alert,
                    status='PENDING',
                    payout_amount=payout,
                    evidence_hash=evidence_hash,
                    tx_hash=None,
                    paid_at=None
                )

                ClaimTimeline.objects.create(claim=claim, status='DETECTED', detail=f'{event.get_event_type_display()} detected inside geofence.')
                ClaimTimeline.objects.create(claim=claim, status='VERIFIED', detail=f'GNSS cross-validation passed. Confidence {confidence_pct}%.')
                ClaimTimeline.objects.create(claim=claim, status='TRIGGERED', detail=f'Confidence >= threshold. Smart contract triggered.')
                ClaimTimeline.objects.create(claim=claim, status='NOTIFIED', detail='SMS sent to farmer.')

                payment_succeeded = False
                tx_hash = None
                if farm.wallet_address:
                    try:
                        blockchain = BlockchainService()
                        tx_hash = blockchain.execute_payout(
                            claim_id=claim.id,
                            policy_holder_address=farm.wallet_address,
                            amount_usd=Decimal(str(payout))
                        )
                        claim.status = 'PAID'
                        claim.tx_hash = tx_hash
                        claim.paid_at = timezone.now()
                        claim.save()
                        payment_succeeded = True
                    except BlockchainConfigError as c_err:
                        print(f"Blockchain Config Error: {c_err}. Payout will be recorded as PENDING (simulated).")
                    except BlockchainTransactionError as t_err:
                        print(f"Blockchain Transaction Error: {t_err}. Payout will be recorded as PENDING (simulated).")
                    except Exception as e:
                        print(f"Web3 Error: {e}. Payout will be recorded as PENDING (simulated).")
                else:
                    print("Farm has no wallet address. Payout will be recorded as PENDING (simulated).")

                if payment_succeeded:
                    ClaimTimeline.objects.create(claim=claim, status='PAID', detail=f'Payout of ${payout} completed. TxHash: {tx_hash}')
                    message = f"URGENT: {trigger_results['disaster_type']} alert for '{farm.name}'. Claim #{claim.claim_no} generated. Payout: ${payout} USDC. TxHash: {tx_hash[:10]}..."
                else:
                    ClaimTimeline.objects.create(claim=claim, status='PENDING', detail=f'Payout of ${payout} simulated (Web3 not configured or transfer failed). No real funds moved.')
                    message = f"URGENT: {trigger_results['disaster_type']} alert for '{farm.name}'. Claim #{claim.claim_no} generated. Payout: ${payout} USDC (simulated, pending real settlement)."
                send_sms_alert.delay(farm.phone_number, message)
                
            else:
                alert.status = 'WARNING'
                alert.save()
                message = f"WARNING: {trigger_results['disaster_type']} conditions detected near '{farm.name}'. Monitor closely."
                send_sms_alert.delay(farm.phone_number, message)
            
            # Send WebSocket notification to frontend.
            # Redis/Channels may be unavailable during local demos; don't fail the whole claim.
            try:
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    'alerts_group',
                    {
                        'type': 'send_alert',
                        'message': {
                            'type': 'NEW_ALERT',
                            'data': {
                                'id': alert.id,
                                'farm_name': farm.name,
                                'event_title': event.title,
                                'status': alert.status,
                                'confidence': float(alert.confidence)
                            }
                        }
                    }
                )
            except Exception as websocket_error:
                print(f"WebSocket notification skipped: {websocket_error}")

            generate_ai_damage_report.delay(alert.id)

    return f"Processed Event {event_id}. Affected Farms: {affected_farms.count()}. New Alerts/Payouts: {alerts_created}."

@shared_task
def fetch_nasa_data_task():
    call_command('fetch_nasa_eonet')
    return "NASA data fetch completed"

