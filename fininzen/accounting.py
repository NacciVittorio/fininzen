import calendar
from datetime import date, timedelta

from django.core.exceptions import ObjectDoesNotExist


def clamp_accounting_start_day(value):
    try:
        day = int(value)
    except (TypeError, ValueError):
        return 1
    return min(max(day, 1), 31)


def month_start_for_day(year, month, start_day):
    day = clamp_accounting_start_day(start_day)
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def next_month(year, month):
    if month == 12:
        return year + 1, 1
    return year, month + 1


def accounting_month_range(year, month, start_day):
    """Return inclusive date range for the labelled accounting month."""
    start = month_start_for_day(year, month, start_day)
    ny, nm = next_month(year, month)
    end = month_start_for_day(ny, nm, start_day) - timedelta(days=1)
    return start, end


def get_user_accounting_start_day(user):
    if not (user and getattr(user, "is_authenticated", False)):
        return 1
    try:
        return clamp_accounting_start_day(user.profile.accounting_month_start_day)
    except (ObjectDoesNotExist, AttributeError):
        # No UserProfile row yet, or user has no `.profile` relation — fall back
        # to the calendar default. clamp_accounting_start_day already absorbs
        # bad values, so only the missing-profile case reaches here. (HIGH-13)
        return 1
