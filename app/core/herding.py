"""The master herding program: working out each step's date for a client's
program, the product amounts from its headcounts, and importing the
business's Excel sheet (where every date is a formula off the first mating
day) as the template."""
import ast
import calendar
import io
import math
import re
from datetime import date, datetime, timedelta

from openpyxl import load_workbook
from sqlmodel import Session, select

from app.models.business import BusinessSettings
from app.models.product import Product
from app.models.program import (AnimalGroup, HerdingProgram, ProgramStep, ProgramStepProduct,
                                ProgramStepProgress, ProgramTemplate)

ANCHORS = ("mating_start", "mating_end", "lambing_start", "lambing_end", "weaning")
UNDATED = "none"  # a step with no date - the medicine box
TEXT_FIELDS = ("stage", "management", "vaccinations", "dosing", "vitamins", "feeding")
DUE_WITHIN_DAYS = 7
# The business's cost sheet counts animals in these five groups; a product
# line names one or more of them ("Ooie, Ramme").
GROUPS = ("Ooie", "Ramme", "Lammers", "Jong ooitjies", "Jong rammetjies")


def get_template(session: Session) -> ProgramTemplate:
    template = session.get(ProgramTemplate, 1)
    if template is None:
        template = ProgramTemplate(id=1)
        session.add(template)
        session.commit()
        session.refresh(template)
    return template


def add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def anchor_dates(program: HerdingProgram, template: ProgramTemplate) -> dict:
    mating = program.mating_date.date() if isinstance(program.mating_date, datetime) else program.mating_date
    season = timedelta(weeks=program.mating_weeks or template.mating_weeks)
    lambing = mating + timedelta(days=template.gestation_days)
    if (program.weaning_rule or template.weaning_rule) == "age":
        weaning = add_months(lambing, program.weaning_months or template.weaning_months)
    else:
        weaning = mating + timedelta(days=program.weaning_days or template.weaning_days)
    return {"mating_start": mating, "mating_end": mating + season, "lambing_start": lambing,
            "lambing_end": lambing + season, "weaning": weaning}


def group_names(animal_group) -> list:
    """"Ooie, Ramme" or "Jong ooitjies + Jong rammetjies" -> the names."""
    return [n.strip().lower() for n in re.split(r"[,+&]", animal_group or "") if n.strip()]


def headcount(groups, animal_group) -> int:
    wanted = group_names(animal_group)
    return sum(g.group_size for g in groups if not wanted or g.animal_type.strip().lower() in wanted)


def price_excl_vat(product: Product, settings: BusinessSettings) -> float:
    """The product's price before VAT - what the cost sheet works in."""
    if product.price_excl_vat:
        return product.price_excl_vat
    if settings.vat_registered and settings.vat_rate:
        return round(product.price / (1 + settings.vat_rate / 100), 2)
    return product.price


def line_costs(product: Product, dose, head, fixed_quantity, price) -> dict:
    """Like the cost sheet: `used` = packs actually used (7.92 bottles) and
    its cost; `buy` = whole packs (8) and their cost. The medicine box is a
    fixed number of packs whatever the headcount. Without a pack size one
    dose is one unit sold."""
    if fixed_quantity:
        total, exact = None, fixed_quantity
    else:
        total = round((dose or 0) * (head or 0), 3)
        exact = total / product.pack_size if product.pack_size else total
    buy = math.ceil(exact - 1e-9) if exact > 0 else 0
    return {"total": total, "used": round(exact, 2), "buy": buy,
            "cost_used": round(exact * price, 2), "cost_buy": round(buy * price, 2)}


def ordered_steps(session: Session, program_id: int | None = None) -> list:
    """The master program's steps, or (with program_id) that client's copy."""
    owner = ProgramStep.program_id.is_(None) if program_id is None else ProgramStep.program_id == program_id
    return session.exec(select(ProgramStep).where(owner).order_by(ProgramStep.sort_order, ProgramStep.id)).all()


