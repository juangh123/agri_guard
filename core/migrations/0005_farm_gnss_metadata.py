from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_cap_legacy_claim_payouts'),
    ]

    operations = [
        migrations.AddField(
            model_name='farm',
            name='gnss_accuracy_m',
            field=models.FloatField(blank=True, help_text='Estimated horizontal accuracy in metres', null=True, validators=[django.core.validators.MinValueValidator(0.0)]),
        ),
        migrations.AddField(
            model_name='farm',
            name='gnss_captured_at',
            field=models.DateTimeField(blank=True, help_text='Timestamp when the GNSS boundary was captured', null=True),
        ),
        migrations.AddField(
            model_name='farm',
            name='gnss_device_id',
            field=models.CharField(blank=True, default='', help_text='Device or receiver used to capture the GNSS boundary', max_length=100),
        ),
    ]
