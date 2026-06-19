from django.db import migrations


def _column_names(cursor, table_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row[1] for row in cursor.fetchall()}


def migrate_legacy_contribution_source_column(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != "sqlite":
        return

    table_name = "portfolio_assettransaction"
    quote = connection.ops.quote_name
    with connection.cursor() as cursor:
        columns = _column_names(cursor, quote(table_name))
        if (
            "contribution_source" not in columns
            or "contribution_source_id" not in columns
        ):
            return

        cursor.execute(
            """
            SELECT tx.id, tx.contribution_source, tx.contribution_source_id,
                   COALESCE(tx.owner_id, asset.owner_id) AS effective_owner_id
            FROM portfolio_assettransaction tx
            JOIN portfolio_asset asset ON asset.id = tx.asset_id
            WHERE tx.contribution_source IS NOT NULL
              AND TRIM(tx.contribution_source) != ''
              AND tx.contribution_source_id IS NULL
            """
        )
        rows = cursor.fetchall()
        for tx_id, source_name, _source_id, owner_id in rows:
            source_name = str(source_name).strip()[:80]
            if not source_name:
                continue
            cursor.execute(
                """
                SELECT id
                FROM portfolio_contributionsource
                WHERE owner_id IS ? AND LOWER(name) = LOWER(?)
                ORDER BY sort_order, name, id
                LIMIT 1
                """,
                [owner_id, source_name],
            )
            source = cursor.fetchone()
            if source:
                contribution_source_id = source[0]
            else:
                cursor.execute(
                    """
                    SELECT COALESCE(MAX(sort_order), -1) + 1
                    FROM portfolio_contributionsource
                    WHERE owner_id IS ?
                    """,
                    [owner_id],
                )
                sort_order = cursor.fetchone()[0] or 0
                cursor.execute(
                    """
                    INSERT INTO portfolio_contributionsource
                        (name, sort_order, is_active, owner_id)
                    VALUES (?, ?, ?, ?)
                    """,
                    [source_name, sort_order, True, owner_id],
                )
                contribution_source_id = cursor.lastrowid
            cursor.execute(
                """
                UPDATE portfolio_assettransaction
                SET contribution_source_id = ?
                WHERE id = ?
                """,
                [contribution_source_id, tx_id],
            )

        schema_editor.execute(
            f"ALTER TABLE {quote(table_name)} DROP COLUMN {quote('contribution_source')}"
        )


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("portfolio", "0031_contribution_source_fields"),
    ]

    operations = [
        migrations.RunPython(
            migrate_legacy_contribution_source_column,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