_COPIED_STEP_FIELDS = ("sort_order", "anchor", "offset_days", *TEXT_FIELDS)
_COPIED_LINE_FIELDS = ("product_id", "animal_group", "dose", "note", "category", "fixed_quantity")


def copy_master_into(session: Session, program: HerdingProgram, done: dict | None = None) -> None:
    """Gives the client their own copy of the master program. `done` maps a
    master step id to when that step was ticked off, to carry ticks over."""
    done = done or {}
    masters = ordered_steps(session)
    lines = {}
    for line in session.exec(select(ProgramStepProduct).where(
            ProgramStepProduct.step_id.in_([s.id for s in masters]))).all() if masters else []:
        lines.setdefault(line.step_id, []).append(line)
    for master in masters:
        step = ProgramStep(program_id=program.id, source_step_id=master.id, done_at=done.get(master.id),
                           **{f: getattr(master, f) for f in _COPIED_STEP_FIELDS})
        session.add(step)
        session.flush()
        for line in sorted(lines.get(master.id, []), key=lambda l: l.id):
            session.add(ProgramStepProduct(step_id=step.id, source_line_id=line.id,
                                           **{f: getattr(line, f) for f in _COPIED_LINE_FIELDS}))


def ensure_client_copy(session: Session, program: HerdingProgram) -> None:
    """A client's program gets its copy the first time it's used; ticks made
    on the old shared master (before copies existed) come along."""
    if program.mating_date is None or ordered_steps(session, program.id):
        return
    legacy = session.exec(select(ProgramStepProgress).where(ProgramStepProgress.program_id == program.id)).all()
    copy_master_into(session, program, {p.step_id: p.done_at for p in legacy})
    for row in legacy:
        session.delete(row)
    session.commit()


def own_step(session: Session, program: HerdingProgram, step_id: int):
    """The client's step by its id - or by the master step it was copied
    from (links made before every client had a copy)."""
    step = session.get(ProgramStep, step_id)
    if step is not None and step.program_id == program.id:
        return step
    return session.exec(select(ProgramStep).where(ProgramStep.program_id == program.id,
                                                  ProgramStep.source_step_id == step_id)).first()


def own_line(session: Session, program: HerdingProgram, line_id: int):
    line = session.get(ProgramStepProduct, line_id)
    if line is not None:
        step = session.get(ProgramStep, line.step_id)
        if step is not None and step.program_id == program.id:
            return line
    return session.exec(select(ProgramStepProduct).join(ProgramStep, ProgramStep.id == ProgramStepProduct.step_id)
                        .where(ProgramStep.program_id == program.id,
                               ProgramStepProduct.source_line_id == line_id)).first()


def step_products(session: Session, step_ids) -> dict:
    """{step_id: [(ProgramStepProduct, Product), ...]}"""
    out = {}
    if not step_ids:
        return out
    rows = session.exec(select(ProgramStepProduct, Product)
                        .where(ProgramStepProduct.step_id.in_(step_ids))
                        .where(ProgramStepProduct.product_id == Product.id)
                        .order_by(ProgramStepProduct.id)).all()
    for line, product in rows:
        out.setdefault(line.step_id, []).append((line, product))
    return out


def _status(day: date, done: bool, today: date) -> str:
    if done:
        return "done"
    if day < today:
        return "overdue"
    return "due" if day <= today + timedelta(days=DUE_WITHIN_DAYS) else "upcoming"


def step_date(step: ProgramStep, anchors: dict):
    if step.date_override is not None:
        return step.date_override.date() if isinstance(step.date_override, datetime) else step.date_override
    if step.anchor == UNDATED:
        return None
    return anchors.get(step.anchor, anchors["mating_start"]) + timedelta(days=step.offset_days)


