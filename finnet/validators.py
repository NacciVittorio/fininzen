import re
from django.core.exceptions import ValidationError


class StrongPasswordValidator:
    def validate(self, password, user=None):
        errors = []
        if len(password) > 30:
            errors.append("Non può superare 30 caratteri.")
        if not re.search(r"[A-Z]", password):
            errors.append("Deve contenere almeno una lettera maiuscola.")
        if not re.search(r"\d", password):
            errors.append("Deve contenere almeno un numero.")
        if not re.search(r"[^A-Za-z0-9]", password):
            errors.append("Deve contenere almeno un carattere speciale.")
        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return (
            "Minimo 10 caratteri, almeno 1 maiuscola, 1 numero, 1 carattere speciale."
        )
