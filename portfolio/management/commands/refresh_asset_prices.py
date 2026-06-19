import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from portfolio.prices import aggiorna_tutti_i_prezzi


class Command(BaseCommand):
    help = "Refresh tracked asset prices. Intended for cron/systemd timers."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            dest="username",
            help="Optional username/email to refresh a single tenant.",
        )

    def handle(self, *args, **options):
        user = None
        username = (options.get("username") or "").strip()
        if username:
            user_model = get_user_model()
            user = (
                user_model.objects.filter(username=username).first()
                or user_model.objects.filter(email=username).first()
            )
            if user is None:
                raise CommandError(f"User not found: {username}")

        result = aggiorna_tutti_i_prezzi(user=user)
        self.stdout.write(json.dumps(result, sort_keys=True, default=str))
