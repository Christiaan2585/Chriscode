"""The wording of what the app writes to clients (quote, invoice, payment reminder, statement, herding program,
treatment dates), in English and Afrikaans. The standard wording lives in the apps (desktop-app/frontend/src/utils/
clientSend.js, and app/core/statement_mail.py for the bulk statements); the business can override any subject or body
under Settings -> Messages to clients. Only the overrides are stored: a blank field means "use the standard wording".

Placeholders: {name} {number} {amount} {dueClause} {dates}."""
import json
import re
from typing import Optional

KINDS = ("quote", "invoice", "reminder", "statement", "program", "costs", "treatments")
LANGS = ("en", "af")
FIELDS = ("subject", "body")
MAX_SUBJECT = 200
MAX_BODY = 2000

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")  # everything except \t \n \r


def clean(raw) -> dict:
    """The overrides as they are stored; raises ValueError for anything unknown or too long."""
    if not isinstance(raw, dict):
        raise ValueError("Messages must be a set of languages")
    out: dict = {}
    for lang, kinds in raw.items():
        if lang not in LANGS:
            raise ValueError(f"Unknown language: {lang}")
        if not isinstance(kinds, dict):
            raise ValueError("Each language must list its messages")
        for kind, fields in kinds.items():
            if kind not in KINDS:
                raise ValueError(f"Unknown message: {kind}")
            if not isinstance(fields, dict):
                raise ValueError("Each message needs a subject and a body")
            kept = {}
            for field in FIELDS:
                value = fields.get(field)
                if value is None:
                    continue
                if not isinstance(value, str):
                    raise ValueError("Messages must be text")
                value = _CONTROL.sub("", value).strip()
                if field == "subject":
                    value = " ".join(value.split())  # one line: no header tricks
                    if len(value) > MAX_SUBJECT:
                        raise ValueError(f"A subject can be at most {MAX_SUBJECT} characters")
                elif len(value) > MAX_BODY:
                    raise ValueError(f"A message can be at most {MAX_BODY} characters")
                if value:
                    kept[field] = value
            if kept:
                out.setdefault(lang, {})[kind] = kept
    return out


def load(raw: Optional[str]) -> dict:
    """The stored overrides (empty when none, or if what is stored cannot be read)."""
    if not raw:
        return {}
    try:
        return clean(json.loads(raw))
    except (ValueError, TypeError):
        return {}


def dump(templates: dict) -> str:
    return json.dumps(templates, ensure_ascii=False, separators=(",", ":"))


def fill(text: str, values: dict) -> str:
    """Replaces {name}-style placeholders that are in `values`; anything else in braces is left alone. Empty brackets
    left by a missing value (e.g. a quote with no number) are removed."""
    for key, value in values.items():
        text = text.replace("{" + key + "}", str(value))
    text = re.sub(r"[ \t]*\(\s*\)", "", text)
    return re.sub(r"[ \t]{2,}", " ", text).strip()
