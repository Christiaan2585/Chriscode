"""A client's herding program and its quote are one thing (2026-10-07): every
program with a client and a first mating day has exactly one quote for the
whole year, and its lines ARE the program's product lines - one quote line
per program line, linked by QuoteItem.program_line_id. Changing either side
changes the other: program edits call sync(), and the Quotes page's add /
remove line calls add_line() / remove_line() here. Once the quote is
Accepted the agreed products and amounts are locked (check_unlocked) and
each date is invoiced from those lines."""
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from app.api.business import default_expiry_date, next_document_number, price_line, totals_for
from app.core import herding
from app.models.program import HerdingProgram, ProgramStep, ProgramStepProduct
from app.models.quote import Quote
from app.models.quote_item import QuoteItem

LOCKED = "Accepted"
EXTRA_STAGE = "Ekstra (van die kwotasie)"  # lines added on the quote itself


def program_quote(session: Session, program: HerdingProgram) -> Quote | None:
    return session.get(Quote, program.quote_id) if program.quote_id else None


def program_for_quote(session: Session, quote: Quote) -> HerdingProgram | None:
    """The program whose own quote this is (not just any quote made from it)."""
    if not quote.program_id:
        return None
    program = session.get(HerdingProgram, quote.program_id)
    return program if program is not None and program.quote_id == quote.id else None


def check_unlocked(session: Session, program: HerdingProgram) -> None:
    quote = program_quote(session, program)
    if quote is not None and quote.status == LOCKED:
        raise HTTPException(status_code=409, detail=f"{quote.number or 'The quote'} has been accepted, so this "
                                                    "program's products and amounts are locked. Set the quote back "
                                                    "to Draft to change them.")


def sync(session: Session, program: HerdingProgram, user_id: int | None = None) -> Quote | None:
    """Makes the program's quote (the first time) and brings its lines in
    line with the program: one line per product line with packs to sell,
    at the agreed price and discount. An accepted quote is left as agreed.
    Commits only when something changed."""
    if program.mating_date is None or not program.client_id:
        return None
    quote = program_quote(session, program)
    if quote is None:
        now = datetime.utcnow()
        quote = Quote(client_id=program.client_id, program_id=program.id, date=now, status="Draft",
                      expiry_date=default_expiry_date(session, now), number=next_document_number(session, Quote),
                      reference=f"Herding program: {program.name}"[:200], created_by=user_id)
        session.add(quote)
        session.flush()
        program.quote_id = quote.id
        session.add(program)
    elif quote.status == LOCKED:
        return quote
    if quote.created_by is None and user_id:
        quote.created_by = user_id
    sched = herding.schedule(session, program)
    want = [(step["id"], line) for step in sched["steps"] for line in step["products"] if line["buy"] > 0]
    have = session.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id,
                                                QuoteItem.program_line_id.is_not(None))).all()
    key = lambda line, step, product, qty, price, disc: (line, step, product, float(qty), round(price or 0, 2), disc or 0)
    current = sorted(key(i.program_line_id, i.program_step_id, i.product_id, i.quantity, i.unit_price, i.discount_percent)
                     for i in have)
    wanted = sorted(key(l["id"], s, l["product_id"], l["buy"], l["price_excl_vat"], l["discount_percent"]) for s, l in want)
    if current != wanted:
        for item in have:
            session.delete(item)
        session.flush()
        for step_id, line in want:
            item = QuoteItem(quote_id=quote.id, product_id=line["product_id"], quantity=line["buy"],
                             unit_price=line["price_excl_vat"], discount_percent=line["discount_percent"],
                             program_line_id=line["id"], program_step_id=step_id)
            price_line(session, item)
            session.add(item)
        session.flush()
    quote.total_amount = totals_for(session.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id)).all())["grand_total"]
    session.add(quote)
    session.commit()
    session.refresh(quote)
    return quote


def add_line(session: Session, program: HerdingProgram, item: QuoteItem) -> QuoteItem:
    """A line added on the program's quote becomes a program line (in an
    undated "extra" step) with that many packs, then the quote is synced."""
    check_unlocked(session, program)
    herding.ensure_client_copy(session, program)
    step = session.exec(select(ProgramStep).where(ProgramStep.program_id == program.id,
                                                  ProgramStep.stage == EXTRA_STAGE)).first()
    if step is None:
        step = ProgramStep(program_id=program.id, anchor=herding.UNDATED, offset_days=0, stage=EXTRA_STAGE,
                           section=herding.OTHER_SECTION, origin="quote", sort_order=10_000)
        session.add(step)
        session.flush()
    line = ProgramStepProduct(step_id=step.id, product_id=item.product_id, fixed_quantity=item.quantity,
                              quantity_override=item.quantity, unit_price=item.unit_price or None,
                              discount_percent=item.discount_percent, origin="quote")
    session.add(line)
    session.flush()
    quote = sync(session, program)
    return session.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id,
                                                QuoteItem.program_line_id == line.id)).one()


def remove_line(session: Session, program: HerdingProgram, item: QuoteItem) -> None:
    """A line removed from the program's quote is removed from the program."""
    check_unlocked(session, program)
    line = session.get(ProgramStepProduct, item.program_line_id)
    if line is not None:
        session.delete(line)
    session.delete(item)
    session.flush()
    sync(session, program)
