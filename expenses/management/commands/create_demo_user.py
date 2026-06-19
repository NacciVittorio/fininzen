import logging
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger(__name__)

DEMO_EMAIL = "demo@demo.com"


class Command(BaseCommand):
    help = "Create the shared demo user and ensure the monthly demo seed exists."

    def handle(self, *args, **options):
        from portfolio.models import Asset, InvestmentType
        from finnet.demo_seed import ensure_demo_seed

        with transaction.atomic():
            demo_user, created = User.objects.select_for_update().get_or_create(
                username=DEMO_EMAIL,
                defaults={"email": DEMO_EMAIL},
            )
            should_seed, _ = ensure_demo_seed(demo_user, Asset, InvestmentType)

        if created:
            self.stdout.write(f"Created demo user: {DEMO_EMAIL}")
        else:
            self.stdout.write(f"Demo user already exists: {DEMO_EMAIL}")

        if should_seed:
            self.stdout.write("Demo data seeded successfully.")
        else:
            self.stdout.write("Demo data already up to date.")
