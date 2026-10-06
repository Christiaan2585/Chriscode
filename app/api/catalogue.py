"""The supplier's catalogue book (English and Afrikaans) as the app's
catalogue - see app/core/kyron_catalogue.py. Uploading a book and linking
its products to this app's products is admin-only; every signed-in user can
get the priced book (and a client's order form)."""
import re
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.business import get_business
from app.core import kyron_catalogue as kc
from app.core.db import get_session
from app.core.pdf import _logo_bytes
from app.core.security import require_admin
from app.models.catalogue import CatalogueLink
from app.models.client import Client
from app.models.product import Product

router = APIRouter(prefix="/catalogue", tags=["Catalogue"])

MAX_BOOK_BYTES = 60 * 1024 * 1024
Language = Literal["en", "af"]


class LinkRequest(BaseModel):
    product_ids: List[int] = Field(max_length=50)


def _links(session: Session) -> dict:
    out = {}
    for link in session.exec(select(CatalogueLink).order_by(CatalogueLink.entry_key, CatalogueLink.sort_order,
                                                            CatalogueLink.id)).all():
        out.setdefault(link.entry_key, []).append(link.product_id)
    return out


def _books():
    english, afrikaans = kc.load_meta("en"), kc.load_meta("af")
    return english, afrikaans


def _entry_keys() -> set:
    keys = set()
    english, afrikaans = _books()
    for meta in (english, afrikaans):
        if meta:
            keys.update(kc.keys_for(meta, english))
    return keys


@router.get("/kyron")
def read_kyron(session: Session = Depends(get_session)):
    """What's loaded, and every product in the book with the app products
    linked to it (plus name-based suggestions for linking)."""
    english, afrikaans = _books()
    base = english or afrikaans
    links = _links(session)
    products = session.exec(select(Product).order_by(Product.name)).all()
    af_names = {}
    if afrikaans:
        for key, e in zip(kc.keys_for(afrikaans, english), afrikaans["entries"]):
            af_names[(e["page"], e["order"])] = e["name"]
    entries = []
    if base:
        for key, e in zip(kc.keys_for(base, english), base["entries"]):
            entries.append({"key": key, "page": e["page"], "order": e["order"], "name": e["name"],
                            "name_af": af_names.get((e["page"], e["order"])),
                            "product_ids": links.get(key, []), "suggested": kc.suggest(e["name"], products)})
    linked_ids = {pid for ids in links.values() for pid in ids}
    summary = {lang: ({k: meta[k] for k in ("pages", "uploaded_at", "filename")} | {"products": len(meta["entries"])}
                      if meta else None) for lang, meta in (("en", english), ("af", afrikaans))}
    return {"languages": summary, "entries": entries,
            "not_in_book": sum(1 for p in products if p.is_active is not False and p.id not in linked_ids)}


@router.put("/kyron/{lang}", dependencies=[Depends(require_admin)])
async def upload_book(lang: Language, file: UploadFile = File(...)):
    data = await file.read(MAX_BOOK_BYTES + 1)
    if len(data) > MAX_BOOK_BYTES:
        raise HTTPException(status_code=413, detail="That PDF is over 60 MB")
    try:
        meta = kc.save_catalogue(lang, data, (file.filename or "")[:200])
    except kc.CatalogueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    other = kc.load_meta("af" if lang == "en" else "en")
    warning = None
    if other and [(e["page"], e["order"]) for e in other["entries"]] != [(e["page"], e["order"]) for e in meta["entries"]]:
        warning = "The English and Afrikaans books don't list the same products on the same pages - load matching editions."
    return {"pages": meta["pages"], "products": len(meta["entries"]), "warning": warning}


@router.put("/kyron/links/{key}", dependencies=[Depends(require_admin)])
def set_links(key: str, data: LinkRequest, session: Session = Depends(get_session)):
    if key not in _entry_keys():
        raise HTTPException(status_code=404, detail="That product isn't in the loaded catalogue")
    ids = list(dict.fromkeys(data.product_ids))
    found = {p.id for p in session.exec(select(Product).where(Product.id.in_(ids))).all()} if ids else set()
    if set(ids) - found:
        raise HTTPException(status_code=422, detail="One of those products no longer exists")
    for link in session.exec(select(CatalogueLink).where(CatalogueLink.entry_key == key)).all():
        session.delete(link)
    for order, pid in enumerate(ids):
        session.add(CatalogueLink(entry_key=key, product_id=pid, sort_order=order))
    session.commit()
    return {"key": key, "product_ids": ids}


@router.post("/kyron/links/suggested", dependencies=[Depends(require_admin)])
def link_suggested(session: Session = Depends(get_session)):
    """Links every book product that has no products yet to the app
    products whose names match it. Entries already linked are left alone."""
    existing = _links(session)
    products = [p for p in session.exec(select(Product).order_by(Product.name)).all() if p.is_active is not False]
    english, afrikaans = _books()
    base = english or afrikaans
    linked = 0
    for key, e in zip(kc.keys_for(base, english), base["entries"]) if base else []:
        if existing.get(key):
            continue
        ids = kc.suggest(e["name"], products)
        for order, pid in enumerate(ids):
            session.add(CatalogueLink(entry_key=key, product_id=pid, sort_order=order))
        if ids:
            existing[key] = ids
            linked += 1
    session.commit()
    return {"linked": linked}


@router.get("/kyron/{lang}.pdf")
def kyron_pdf(lang: Language, client_id: Optional[int] = None, session: Session = Depends(get_session)):
    """The book with this business's prices down the side. With client_id
    it's that client's fillable order form (read back by
    quotes.quote_from_order_form)."""
    meta = kc.load_meta(lang)
    if meta is None:
        raise HTTPException(status_code=404, detail="That catalogue hasn't been loaded yet (Products -> Catalog)")
    client = None
    if client_id is not None:
        client = session.get(Client, client_id)
        if client is None:
            raise HTTPException(status_code=404, detail="Client not found")
    english = kc.load_meta("en")
    links = _links(session)
    products = {p.id: p for p in session.exec(select(Product)).all()}
    linked, used = {}, set()
    for key, e in zip(kc.keys_for(meta, english), meta["entries"]):
        items = [products[pid] for pid in links.get(key, []) if pid in products and products[pid].is_active is not False]
        linked[(e["page"], e["order"])] = items
        used.update(p.id for p in items)
    all_linked = {pid for ids in links.values() for pid in ids}
    others = sorted((p for p in products.values() if p.is_active is not False and p.id not in all_linked and p.id not in used),
                    key=lambda p: ((p.category or "~").lower(), p.name.lower()))
    pdf = kc.build_pdf(lang, get_business(session), meta["entries"], linked, others, _logo_bytes(), client)
    name = f"order-form-{re.sub(r'[^a-z0-9]+', '-', client.name.lower()).strip('-')}" if client else "catalogue"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={name}-{lang}.pdf"})