def schedule(session: Session, program: HerdingProgram, today: date | None = None) -> dict:
    """The client's own program: every step with its date and whether it's
    done/overdue/due/upcoming, each product line's amounts and costs for
    their animals (like the cost sheet), step subtotals and the totals."""
    empty = {"anchors": None, "steps": [], "progress": {"done": 0, "total": 0},
             "totals": {"cost_used": 0, "cost_buy": 0, "animals": 0, "per_animal": 0}}
    if program.mating_date is None:
        return empty
    ensure_client_copy(session, program)
    today = today or date.today()
    template = get_template(session)
    settings = session.get(BusinessSettings, 1) or BusinessSettings()
    anchors = anchor_dates(program, template)
    groups = session.exec(select(AnimalGroup).where(AnimalGroup.program_id == program.id)).all()
    steps = ordered_steps(session, program.id)
    products = step_products(session, [s.id for s in steps])
    out = []
    for step in steps:
        day = step_date(step, anchors)
        lines = []
        for line, product in products.get(step.id, []):
            head = headcount(groups, line.animal_group)
            price = price_excl_vat(product, settings)
            costs = line_costs(product, line.dose, head, line.fixed_quantity, price)
            lines.append({**line.model_dump(), "product_name": product.name, "unit": product.unit,
                          "pack_size": product.pack_size, "price": product.price, "price_excl_vat": price,
                          "head": head, **costs})
        status = "none" if day is None else _status(day, step.done_at is not None, today)
        out.append({**step.model_dump(), "date": day, "status": status, "products": lines,
                    "subtotal": round(sum(l["cost_used"] for l in lines), 2),
                    "subtotal_buy": round(sum(l["cost_buy"] for l in lines), 2)})
    # Dated steps in date order (a client's own dates can reorder them), then the medicine box.
    out.sort(key=lambda s: (s["date"] is None, s["date"] or date.max, s["sort_order"]))
    dated = [s for s in out if s["date"] is not None]
    animals = sum(g.group_size for g in groups)
    cost_used = round(sum(s["subtotal"] for s in out), 2)
    return {"anchors": anchors, "steps": out,
            "progress": {"done": sum(1 for s in dated if s["status"] == "done"), "total": len(dated)},
            "totals": {"cost_used": cost_used, "cost_buy": round(sum(s["subtotal_buy"] for s in out), 2),
                       "animals": animals, "per_animal": round(cost_used / animals, 2) if animals else 0,
                       "vat_rate": settings.vat_rate if settings.vat_registered else 0}}


# --- Importing the business's Excel sheet as the template ---

class TemplateImportError(ValueError):
    pass


_COLUMNS = {  # template field -> words its header starts with (Afrikaans and English)
    "date": ("datum", "date"),
    "stage": ("produksie", "stadium", "stage"),
    "management": ("kudde", "bestuur", "management", "herd"),
    "vaccinations": ("inenting", "ent", "vaccin"),
    "dosing": ("dosering", "doseer", "dosing", "dose"),
    "vitamins": ("vitamien", "vitamin", "spoor", "mineral"),
    "feeding": ("voeding", "feed"),
}
_CELL = re.compile(r"\$?([A-Z]{1,3})\$?(\d+)")
_WEANING_WORDS = ("speen", "wean")


def _text(value) -> str | None:
    """Tidies a cell: the sheet starts new lines in a cell with runs of
    spaces ("1  Rams in      2  Ewes out") - those become line breaks."""
    if value is None:
        return None
    text = str(value).replace("\r", "")
    text = re.sub(r"[ \t]{2,}(?=\d{1,2}[.,]?\s)|[ \t]{4,}", "\n", text)
    text = "\n".join(re.sub(r"\s+", " ", line).strip() for line in text.split("\n"))
    return text.strip() or None


