"""Everything the dashboard shows beyond the plain totals, in one call: what is
owed and what is past due, quotes still waiting for an answer, a "needs
attention" list (treatments, scans, overdue invoices, quotes to follow up,
program dates ready to invoice, gaps in client details), program money and the
top clients and products."""
from datetime import date, datetime, timedelta

from sqlmodel import Session, select

from app.core import herding
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.client_document import ClientDocument
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product
from app.models.program import HerdingProgram, ProgramStep
from app.models.quote import Quote

STEP_WINDOW_DAYS = 14      # program steps are listed this far back and ahead; older overdue ones are only counted
FOLLOW_UP_AFTER_DAYS = 7   # a sent quote with no answer after this long goes on the list
READY_WITHIN_DAYS = 14     # an invoiceable program date counts as ready this far ahead
TOP_N = 5
LOW_STOCK_SHOWN = 8
_SEVERITY = {"overdue": 0, "soon": 1, "info": 2}


def _label(client) -> str:
    return (client.farm_name or client.name) if client else ""


def _day(value) -> date:
    return value.date() if isinstance(value, datetime) else value


def _item(kind, severity, title, detail, client_id=None, link="/", day=None, **extra) -> dict:
    return {"type": kind, "severity": severity, "title": title, "detail": detail, "client_id": client_id,
            "link": link, "date": day.isoformat() if day else None, **extra}


def _money(value) -> float:
    return round(float(value or 0), 2)


def _names(names, shown=4) -> str:
    names = sorted(names)
    return ", ".join(names[:shown]) + (f" and {len(names) - shown} more" if len(names) > shown else "")


