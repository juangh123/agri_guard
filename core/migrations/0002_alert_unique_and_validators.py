# Hand-written migration: alert uniqueness + severity_level validators

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='disasterevent',
            name='severity_level',
            field=models.IntegerField(default=1, help_text='1: Low, 2: Medium, 3: High', validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(3)]),
        ),
        migrations.AddConstraint(
            model_name='riskalert',
            constraint=models.UniqueConstraint(fields=('farm', 'event'), name='unique_alert_per_farm_event'),
        ),
    ]
