"""fininzen/fields.py — Reusable Django model fields backed by ``fininzen.crypto``.

- ``EncryptedTextField``: stores its value AES-256-GCM-encrypted at rest, fully
  transparent to the ORM (callers read/write plaintext).
- ``BlindIndexField``: a deterministic HMAC index over a sibling field's plaintext,
  auto-computed on every write, enabling exact-match lookups and uniqueness on an
  otherwise-unqueryable encrypted column.
"""

from __future__ import annotations

from django.db import models

from fininzen import crypto


class EncryptedTextField(models.TextField):
    """A ``TextField`` whose content is encrypted at rest.

    Reads decrypt transparently; legacy/dev plaintext (written before a key was
    configured) passes through unchanged, so enabling encryption later is
    non-breaking. With no key configured the field stores plaintext.

    NOTE: because the ciphertext is randomized (fresh nonce per write), these
    fields are *not* usable in ``WHERE``/``ORDER BY``/``UNIQUE`` — by design. Use a
    :class:`BlindIndexField` when exact-match lookups are needed.
    """

    description = "Text encrypted at rest (AES-256-GCM)"

    def from_db_value(self, value, expression, connection):
        if value is None:
            return None
        if not crypto.is_encryption_enabled():
            # No key configured (dev/test, or a maintenance command run without
            # the key): nothing we could decrypt anyway. Return the stored value
            # verbatim so legacy plaintext — including user text that merely
            # starts with the "fenc:" prefix — never raises on read.
            return value
        return crypto.decrypt(value)

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == "":
            return value  # nothing to protect in an empty value
        if not crypto.is_encryption_enabled():
            return value  # dev/test passthrough
        if crypto.is_valid_envelope(value):
            return value  # genuine, decryptable envelope: idempotent re-save
        # Plaintext — or user text that merely *looks* like an envelope
        # (starts with "fenc:") — must be encrypted, never stored verbatim, or
        # decrypt() would later reject it and make the row unreadable.
        return crypto.encrypt(value)


class BlindIndexField(models.CharField):
    """Deterministic HMAC index over ``source_field``'s plaintext.

    Recomputed on every save — including ``bulk_create``/``bulk_update`` — via
    :meth:`pre_save`, so it stays consistent with the encrypted source without any
    manual bookkeeping. Not editable (kept out of forms/serializers).
    """

    description = (
        "Deterministic blind index for exact-match lookups on an encrypted field"
    )

    def __init__(self, *args, source_field: str | None = None, **kwargs):
        self.source_field = source_field
        kwargs.setdefault("max_length", 64)  # sha256 hex digest
        kwargs.setdefault("editable", False)
        # Always recomputed in pre_save; the default just lets the column be added
        # to existing rows non-interactively (a data migration backfills real values).
        kwargs.setdefault("default", "")
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        kwargs["source_field"] = self.source_field
        return name, path, args, kwargs

    def pre_save(self, model_instance, add):
        source_value = getattr(model_instance, self.source_field)
        value = crypto.blind_index(source_value or "")
        setattr(model_instance, self.attname, value)
        return value
