import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import apiClient from "../api/client";
import Modal from "./Modal";
import { savePictureChange } from "./ProductPicture";
import { cropRect, toCanvasPoint, wholePage } from "../utils/cropRect";
import { cropToFile, drawPage, openPdf } from "../utils/pdfPages";
import { fetchDocumentPdf } from "../utils/documents";

const field = "w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const VAT = 1.15; // same default as utils/products.js; the price excl VAT can be corrected in the table

// "Add products from this brochure": the brochure's pages are shown here; for each product you type the name and
// price, draw a box round its picture, and Add puts it in the products list with that picture.
const BrochureProducts = ({ book, onClose }) => {
  const queryClient = useQueryClient();
  const canvas = useRef(null);
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [rect, setRect] = useState(null);
  const [drag, setDrag] = useState(null);
  const [form, setForm] = useState({ name: "", price: "", category: "" });
  const [added, setAdded] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: async () => (await apiClient.get("/products/")).data });

  useEffect(() => {
    let cancelled = false;
    fetchDocumentPdf("catalogue-library", book.id, `/catalogue/library/${book.id}.pdf`)
      .then(openPdf)
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch(() => { if (!cancelled) setLoadError("Could not open this brochure."); });
    return () => { cancelled = true; };
  }, [book.id]);

  useEffect(() => {
    if (!doc || !canvas.current) return;
    setRect(null);
    drawPage(doc, page, canvas.current).catch(() => setLoadError("Could not draw this page."));
  }, [doc, page]);

  const bounds = () => ({ width: canvas.current.width, height: canvas.current.height });
  const point = (e) => toCanvasPoint(e, canvas.current.getBoundingClientRect(), bounds());
  const onDown = (e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(point(e)); setRect(null); };
  const onMove = (e) => { if (drag) setRect(cropRect(drag, point(e), bounds())); };
  const onUp = (e) => { if (drag) { setRect(cropRect(drag, point(e), bounds())); setDrag(null); } };

  const known = form.name.trim() && products.find((p) => p.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const add = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const price = form.price === "" ? 0 : Number(form.price);
    if (!name) return setMessage({ ok: false, text: "Type the product's name." });
    if (known) return setMessage({ ok: false, text: `${known.name} is already in your products - change its details in the products table.` });
    if (Number.isNaN(price) || price < 0) return setMessage({ ok: false, text: "The price must be a number." });
    setBusy(true);
    setMessage(null);
    try {
      const body = { name, price, unit: "unit", category: form.category.trim() || null, price_excl_vat: price ? Math.round((price / VAT) * 100) / 100 : null };
      const created = (await apiClient.post("/products/", body, { silent: true })).data;
      let pictureNote = "";
      if (rect) {
        try {
          await savePictureChange(created.id, { file: await cropToFile(canvas.current, rect, `${name}.jpg`) });
        } catch {
          pictureNote = " The picture did not save - add it from the products table.";
        }
      }
      setAdded((list) => [...list, { id: created.id, name, picture: Boolean(rect) && !pictureNote }]);
      setForm({ name: "", price: "", category: form.category });
      setRect(null);
      setMessage({ ok: !pictureNote, text: `${name} added.${pictureNote}${price ? "" : " Its price is R0 until you set it in the products table."}` });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-thumbnails"] });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setMessage({ ok: false, text: typeof detail === "string" ? detail : "That did not save." });
    } finally {
      setBusy(false);
    }
  };

  const pages = doc?.numPages || book.pages || 1;
  return (
    <Modal isOpen onClose={onClose} title={`Add products from ${book.name}`} size="xl">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"><ChevronLeft size={16} /> Back</button>
            <span>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40">Next <ChevronRight size={16} /></button>
          </div>
          {loadError ? <p role="alert" className="text-sm text-red-600">{loadError}</p> : !doc && <p className="text-sm text-slate-500">Opening the brochure...</p>}
          <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100">
            <div className="relative mx-auto w-full max-w-[640px]">
              <canvas ref={canvas} aria-label={`Page ${page} of the brochure`} className="block h-auto w-full" />
              {doc && (
                <div className="absolute inset-0 cursor-crosshair touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} data-testid="crop-layer">
                  {rect && canvas.current && (
                    <div className="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-400/20"
                      style={{ left: `${(rect.x / canvas.current.width) * 100}%`, top: `${(rect.y / canvas.current.height) * 100}%`,
                        width: `${(rect.w / canvas.current.width) * 100}%`, height: `${(rect.h / canvas.current.height) * 100}%` }} />
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Drag a box round the product's picture. {rect ? "Picture chosen." : "No box drawn - the product will have no picture."}
            {doc && (
              <> <button type="button" className="text-emerald-700 hover:underline" onClick={() => setRect(wholePage(bounds()))}>Use the whole page</button>
                {rect && <> · <button type="button" className="text-emerald-700 hover:underline" onClick={() => setRect(null)}>Clear the box</button></>}</>
            )}
          </p>
        </div>

        <form className="space-y-3 text-sm" onSubmit={add}>
          <label className="block"><span className="text-xs text-slate-500">Product name</span>
            <input className={field} required maxLength={200} value={form.name} onChange={set("name")} placeholder="e.g. Attila 5 l" /></label>
          {known && <p className="text-xs text-amber-700">{known.name} is already in your products.</p>}
          <label className="block"><span className="text-xs text-slate-500">Selling price incl. VAT (R)</span>
            <input className={field} type="number" min="0" step="0.01" value={form.price} onChange={set("price")} placeholder="leave empty if not known yet" /></label>
          <label className="block"><span className="text-xs text-slate-500">Category (optional)</span>
            <input className={field} list="brochure-categories" maxLength={100} value={form.category} onChange={set("category")} />
            <datalist id="brochure-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          <button type="submit" disabled={busy || !doc} className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? "Adding..." : "Add to products"}
          </button>
          {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-emerald-700" : "text-red-600"}>{message.text}</p>}
          {added.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Added from this brochure</p>
              <ul className="space-y-0.5">
                {added.map((a) => <li key={a.id} className="flex items-center gap-1 text-slate-700"><Check size={14} className="text-emerald-600" /> {a.name}{!a.picture && <span className="text-xs text-slate-400"> (no picture)</span>}</li>)}
              </ul>
            </div>
          )}
          <button type="button" onClick={onClose} className="w-full rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">Done</button>
        </form>
      </div>
    </Modal>
  );
};

export default BrochureProducts;
