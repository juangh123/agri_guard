"""Create the database cache table that holds registration throttle counters.

Running this from a migration means every way the app starts (Vercel's
entrypoint, Docker Compose, the local scripts) gets the table from the
``migrate`` it already runs. ``createcachetable`` is idempotent and does nothing
for cache aliases that are not database-backed (e.g. THROTTLE_CACHE_URL=redis://).
"""

from django.core.management import call_command
from django.db import migrations


def create_cache_tables(apps, schema_editor):
    call_command(
        'createcachetable',
        database=schema_editor.connection.alias,
        verbosity=0,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_alter_claimtimeline_options'),
    ]

    operations = [
        migrations.RunPython(create_cache_tables, migrations.RunPython.noop),
    ]
