from sqlmodel import SQLModel, Field
from typing import Optional


class ProductDosing(SQLModel, table=True):
    """A single species-specific dosing rule for a Product.

    A product can have several rows (one per applicable animal species). This is
    intentionally a separate table rather than fields on Product, because the same
    product needs a different rate per species (and some species aren't treated
    with it at all), and because a formulation sold in several pack sizes (e.g.
    "Maxitet-LA 100ml/250ml/500ml") shares one dosing rule across every pack-size
    row in Product.

    How a dose is worked out depends on "basis":
      - "per_kg":      dose_value is the amount (in dose_unit) per kg of animal
                        bodyweight. Total = dose_value * bodyweight_kg * animal_count.
      - "per_head":    dose_value is a fixed amount (in dose_unit) per animal,
                        regardless of weight. Total = dose_value * animal_count.
      - "per_quarter":  fixed amount per udder quarter (intramammary mastitis
                        tubes) - dose_value is normally 1, and total is
                        dose_value * 4 * animal_count (4 quarters per cow),
                        unless the user is treating fewer quarters.
      - "label_only":  no single number could be computed (dilution ratios,
                        ad-lib mineral licks, age-tiered schedules, or data that
                        simply wasn't verified). dose_value is null; label_text
                        and notes carry what's known so a person can dose by hand
                        and the app can still show it and let the amount be
                        entered manually.

    "confidence" tracks how sure we are of this rule:
      - "high"/"medium": sourced from the product's own Kyron label/data sheet.
      - "low": partially sourced but a number is missing or shaky - verify
                against the physical label before relying on it.
      - "unverified": a placeholder a user entered by hand from the box, not yet
                cross-checked against anything else.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    species: str = Field(index=True)  # "Cows", "Sheep", "Goats", "Horses", "Pigs" (matches Animal.species)

    basis: str = "label_only"  # "per_kg" | "per_head" | "per_quarter" | "label_only"
    dose_value: Optional[float] = None
    dose_unit: Optional[str] = None  # "ml", "g", "tube per quarter", "sachet", etc.
    cap_weight_kg: Optional[float] = None  # optional ceiling bodyweight for per_kg products sold as one fixed syringe

    route: Optional[str] = None  # e.g. "Intramuscular injection", "Oral dose (drench)"
    label_text: Optional[str] = None  # the actual label dosing instruction, verbatim/paraphrased
    withdrawal_meat_days: Optional[int] = None
    withdrawal_milk_days: Optional[int] = None
    active_ingredient: Optional[str] = None

    confidence: str = "unverified"  # "high" | "medium" | "low" | "unverified"
    source_url: Optional[str] = None
    notes: Optional[str] = None
