from django.db import migrations


def normalize_claim_timeline_details(apps, schema_editor):
    """Remove legacy wording that implied an unconfigured on-chain transfer had run."""
    ClaimTimeline = apps.get_model('core', 'ClaimTimeline')

    ClaimTimeline.objects.filter(
        status='TRIGGERED',
        detail='Confidence >= threshold. Smart contract triggered.',
    ).update(detail='Confidence threshold met. Settlement processing started.')

    ClaimTimeline.objects.filter(
        status='NOTIFIED',
        detail='SMS sent to farmer.',
    ).update(detail='Farmer notification dispatched or queued.')

    for item in ClaimTimeline.objects.filter(status='PENDING'):
        if item.detail.startswith('Payout of ') and (
            ' simulated ' in item.detail or ' remains PENDING ' in item.detail
        ):
            amount = item.claim.payout_amount
            item.detail = (
                f'Payout of {amount} remains PENDING '
                '(Web3 not configured or transfer failed). No real funds moved.'
            )
            item.save(update_fields=['detail'])


def restore_legacy_claim_timeline_details(apps, schema_editor):
    ClaimTimeline = apps.get_model('core', 'ClaimTimeline')

    ClaimTimeline.objects.filter(
        status='TRIGGERED',
        detail='Confidence threshold met. Settlement processing started.',
    ).update(detail='Confidence >= threshold. Smart contract triggered.')

    ClaimTimeline.objects.filter(
        status='NOTIFIED',
        detail='Farmer notification dispatched or queued.',
    ).update(detail='SMS sent to farmer.')

    for item in ClaimTimeline.objects.filter(status='PENDING'):
        if item.detail.startswith('Payout of ') and ' remains PENDING ' in item.detail:
            amount = item.detail.removeprefix('Payout of ').split(' remains PENDING ', 1)[0]
            item.detail = (
                f'Payout of {amount} simulated '
                '(Web3 not configured or transfer failed). No real funds moved.'
            )
            item.save(update_fields=['detail'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_farm_gnss_metadata'),
    ]

    operations = [
        migrations.RunPython(
            normalize_claim_timeline_details,
            restore_legacy_claim_timeline_details,
        ),
    ]