def build_dashboard(session: Session, today: date | None = None) -> dict:
    today = today or date.today()
    business = session.get(BusinessSettings, 1) or BusinessSettings()
    clients = {c.id: c for c in session.exec(select(Client)).all()}
    attention = []

    # --- Money owed ---
    invoices = [i for i in session.exec(select(Invoice).where(Invoice.status == "unpaid")).all()]
    due_of = lambda inv: _day(inv.due_date) if inv.due_date else _day(inv.date) + timedelta(days=business.payment_terms_days or 0)
    past_due = [(inv, (today - due_of(inv)).days) for inv in invoices if due_of(inv) < today]
    money = {"unpaid_total": _money(sum(i.total_amount for i in invoices)), "unpaid_count": len(invoices),
             "past_due_total": _money(sum(i.total_amount for i, _ in past_due)), "past_due_count": len(past_due),
             "oldest_past_due_days": max((d for _, d in past_due), default=0)}
    for inv, days in sorted(past_due, key=lambda p: -p[1]):
        client = clients.get(inv.client_id)
        attention.append(_item("invoice_overdue", "overdue", f"Invoice {inv.number or '#' + str(inv.id)} - R{inv.total_amount:,.2f}",
                               f"{_label(client)} - {days} {'day' if days == 1 else 'days'} overdue", inv.client_id,
                               f"/clients/{inv.client_id}", due_of(inv), id=inv.id))

    # --- Quotes waiting for an answer ---
    sent = session.exec(select(Quote).where(Quote.status == "Sent")).all()
    age = lambda q: (today - _day(q.date)).days
    quotes_waiting = {"count": len(sent), "total": _money(sum(q.total_amount for q in sent)),
                      "oldest_days": max((age(q) for q in sent), default=0)}
    for q in sorted(sent, key=age, reverse=True):
        if age(q) >= FOLLOW_UP_AFTER_DAYS:
            attention.append(_item("quote_followup", "soon", f"Quote {q.number or '#' + str(q.id)} - R{q.total_amount:,.2f}",
                                   f"{_label(clients.get(q.client_id))} - sent {age(q)} days ago, follow up", q.client_id,
                                   f"/clients/{q.client_id}", _day(q.date), id=q.id))

    # --- Herding programs: steps coming up, scans, dates ready to invoice ---
    older_steps, older_clients = 0, set()
    for program in session.exec(select(HerdingProgram).where(HerdingProgram.mating_date.is_not(None),
                                                             HerdingProgram.client_id.is_not(None))).all():
        client = clients.get(program.client_id)
        quote = session.get(Quote, program.quote_id) if program.quote_id else None
        for step in herding.schedule(session, program, today)["steps"]:
            day = step["date"]
            if day is None:
                continue
            name = step["stage"] or program.name
            if step["status"] not in ("done", "none"):
                if day < today - timedelta(days=STEP_WINDOW_DAYS):
                    older_steps += 1
                    older_clients.add(program.client_id)
                elif day <= today + timedelta(days=STEP_WINDOW_DAYS):
                    severity = "overdue" if day < today else "soon" if day <= today + timedelta(days=7) else "info"
                    attention.append(_item("scan" if step["origin"] == "scan" else "treatment", severity, name,
                                           _label(client), program.client_id, f"/programs/{program.id}", day,
                                           id=program.id, step_id=step["id"]))
            if (quote is not None and quote.status == "Accepted" and step["invoice_id"] is None
                    and any(line["buy"] > 0 for line in step["products"])
                    and day <= today + timedelta(days=READY_WITHIN_DAYS)):
                attention.append(_item("ready_to_invoice", "overdue" if day < today else "soon", f"Invoice {name}",
                                       f"{_label(client)} - quote accepted, this date isn't invoiced yet",
                                       program.client_id, f"/programs/{program.id}", day, id=program.id, step_id=step["id"]))

    # --- Gaps in client details ---
    with_certificate = {d.client_id for d in session.exec(select(ClientDocument).where(ClientDocument.kind == "tax_certificate")).all()}
    gaps = (("no_tax_certificate", "no tax certificate loaded", lambda c: c.id not in with_certificate),
            ("no_phone", "no phone number", lambda c: not (c.phone or "").strip()),
            ("no_address", "no address", lambda c: not (c.address or "").strip()))
    for key, text, missing in gaps:
        names = [_label(c) for c in clients.values() if missing(c)]
        if names:
            who = "1 client has" if len(names) == 1 else f"{len(names)} clients have"
            attention.append(_item("client_info", "info", f"{who} {text}", _names(names), None, "/clients", None,
                                   id=key, count=len(names)))

    for item in attention:
        item["client_name"] = _label(clients.get(item["client_id"]))
    attention.sort(key=lambda a: (_SEVERITY[a["severity"]], a["date"] or "9999", a["title"]))

    # --- Program money: what was agreed, invoiced and paid ---
    accepted = session.exec(select(Quote).where(Quote.program_id.is_not(None), Quote.status == "Accepted")).all()
    invoice_ids = [s.invoice_id for s in session.exec(select(ProgramStep).where(ProgramStep.invoice_id.is_not(None))).all()]
    program_invoices = [i for i in session.exec(select(Invoice).where(Invoice.id.in_(invoice_ids))).all()
                        if i.status != "cancelled"] if invoice_ids else []
    quoted = _money(sum(q.total_amount for q in accepted))
    invoiced = _money(sum(i.total_amount for i in program_invoices))
    program_money = {"quoted": quoted, "invoiced": invoiced,
                     "paid": _money(sum(i.total_amount for i in program_invoices if i.status == "paid")),
                     "still_to_invoice": max(_money(quoted - invoiced), 0.0)}

    # --- Top clients and products over the last twelve months ---
    since = datetime(today.year, today.month, today.day) - timedelta(days=365)
    recent = [i for i in session.exec(select(Invoice).where(Invoice.status != "cancelled", Invoice.date >= since)).all()]
    by_client = {}
    for inv in recent:
        by_client[inv.client_id] = by_client.get(inv.client_id, 0.0) + inv.total_amount
    top_clients = [{"client_id": cid, "name": _label(clients.get(cid)) or f"Client #{cid}", "revenue": _money(total)}
                   for cid, total in sorted(by_client.items(), key=lambda kv: -kv[1])[:TOP_N]]
    recent_ids = [i.id for i in recent]
    sold = {}
    for item in (session.exec(select(InvoiceItem).where(InvoiceItem.invoice_id.in_(recent_ids))).all() if recent_ids else []):
        row = sold.setdefault(item.product_id, [0.0, 0.0])
        row[0] += item.quantity
        row[1] += item.subtotal
    products = {p.id: p for p in session.exec(select(Product)).all()}
    top_products = [{"product_id": pid, "name": products[pid].name if pid in products else f"Product #{pid}",
                     "quantity": round(q, 2), "revenue": _money(r)}
                    for pid, (q, r) in sorted(sold.items(), key=lambda kv: -kv[1][1])[:TOP_N]]

    low = [p for p in products.values() if p.in_stock is False and p.is_active is not False]
    low_stock = {"count": len(low), "items": [{"id": p.id, "name": p.name} for p in sorted(low, key=lambda p: p.name)[:LOW_STOCK_SHOWN]]}

    return {"money": money, "quotes_waiting": quotes_waiting, "attention": attention,
            "older_overdue": {"steps": older_steps, "clients": len(older_clients)}, "program_money": program_money,
            "top_clients": top_clients, "top_products": top_products, "low_stock": low_stock}
