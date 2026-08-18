from decimal import Decimal

from django.db import migrations


def cap_legacy_claim_payouts(apps, schema_editor):
    """Cap legacy demo claims that were generated before micro-insurance pricing."""
    Claim = apps.get_model('core', 'Claim')
    maximum_demo_payout = Decimal('500.00')

    for claim in Claim.objects.filter(payout_amount__gt=maximum_demo_payout):
        claim.payout_amount = maximum_demo_payout
        claim.save(update_fields=['payout_amount'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_alter_claim_status'),
    ]

    operations = [
        migrations.RunPython(cap_legacy_claim_payouts, migrations.RunPython.noop),
    ]
