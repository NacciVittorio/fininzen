from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from finnet.demo_seed import DEMO_EMAIL, ensure_demo_seed


class Command(BaseCommand):
    help = "Ensure the shared demo account has a fresh monthly seed."

    def handle(self, *args, **options):
        from portfolio.models import Asset, InvestmentType

        with transaction.atomic():
            demo_user, created = User.objects.select_for_update().get_or_create(
                username=DEMO_EMAIL,
                defaults={"email": DEMO_EMAIL},
            )
            should_seed, _ = ensure_demo_seed(demo_user, Asset, InvestmentType)

        if created:
            self.stdout.write(f"Created demo user: {DEMO_EMAIL}")
        if should_seed:
            self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))
        else:
            self.stdout.write("Demo data already up to date.")
