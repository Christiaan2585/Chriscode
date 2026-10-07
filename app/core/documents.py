"""Money and numbering rules shared by invoices, quotes and purchase orders."""
import re
from decimal import ROUND_HALF_UP, Decimal

_CENT = Decimal("0.01")
NUMBER_DIGITS = 7  # INV0000180 - same width as Sage Business Cloud Accounting


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)


def price_pair(product, vat_rate=15.0) -> tuple:
    """(selling price excl VAT, incl VAT) for a catalogue. The excl price is the
    one stored on the product, or worked out from the incl price at `vat_rate`."""
    incl = _money(product.price or 0)
    if product.price_excl_vat is not None:
        excl = _money(product.price_excl_vat)
    else:
        excl = _money(incl / (1 + Decimal(str(vat_rate or 0)) / 100))
    return float(excl), float(incl)


def line_amounts(quantity, unit_price, discount_percent=0, vat_percent=0) -> dict:
    """Discount comes off first, VAT is charged on what's left. The net line
    total is rounded to cents (as printed); the discount is what it took off."""
    gross = _money(Decimal(str(quantity)) * Decimal(str(unit_price)))
    exclusive = _money(gross * (100 - Decimal(str(discount_percent or 0))) / 100)
    discount = gross - exclusive
    vat = _money(exclusive * Decimal(str(vat_percent or 0)) / 100)
    return {
        "gross": float(gross),
        "discount": float(discount),
        "exclusive": float(exclusive),
        "vat": float(vat),
        "inclusive": float(exclusive + vat),
    }


def document_totals(lines) -> dict:
    """`lines` are line_amounts() results."""
    def total(key):
        return float(sum((_money(line[key]) for line in lines), Decimal("0")))

    return {
        "total_discount": total("discount"),
        "total_exclusive": total("exclusive"),
        "total_vat": total("vat"),
        "grand_total": total("inclusive"),
    }


def format_number(prefix: str, n: int) -> str:
    return f"{prefix}{n:0{NUMBER_DIGITS}d}"


def next_number(existing, prefix: str, start_from=None) -> str:
    """One past the highest number already used with this prefix, or
    `start_from` if that's higher (e.g. carrying on from Sage's numbering)."""
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    used = [int(m.group(1)) for m in (pattern.match(n or "") for n in existing) if m]
    return format_number(prefix, max([*used, (start_from or 1) - 1]) + 1)
