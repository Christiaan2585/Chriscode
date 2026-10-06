from sqlmodel import SQLModel, Field
from typing import Optional, List
from datetime import datetime

class ProgramAssignment(SQLModel, table=True):
    # Legacy: links an individually-registered Animal to a program. Kept so
    # the old standalone (no-longer-in-nav) Herding Programs page still
    # works, but new programs use AnimalGroup below instead - a headcount
    # by type, not a link to specific Animal rows.
    animal_id: int = Field(foreign_key="animal.id", primary_key=True)
    program_id: int = Field(foreign_key="herdingprogram.id", primary_key=True)
    assigned_at: datetime = Field(default_factory=datetime.utcnow)

class AnimalGroup(SQLModel, table=True):
    """A headcount-based group within a herding program, e.g. "12 Goats" -
    defined by animal type + group size rather than a link to individually
    registered Animal records."""
    id: Optional[int] = Field(default=None, primary_key=True)
    program_id: int = Field(foreign_key="herdingprogram.id")
    animal_type: str
    group_size: int

class HerdingProgram(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    goal: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    description: Optional[str] = None
    # Programs are now created directly from a client's page and scoped to
    # that client. Optional (nullable) so the auto column-sync in db.py can
    # add it to the existing table, and so any pre-existing rows from
    # before this field existed still load fine.
    client_id: Optional[int] = Field(default=None, foreign_key="client.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # The client's run of the master program (ProgramTemplate): every step's
    # date is worked out from the first mating date. NULL on programs from
    # before 2026-09-29, which just show their headcounts as before. The other
    # four fall back to the template's defaults when NULL.
    mating_date: Optional[datetime] = None
    mating_weeks: Optional[int] = None
    weaning_rule: Optional[str] = None  # "age" (lambing + weaning_months) or "fixed" (mating + weaning_days)
    weaning_months: Optional[int] = None
    weaning_days: Optional[int] = None


class ProgramTemplate(SQLModel, table=True):
    """The one master herding program (id 1) every client's program follows -
    imported from the business's own Excel sheet, then edited in the app.
    Not in the code: the repo is public and the programme is the business's."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = "Herding program"
    gestation_days: int = 147  # lambing starts this long after the first mating day
    mating_weeks: int = 6
    weaning_rule: str = "fixed"
    weaning_months: int = 4
    weaning_days: int = 240
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProgramStep(SQLModel, table=True):
    """One step of a herding program: when (a number of days from one of
    app/core/herding.py's ANCHORS, or "none" for the undated medicine box)
    and what to do. `program_id` NULL = the master program; set = that
    client's own copy (made from the master, then changed freely)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    sort_order: int = 0
    anchor: str = "mating_start"
    offset_days: int = 0
    stage: Optional[str] = None
    management: Optional[str] = None
    vaccinations: Optional[str] = None
    dosing: Optional[str] = None
    vitamins: Optional[str] = None
    feeding: Optional[str] = None
    # 2026-09-30: every client gets their own copy of the program.
    program_id: Optional[int] = Field(default=None, foreign_key="herdingprogram.id", index=True)
    source_step_id: Optional[int] = None  # a copy's master step
    date_override: Optional[datetime] = None  # a date typed in for this client
    done_at: Optional[datetime] = None  # a copy ticked off
    origin: Optional[str] = None  # "kudde" / "cost" - which sheet made a master step


class ProgramStepProduct(SQLModel, table=True):
    """A product used at a step: `dose` per animal (in the product's own unit,
    e.g. ml) for the animals of `animal_group` - one or more group names,
    comma-separated ("Ooie, Ramme"), matched to a program's
    AnimalGroup.animal_type; blank = every animal. `fixed_quantity` instead
    means that many packs whatever the headcount (the medicine box)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    step_id: int = Field(foreign_key="programstep.id", index=True)
    product_id: int = Field(foreign_key="product.id")
    animal_group: Optional[str] = None
    dose: Optional[float] = None
    note: Optional[str] = None
    category: Optional[str] = None  # Enting, Dosering, Minerale, ... (the cost sheet's second column)
    fixed_quantity: Optional[float] = None
    source_line_id: Optional[int] = None  # a copy's master line
    origin: Optional[str] = None


class ProgramStepProgress(SQLModel, table=True):
    """A step ticked off on one client's program."""
    program_id: int = Field(foreign_key="herdingprogram.id", primary_key=True)
    step_id: int = Field(foreign_key="programstep.id", primary_key=True)
    done_at: datetime = Field(default_factory=datetime.utcnow)