def _find_inputs(ws):
    """(mating date cell, season weeks cell, weaning months cell) from the
    labelled input rows above the table."""
    found = {}
    for row in ws.iter_rows(min_row=1, max_row=15):
        label = " ".join(str(c.value) for c in row if isinstance(c.value, str)).lower()
        values = [c for c in row if c.value is not None and not isinstance(c.value, str)]
        if not values:
            continue
        cell = values[-1]
        if "paardatum" in label or "mating date" in label:
            found.setdefault("mating", cell)
        elif "paarseisoen" in label or "mating season" in label:
            found.setdefault("weeks", cell)
        elif "gespeen" in label or "wean" in label:
            found.setdefault("weaning", cell)
    if not isinstance(found.get("mating") and found["mating"].value, (datetime, date)):
        raise TemplateImportError("Couldn't find the first mating date (a row labelled 'Eerste paardatum' with a date)")
    return found


def _find_header(ws):
    for row in ws.iter_rows(min_row=1, max_row=30):
        cols = {}
        for cell in row:
            if isinstance(cell.value, str):
                head = cell.value.strip().lower()
                for field, words in _COLUMNS.items():
                    if field not in cols and head.startswith(words):
                        cols[field] = cell.column_letter
        if "date" in cols and len(cols) >= 3:
            return row[0].row, cols
    raise TemplateImportError("Couldn't find the table's header row (Datum, Produksie Stadium, Kudde-Bestuur, ...)")


def _linear_value(formula, row, rows, refs, env, seen=()):
    """The formula's value as days, with M = first mating day and W = season weeks."""
    if row in seen:
        raise TemplateImportError(f"Row {row}'s date refers back to itself")

    def replace(match):
        coord = f"{match.group(1)}{match.group(2)}"
        if coord in refs:
            return refs[coord]
        if match.group(1) == rows["_date_col"] and int(match.group(2)) in rows:
            return f"R{match.group(2)}"
        raise TemplateImportError(f"Row {row}'s date uses cell {coord}, which isn't the mating date, season or another date")

    expr = _CELL.sub(replace, formula.lstrip("=").replace("$", ""))

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            return ev(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult)):
            a, b = ev(node.left), ev(node.right)
            return a + b if isinstance(node.op, ast.Add) else a - b if isinstance(node.op, ast.Sub) else a * b
        if isinstance(node, ast.Name):
            if node.id in env:
                return env[node.id]
            if node.id.startswith("R"):
                other = int(node.id[1:])
                return _linear_value(rows[other]["formula"], other, rows, refs, env, seen + (row,))
        raise TemplateImportError(f"Row {row}'s date formula ({formula}) is more than simple adding and subtracting")

    try:
        return ev(ast.parse(expr, mode="eval"))
    except SyntaxError:
        raise TemplateImportError(f"Couldn't read row {row}'s date formula ({formula})")


def _date_rules(rows, refs):
    """(anchor, offset_days) per row, plus the gestation and weaning days the
    sheet implies. A row is timed from lambing if it is (or refers to) the
    row that's mating + ~5 months, from weaning if it is (or refers to) the
    row whose text mentions weaning, else from mating; adding the season
    length moves it to the end of mating/lambing."""
    kinds, rules, constants = {}, {}, {}

    def kind(row):
        if row in kinds:
            return kinds[row]
        info = rows[row]
        referenced = [int(n) for n in re.findall(r"R(\d+)", _CELL.sub(
            lambda m: f"R{m.group(2)}" if m.group(1) == rows["_date_col"] else "", info["formula"].replace("$", "")))]
        base = info["values"]
        if any(w in (info["words"] or "") for w in _WEANING_WORDS) and not any(kind(r) == "weaning" for r in referenced):
            result = "weaning"
            constants.setdefault("weaning_days", base[0])
        elif referenced:
            result = kind(referenced[0])
        elif base[1] == 0 and 100 <= base[0] <= 200:
            result = "lambing"
            constants.setdefault("gestation_days", base[0])
        else:
            result = "mating"
        kinds[row] = result
        return result

    for row in (r for r in rows if isinstance(r, int)):
        kind(row)
    for row in (r for r in rows if isinstance(r, int)):
        days, season = rows[row]["values"]
        if season not in (0, 7):
            raise TemplateImportError(f"Row {row}'s date adds the season length in a way this app can't follow")
        k = kinds[row]
        if k == "mating":
            rules[row] = ("mating_end" if season else "mating_start", days)
        elif k == "lambing":
            rules[row] = ("lambing_end" if season else "lambing_start", days - constants["gestation_days"])
        else:
            if season:
                raise TemplateImportError(f"Row {row}'s date adds the mating season to the weaning day")
            rules[row] = ("weaning", days - constants["weaning_days"])
    return rules, constants


