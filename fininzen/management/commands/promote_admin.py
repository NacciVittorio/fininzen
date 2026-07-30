"""promote_admin — bootstrap path for the first admin user.

New registrations start UserProfile.status="pending" and only an admin can
approve them via the admin portal — so the very first admin can't come from
inside the app. This command promotes (and approves) an existing user
directly, bypassing the API.
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from fininzen.models import UserProfile


class Command(BaseCommand):
    help = "Promote an existing user to the admin role (bootstrap path)."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise CommandError(f"No user with email {email!r}.")

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = UserProfile.ROLE_ADMIN
        if profile.status != UserProfile.STATUS_APPROVED:
            profile.status = UserProfile.STATUS_APPROVED
            profile.approved_at = timezone.now()
        profile.save()
        self.stdout.write(self.style.SUCCESS(f"{email} is now an admin."))
