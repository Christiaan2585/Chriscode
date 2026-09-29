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

from app.models.product import Product
from app.models.program import (AnimalGroup, HerdingProgram, ProgramStep, ProgramStepProduct,
                                ProgramStepProgress, ProgramTemplate)

ANCHORS = ("mating_start", "mating_end", "lambing_start", "lambing_end", "weaning")
TEXT_FIELDS = ("stage", "management", "vaccinations", "dosing", "vitamins", "feeding")
DUE_WITHIN_DAYS = 7


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


def headcount(groups, animal_group) -> int:
    wanted = (animal_group or "").strip().lower()
    return sum(g.group_size for g in groups if not wanted or g.animal_type.strip().lower() == wanted)


def quantity_for(product: Product, dose, head) -> tuple:
    """(total dose, how many to sell): whole packs when the product has a
    pack size (312 ml of a 100 ml bottle is 4 bottles), else one per dose."""
    total = round((dose or 0) * (head or 0), 3)
    if total <= 0:
        return 0, 0
    units = math.ceil(total / product.pack_size - 1e-9) if product.pack_size else total
    return total, units


def ordered_steps(session: Session) -> list:
    return session.exec(select(ProgramStep).order_by(ProgramStep.sort_order, ProgramStep.id)).all()


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


def schedule(session: Session, program: HerdingProgram, today: date | None = None) -> dict:
    """The client's program: every master step with its date, whether it's
    done/overdue/due/upcoming, and each product's amount for their animals."""
    if program.mating_date is None:
        return {"anchors": None, "steps": [], "progress": {"done": 0, "total": 0}}
    today = today or date.today()
    template = get_template(session)
    anchors = anchor_dates(program, template)
    groups = session.exec(select(AnimalGroup).where(AnimalGroup.program_id == program.id)).all()
    done = {p.step_id: p.done_at for p in
            session.exec(select(ProgramStepProgress).where(ProgramStepProgress.program_id == program.id)).all()}
    steps = ordered_steps(session)
    products = step_products(session, [s.id for s in steps])
    out = []
    for step in steps:
        day = anchors.get(step.anchor, anchors["mating_start"]) + timedelta(days=step.offset_days)
        lines = []
        for line, product in products.get(step.id, []):
            head = headcount(groups, line.animal_group)
            total, units = quantity_for(product, line.dose, head)
            lines.append({**line.model_dump(), "product_name": product.name, "unit": product.unit,
                          "pack_size": product.pack_size, "price": product.price,
                          "head": head, "total": total, "units": units})
        out.append({**step.model_dump(), "date": day, "status": _status(day, step.id in done, today),
                    "done_at": done.get(step.id), "products": lines})
    out.sort(key=lambda s: (s["date"], s["sort_order"]))  # a client's own dates can reorder steps
    return {"anchors": anchors, "steps": out,
            "progress": {"done": sum(1 for s in out if s["status"] == "done"), "total": len(out)}}


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
        for key, value in spec.items():
            setattr(step, key, value)
        session.add(step)
    leftover = [s for ss in existing.values() for s in ss]
    for step in leftover:
        delete_step(session, step)
    session.commit()
    return {"created": created, "updated": updated, "removed": len(leftover), "name": template.name}


def delete_step(session: Session, step: ProgramStep) -> None:
    for model in (ProgramStepProduct, ProgramStepProgress):
        for row in session.exec(select(model).where(model.step_id == step.id)).all():
            session.delete(row)
    session.delete(step)