def parse_template_workbook(data: bytes) -> dict:
    try:
        wb = load_workbook(io.BytesIO(data))
    except Exception as exc:
        raise TemplateImportError("That file isn't an Excel workbook (.xlsx) this app can read") from exc
    ws = wb.worksheets[0]
    inputs = _find_inputs(ws)
    header_row, cols = _find_header(ws)
    refs = {inputs["mating"].coordinate: "M"}
    if "weeks" in inputs:
        refs[inputs["weeks"].coordinate] = "W"

    rows, name, current = {"_date_col": cols["date"]}, None, None
    for r in range(header_row + 1, ws.max_row + 1):
        first = ws[f"{cols['date']}{r}"].value
        texts = {f: ws[f"{c}{r}"].value for f, c in cols.items() if f != "date"}
        if isinstance(first, str) and first.startswith("="):
            current = r
            rows[r] = {"formula": first, "texts": {f: [] for f in TEXT_FIELDS}}
        elif isinstance(first, str) and first.strip() and not any(texts.values()):
            name = name or _text(first)  # a section heading such as "EERSTE LAMSEISOEN"
            continue
        if current is None:
            continue
        for field, value in texts.items():
            if _text(value):
                rows[current]["texts"][field].append(_text(value))
    steps = [r for r in rows if isinstance(r, int)]
    if not steps:
        raise TemplateImportError("Couldn't find any dates worked out from the mating date under the header row")
    for r in steps:
        rows[r]["words"] = " ".join(t for ts in rows[r]["texts"].values() for t in ts).lower()
        base = _linear_value(rows[r]["formula"], r, rows, refs, {"M": 0, "W": 0})
        with_season = _linear_value(rows[r]["formula"], r, rows, refs, {"M": 0, "W": 1})
        if _linear_value(rows[r]["formula"], r, rows, refs, {"M": 1000, "W": 0}) - base != 1000:
            raise TemplateImportError(f"Row {r}'s date isn't the mating date plus or minus some days")
        rows[r]["values"] = (int(round(base)), int(round(with_season - base)))
    rules, constants = _date_rules(rows, refs)

    def number(key, low, high):
        cell = inputs.get(key)
        value = cell.value if cell is not None else None
        return int(value) if isinstance(value, (int, float)) and low <= value <= high else None

    generic_title = re.fullmatch(r"(sheet|blad)\s*\d*", ws.title.strip(), re.I)
    return {
        "name": (name if generic_title else _text(ws.title)) or name,
        "settings": {k: v for k, v in {
            "mating_weeks": number("weeks", 1, 52), "weaning_months": number("weaning", 1, 12),
            "gestation_days": constants.get("gestation_days"), "weaning_days": constants.get("weaning_days"),
        }.items() if v is not None},
        "steps": [{"anchor": rules[r][0], "offset_days": rules[r][1],
                   **{f: "\n".join(rows[r]["texts"][f]) or None for f in TEXT_FIELDS}} for r in steps],
    }


