from django.apps import AppConfig


class SplittingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "splitting"

    def ready(self):
        import splitting.signals  # noqa: F401
