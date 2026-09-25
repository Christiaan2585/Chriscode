from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from typing import List, Optional
import re
import io
from openpyxl import load_workbook
from app.core.db import get_session
from app.core import cascade
from app.models.product import Product

router = APIRouter(prefix="/products", tags=["Products"])


@router.post("/", response_model=Product)
def create_product(product: Product, session: Session = Depends(get_session)):
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.get("/", response_model=List[Product])
def read_products(session: Session = Depends(get_session)):
    return session.exec(select(Product)).all()


@router.put("/{product_id}", response_model=Product)
def update_product(product_id: int, product_data: Product, session: Session = Depends(get_session)):
    db_product = session.get(Product, product_id)
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    for key, value in product_data.dict(exclude_unset=True, exclude={"id"}).items():
        setattr(db_product, key, value)

    session.add(db_product)
    session.commit()
    session.refresh(db_product)
    return db_product


@router.delete("/{product_id}")
def delete_product(product_id: int, session: Session = Depends(get_session)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        cascade.delete_product(session, product)
    except cascade.InUseError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    session.commit()
    return {"ok": True}


def _to_float(value) -> Optional[float]:
    """Best-effort numeric conversion. Returns None if it can't be parsed."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def _is_header_row(row) -> bool:
    """Price-list sections repeat a header row mid-sheet, marked by
    'Product code' (case-insensitive) in the second column."""
    code_cell = row[1] if len(row) > 1 else None
    return isinstance(code_cell, str) and code_cell.strip().lower() == "product code"


def _category_from_header(row) -> str:
    """The header's first cell looks like 'Product name          Entstowwe / Vaccines'.
    Strip the 'Product name' label to get just the category."""
    name_cell = row[0] if row else None
    text = str(name_cell) if name_cell is not None else ""
    category = re.sub(r"(?i)^product name\s*", "", text).strip()
    return category or "Uncategorised"


@router.post("/import")
async def import_products(file: UploadFile = File(...), session: Session = Depends(get_session)):
    """Import products from a supplier price-list Excel file (e.g. pryslyse.xlsx).

    The sheet is expected to have columns, in order:
        Product name | Product code | Unit pack size | Units per shipping carton |
        Unit Price (cost) | Selling Price Excl VAT | Selling Price Incl VAT

    The sheet may embed repeated header rows partway down to mark the start of a
    new category (e.g. "Entstowwe / Vaccines", then later "Doseermiddels") - those
    rows are detected and used to tag every following row with that category,
    they are not imported as products themselves.

    Matching an existing product: by "code" if the row has one, otherwise by an
    exact (case-insensitive) name match. A match is updated in place; otherwise a
    new product is created. Every row is handled independently so one bad row
    can't abort the whole import.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be an Excel sheet (.xlsx or .xls)")

    contents = await file.read()
    try:
        wb = load_workbook(io.BytesIO(contents), data_only=True)
        ws = wb.worksheets[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read the Excel file: {exc}")

    created, updated, skipped = 0, 0, 0
    errors = []
    current_category: Optional[str] = None

    for excel_row_num, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if not row or all(cell is None for cell in row):
            continue

        if _is_header_row(row):
            current_category = _category_from_header(row)
            continue

        name_cell = row[0] if len(row) > 0 else None
        if name_cell is None or not str(name_cell).strip():
            skipped += 1
            continue

        try:
            name = str(name_cell).strip()
            code_cell = row[1] if len(row) > 1 else None
            code = str(code_cell).strip() if code_cell is not None else None
            pack_size = _to_float(row[2]) if len(row) > 2 else None
            packaging = str(row[3]).strip() if len(row) > 3 and row[3] is not None else None
            cost = _to_float(row[4]) if len(row) > 4 else None
            price_excl_vat = _to_float(row[5]) if len(row) > 5 else None
            price_incl_vat = _to_float(row[6]) if len(row) > 6 else None

            if cost is None:
                raise ValueError("missing/invalid Unit Price (cost) - row skipped")

            # Derive whichever selling price is missing from the confirmed markup
            # (excl VAT = cost x 1.25, incl VAT = excl VAT x 1.15) rather than
            # dropping the row.
            if price_excl_vat is None:
                price_excl_vat = round(cost * 1.25, 4)
            if price_incl_vat is None:
                price_incl_vat = round(price_excl_vat * 1.15, 4)

            existing = None
            if code:
                existing = session.exec(select(Product).where(Product.code == code)).first()
            if existing is None:
                existing = session.exec(
                    select(Product).where(Product.name.ilike(name))
                ).first()

            if existing:
                existing.name = name
                existing.code = code
                existing.pack_size = pack_size
                existing.packaging = packaging
                existing.category = current_category
                existing.cost = cost
                existing.price_excl_vat = price_excl_vat
                existing.price = price_incl_vat
                session.add(existing)
                updated += 1
            else:
                product = Product(
                    name=name,
                    price=price_incl_vat,
                    unit="unit",
                    dosage=0.0,
                    code=code,
                    pack_size=pack_size,
                    packaging=packaging,
                    category=current_category,
                    cost=cost,
                    price_excl_vat=price_excl_vat,
                )
                session.add(product)
                created += 1
        except Exception as exc:
            errors.append({"row": excel_row_num, "name": str(name_cell), "error": str(exc)})

    session.commit()
    return {
        "created": created,
        "updated": updated,
        "skipped_blank": skipped,
        "errors": errors,
        "total_rows_processed": created + updated,
    }