def import_template(session: Session, data: bytes) -> dict:
    """Replaces the master program with the sheet's. A step with the same
    date rule as an existing one keeps its id - and so its products and
    every client's tick against it; steps no longer in the sheet go."""
    parsed = parse_template_workbook(data)
    template = get_template(session)
    template.name = (parsed["name"] or template.name)[:200]
    for key, value in parsed["settings"].items():
        setattr(template, key, value)
    if "weaning_days" in parsed["settings"]:
        template.weaning_rule = "fixed"  # the sheet's own rule; each program can switch to by-age
    template.updated_at = datetime.utcnow()
    session.add(template)

    existing = {}
    for step in ordered_steps(session):
        existing.setdefault((step.anchor, step.offset_days), []).append(step)
    created = updated = 0
    for order, spec in enumerate(parsed["steps"], start=1):
        matches = existing.get((spec["anchor"], spec["offset_days"]))
        step = matches.pop(0) if matches else None
        if step is None:
            step, created = ProgramStep(), created + 1
        else:
            updated += 1
        step.sort_order = order
        step.origin = "kudde"  # this sheet's now, even if the cost sheet made it
        for key, value in spec.items():
            setattr(step, key, value)
        session.add(step)
    # Steps only the cost sheet made (see import_cost_sheet) aren't this sheet's to remove.
    leftover = [s for ss in existing.values() for s in ss if s.origin != "cost"]
    for step in leftover:
        delete_step(session, step)
    session.commit()
    return {"created": created, "updated": updated, "removed": len(leftover), "name": template.name}


def delete_step(session: Session, step: ProgramStep) -> None:
    for model in (ProgramStepProduct, ProgramStepProgress):
        for row in session.exec(select(model).where(model.step_id == step.id)).all():
            session.delete(row)
    session.delete(step)


# --- Importing the business's cost sheet ("Ent en doseer kostes") ---
#
# One sheet: the headcount rows (TOTAAL OOIE / RAMME / LAMMERS / JONG
# OOITJIES / JONG RAMMETJIES), DEKTYD (the first mating day) and LAMTYD
# (= DEKTYD + gestation), then blocks of product lines, each block dated by
# a formula off DEKTYD or LAMTYD in column A. A line's "PRODUK TOTAAL"
# formula names the headcount cells it multiplies - which says which
# groups it's for - or just repeats the quantity (the medicine box).

def _tidy(text) -> str | None:
    """"(VOOR DEK ENTING)" -> "Voor dek enting"; mixed-case text is kept."""
    if not isinstance(text, str):
        return None
    text = re.sub(r"\s+", " ", text).strip().strip("!:").strip()
    if text.startswith("(") and text.endswith(")"):
        text = text[1:-1].strip()
    text = text.strip("!:").strip()
    if not text:
        return None
    return text[0].upper() + text[1:].lower() if text.upper() == text else text


def _group_label(text) -> str | None:
    t = (text or "").lower()
    if "jong" in t and "ooi" in t:
        return "Jong ooitjies"
    if "jong" in t and "ram" in t:
        return "Jong rammetjies"
    if "ooi" in t:
        return "Ooie"
    if "ram" in t:
        return "Ramme"
    if "lam" in t:
        return "Lammers"
    return None


def _name_key(name) -> str:
    return re.sub(r"[^a-z0-9%]", "", str(name or "").lower())


