from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


OLD_APP = "finanza"
NEW_APP = "finnet"
MODEL_TABLES = (
    ("finanza_userprofile", "finnet_userprofile"),
    ("finanza_dataaccessgrant", "finnet_dataaccessgrant"),
)
CONTENT_TYPE_MODELS = ("userprofile", "dataaccessgrant")


class Command(BaseCommand):
    help = "Rename legacy finanza database metadata and tables to finnet."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show planned changes without writing to the database.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if connection.vendor != "sqlite":
            raise CommandError(
                "rename_finanza_to_finnet supports only SQLite databases."
            )

        with connection.cursor() as cursor:
            planned = self._planned_table_renames(cursor)
            self._validate_metadata(cursor)

            if dry_run:
                self._report_plan(cursor, planned)
                return

            with transaction.atomic():
                self._rename_tables(cursor, planned)
                self._rename_migration_app(cursor)
                self._rename_content_types(cursor)

        self.stdout.write(self.style.SUCCESS("Finnet database rename complete."))

    def _table_exists(self, cursor, table_name):
        cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = %s",
            [table_name],
        )
        return cursor.fetchone() is not None

    def _planned_table_renames(self, cursor):
        planned = []
        for old_table, new_table in MODEL_TABLES:
            old_exists = self._table_exists(cursor, old_table)
            new_exists = self._table_exists(cursor, new_table)
            if old_exists and new_exists:
                raise CommandError(
                    f"Mixed table state: both {old_table} and {new_table} exist."
                )
            if old_exists:
                planned.append((old_table, new_table))
        return planned

    def _validate_metadata(self, cursor):
        self._validate_migration_rows(cursor)
        self._validate_content_type_rows(cursor)

    def _validate_migration_rows(self, cursor):
        if not self._table_exists(cursor, "django_migrations"):
            return
        cursor.execute(
            """
            SELECT app, COUNT(*)
            FROM django_migrations
            WHERE app IN (%s, %s)
            GROUP BY app
            """,
            [OLD_APP, NEW_APP],
        )
        apps = {row[0]: row[1] for row in cursor.fetchall()}
        if OLD_APP in apps and NEW_APP in apps:
            raise CommandError(
                "Mixed migration state: django_migrations has both "
                "finanza and finnet rows."
            )

    def _validate_content_type_rows(self, cursor):
        if not self._table_exists(cursor, "django_content_type"):
            return
        for model in CONTENT_TYPE_MODELS:
            cursor.execute(
                """
                SELECT app_label, COUNT(*)
                FROM django_content_type
                WHERE app_label IN (%s, %s) AND model = %s
                GROUP BY app_label
                """,
                [OLD_APP, NEW_APP, model],
            )
            labels = {row[0]: row[1] for row in cursor.fetchall()}
            if OLD_APP in labels and NEW_APP in labels:
                raise CommandError(
                    "Mixed content type state: django_content_type has both "
                    f"finanza and finnet rows for {model}."
                )

    def _report_plan(self, cursor, planned):
        if planned:
            for old_table, new_table in planned:
                self.stdout.write(f"Would rename table {old_table} -> {new_table}")
        else:
            self.stdout.write("No legacy finanza tables to rename.")

        self._report_row_count(
            cursor,
            "django_migrations",
            "app",
            OLD_APP,
            "Would update django_migrations app finanza -> finnet",
        )
        self._report_row_count(
            cursor,
            "django_content_type",
            "app_label",
            OLD_APP,
            "Would update django_content_type app_label finanza -> finnet",
        )

    def _report_row_count(self, cursor, table, column, value, message):
        if not self._table_exists(cursor, table):
            return
        qn = connection.ops.quote_name
        cursor.execute(
            f"SELECT COUNT(*) FROM {qn(table)} WHERE {qn(column)} = %s",
            [value],
        )
        count = cursor.fetchone()[0]
        self.stdout.write(f"{message}: {count} row(s)")

    def _rename_tables(self, cursor, planned):
        qn = connection.ops.quote_name
        for old_table, new_table in planned:
            cursor.execute(f"ALTER TABLE {qn(old_table)} RENAME TO {qn(new_table)}")

    def _rename_migration_app(self, cursor):
        if not self._table_exists(cursor, "django_migrations"):
            return
        cursor.execute(
            "UPDATE django_migrations SET app = %s WHERE app = %s",
            [NEW_APP, OLD_APP],
        )

    def _rename_content_types(self, cursor):
        if not self._table_exists(cursor, "django_content_type"):
            return
        cursor.execute(
            "UPDATE django_content_type SET app_label = %s WHERE app_label = %s",
            [NEW_APP, OLD_APP],
        )
