from fininzen.mixins import _effective_user


def serializer_user(serializer):
    request = serializer.context.get("request")
    if request:
        user = _effective_user(request)
        # AnonymousUser is truthy, so callers' `if user` guards would wrongly
        # try to scope querysets by it (e.g. during OpenAPI schema generation,
        # where the introspection request carries no authenticated user).
        # Normalise the unauthenticated case to None.
        if user is not None and getattr(user, "is_authenticated", False):
            return user
        return None
    instance = getattr(serializer, "instance", None)
    return getattr(instance, "owner", None)


def parse_optional_bool(
    value,
    *,
    field_name="is_verified",
    true_aliases=(),
    false_aliases=(),
):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "y", *true_aliases}:
        return True
    if normalized in {"false", "0", "no", "n", *false_aliases}:
        return False
    raise ValueError(f"invalid {field_name} '{value}'")