def parse_cost_sheet(data: bytes, products) -> dict:
    """Blocks of product lines with their date rule, groups and doses.
    `products` are the app's products, matched by name (ignoring spaces
    and punctuation); unmatched names are listed, not guessed."""
    try:
        ws = load_workbook(io.BytesIO(data)).worksheets[0]
    except Exception as exc:
        raise TemplateImportError("That file isn't an Excel workbook (.xlsx) this app can read") from exc
    cell = lambda col, row: ws[f"{col}{row}"].value
    group_rows, mating_row, header_row = {}, None, None
    for r in range(1, min(ws.max_row, 40) + 1):
        a, b = cell("A", r), cell("B", r)
        if (header_row is None and isinstance(a, (int, float)) and not isinstance(a, bool)
                and isinstance(b, str) and _group_label(b)):
            group_rows[r] = _group_label(b)
        texts = " ".join(str(cell(c, r)).lower() for c in "ABCDEFGH" if isinstance(cell(c, r), str))
        if header_row is None and "produk" in texts and "doser" in texts:
            header_row = r
        if mating_row is None and isinstance(a, (datetime, date)) and isinstance(b, str) and "dek" in b.lower():
            mating_row = r
    if mating_row is None or header_row is None or not group_rows:
        raise TemplateImportError("That doesn't look like the cost sheet (it needs the headcount rows, the "
                                  "PRODUK / DOSERING header and DEKTYD with the first mating date)")

    formulas = {r: cell("A", r) for r in range(1, ws.max_row + 1)
                if isinstance(cell("A", r), str) and cell("A", r).startswith("=")}
    lambing_row = next((r for r, f in formulas.items() if re.fullmatch(rf"=\+?\$?A\$?{mating_row}\+(\d+)", f.replace(" ", ""))
                        and "lam" in str(cell("B", r) or "").lower()), None)
    gestation = int(re.search(r"\+(\d+)$", formulas[lambing_row].replace(" ", "")).group(1)) if lambing_row else 147

    def days(row, seen=()):
        """(days after the first mating day, whether it's counted from lambing)"""
        if row == mating_row:
            return 0, False
        if row in seen or row not in formulas:
            raise TemplateImportError(f"Couldn't work out the date in row {row}")
        refs = {}

        def swap(m):
            refs[f"R{m.group(1)}"] = int(m.group(1))
            return f"R{m.group(1)}"
        expr = re.sub(r"\$?A\$?(\d+)", swap, formulas[row].lstrip("=").replace("$", ""))
        values = {name: days(ref, seen + (row,)) for name, ref in refs.items()}
        via_lambing = row == lambing_row or any(v[1] for v in values.values())

        def ev(node):
            if isinstance(node, ast.Expression):
                return ev(node.body)
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                return node.value
            if isinstance(node, ast.Name) and node.id in values:
                return values[node.id][0]
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
                return ev(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
            if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult)):
                a, b = ev(node.left), ev(node.right)
                return a + b if isinstance(node.op, ast.Add) else a - b if isinstance(node.op, ast.Sub) else a * b
            raise TemplateImportError(f"Row {row}'s date formula is more than adding and subtracting days")
        try:
            return int(round(ev(ast.parse(expr, mode="eval")))), via_lambing
        except SyntaxError:
            raise TemplateImportError(f"Couldn't read row {row}'s date formula")

    by_name = {_name_key(p.name): p for p in products}
    blocks, block, unmatched = [], None, []

    def open_block(anchor, offset, title):
        nonlocal block
        block = next((b for b in blocks if (b["anchor"], b["offset_days"]) == (anchor, offset)), None)
        if block is None:
            block = {"anchor": anchor, "offset_days": offset, "stage": title, "notes": [], "lines": []}
            blocks.append(block)
        elif title and not block["stage"]:
            block["stage"] = title
        elif title and title != block["stage"] and title not in block["notes"]:
            block["notes"].append(title)  # a second heading on the same day ("6-maande voor dek")

    for r in range(header_row + 1, ws.max_row + 1):
        if r in (mating_row, lambing_row):
            continue
        a, b, c, f, g = (cell(col, r) for col in "ABCFG")
        product_name = c.strip() if isinstance(c, str) and c.strip() else None
        label = str(b or "").strip().lower()
        if label.startswith("totaal") or label.startswith("totale"):
            continue
        if r in formulas:
            d, via_lambing = days(r)
            anchor, offset = ("lambing_start", d - gestation) if via_lambing else ("mating_start", d)
            open_block(anchor, offset, None if product_name else _tidy(b))
            if product_name and not block["stage"]:
                block["stage"] = _tidy(b)  # the date sits on the first product row
        elif "medisyne" in label and not product_name:
            open_block(UNDATED, 0, "Medisyne boks")
            continue
        if block is None:
            continue
        if isinstance(a, str) and not a.startswith("=") and not a.lower().startswith("verander"):
            note = _tidy(a)
            if note and note not in block["notes"]:
                block["notes"].append(note)
        if product_name is None:
            if isinstance(a, (datetime, date)) and _tidy(b) and _tidy(b) not in block["notes"]:
                block["notes"].append(_tidy(b))  # "Behandel jong ooitjies saam met ooie voor lam"
            continue
        product = by_name.get(_name_key(product_name))
        if product is None:
            if product_name not in unmatched:
                unmatched.append(product_name)
            continue
        refs = [int(n) for n in re.findall(r"\$?A\$?(\d+)", str(g or ""))]
        groups = list(dict.fromkeys(group_rows[n] for n in refs if n in group_rows))
        amount = f if isinstance(f, (int, float)) and not isinstance(f, bool) else None
        fixed = not groups and (block["anchor"] == UNDATED or (isinstance(g, str) and "F" in g.upper()))
        block["lines"].append({"product_id": product.id, "category": _tidy(b),
                               "animal_group": ", ".join(groups) or None,
                               "dose": None if fixed else amount, "fixed_quantity": amount if fixed else None})
    if not any(b["lines"] for b in blocks):
        raise TemplateImportError("Found no product lines with products this app knows - check the product names")
    return {"blocks": blocks, "unmatched": unmatched, "gestation": gestation}


def import_cost_sheet(session: Session, data: bytes) -> dict:
    """Puts the cost sheet's product lines into the master program. A line
    goes onto the master step with the same date rule (so a Kudde program
    step and the cost sheet's treatments on that day are one step); a date
    only the cost sheet has becomes its own step. Re-importing replaces
    the cost sheet's lines instead of adding them twice. Clients' own
    copies aren't touched - "Start again from the master" brings it in."""
    parsed = parse_cost_sheet(data, session.exec(select(Product)).all())
    for line in session.exec(select(ProgramStepProduct).join(ProgramStep, ProgramStep.id == ProgramStepProduct.step_id)
                             .where(ProgramStep.program_id.is_(None), ProgramStepProduct.origin == "cost")).all():
        session.delete(line)
    session.flush()
    steps = ordered_steps(session)
    by_rule = {}
    for step in steps:
        by_rule.setdefault((step.anchor, step.offset_days), step)
    next_order = max((s.sort_order for s in steps), default=0) + 1
    created = lines = 0
    touched = set()
    for block in parsed["blocks"]:
        if not block["lines"] and not block["stage"]:
            continue
        step = by_rule.get((block["anchor"], block["offset_days"]))
        if step is None:
            step = ProgramStep(anchor=block["anchor"], offset_days=block["offset_days"], stage=block["stage"],
                               sort_order=next_order, origin="cost")
            next_order += 1
            created += 1
            session.add(step)
            session.flush()
            by_rule[(block["anchor"], block["offset_days"])] = step
        if step.origin == "cost":
            step.management = "\n".join(block["notes"]) or None
        elif block["notes"]:
            existing = step.management or ""
            extra = [n for n in block["notes"] if n.lower() not in existing.lower()]
            step.management = "\n".join(filter(None, [existing, *extra])) or None
        session.add(step)
        touched.add(step.id)
        for spec in block["lines"]:
            session.add(ProgramStepProduct(step_id=step.id, origin="cost", **spec))
            lines += 1
    session.flush()
    for step in ordered_steps(session):  # dates only an earlier cost sheet had
        if step.origin == "cost" and step.id not in touched:
            delete_step(session, step)
    session.commit()
    return {"steps_created": created, "lines": lines, "unmatched": parsed["unmatched"]}
