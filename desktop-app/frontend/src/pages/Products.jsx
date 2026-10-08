import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Plus, Edit, LayoutGrid, Rows3, FileDown } from "lucide-react";
import apiClient from "../api/client";
import Modal from "../components/Modal";
import InlineEdit from "../components/InlineEdit";
import DocumentPreview from "../components/DocumentPreview";
import ProductCatalog, { useProductPatch } from "../components/ProductCatalog";
import CatalogueLibrary from "../components/CatalogueLibrary";
import { BulkBar, SelectAllTh, SelectTd } from "../components/BulkSelect";
import { useSelection } from "../utils/useSelection";
import SupplierCatalogue, { LANGUAGE_NAMES, LoadBookPrompt, loadedLanguages, useSupplierBook } from "../components/SupplierCatalogue";
import { useAuth } from "../context/AuthContext";
import { PictureField, ProductPictureViewer, ProductThumb, savePictureChange, useProductThumbnails } from "../components/ProductPicture";
import { money } from "../utils/format";
import { categoryOf, isActive, isInStock, recomputeFromCost } from "../utils/products";
import { PREF_KEYS } from "../utils/preferences";

const emptyProduct = {
  name: "", price: "", unit: "unit", dosage: 0, description: "", in_stock: true, is_active: true,
  code: "", category: "", pack_size: "", packaging: "", cost: "", price_excl_vat: "",
};

const VIEW_KEY = PREF_KEYS.productsView;
const savedView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "catalog";
  } catch {
    return "catalog";
  }
};

const inputClass = "w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none";

const ViewButton = ({ active, onClick, Icon, children }) => (
  <button type="button" onClick={onClick} aria-pressed={active}
    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${active ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
    <Icon size={16} aria-hidden="true" /> {children}
  </button>
);

// Spreadsheet-style table: every cell is editable in place.
const ProductTable = ({ products, thumbnails, onOpenPicture, onEdit, onDelete, selection }) => {
  const patch = useProductPatch();
  const save = (id, field) => (value) => patch.mutateAsync({ id, changes: { [field]: value } });
  // Cost keeps the standard markup in step, same as the full product form.
  const saveCost = (id) => (value) => patch.mutateAsync({ id, changes: { cost: value, ...recomputeFromCost(value) } });
  const cell = "px-4 py-3 text-sm align-top";

  return (
    <div className="overflow-x-auto">
      <table className="card-table w-full text-left">
        <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
          <tr>
            <SelectAllTh selection={selection} />
            {["Product", "Code", "Category", "Pack Size", "Packaging"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            {["Cost", "Excl VAT", "Incl VAT"].map((h) => <th key={h} className="px-4 py-3 font-medium text-right">{h}</th>)}
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((p) => (
            <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${isActive(p) ? "" : "opacity-60"}`}>
              <SelectTd selection={selection} id={p.id} label={`Select ${p.name}`} />
              <td data-primary className={cell}>
                <div className="flex items-center gap-3">
                  <ProductThumb product={p} src={thumbnails[p.id]} onOpen={onOpenPicture} />
                  <div className="min-w-0">
                    <InlineEdit value={p.name} onSave={save(p.id, "name")} label="Name" required className="font-medium text-slate-700" />
                    <div className="flex gap-1">
                      {!isInStock(p) && <span className="rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">Out of stock</span>}
                      {!isActive(p) && <span className="rounded bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">Hidden</span>}
                    </div>
                  </div>
                </div>
              </td>
              <td data-label="Code" className={`${cell} text-slate-500`}><InlineEdit value={p.code} onSave={save(p.id, "code")} label="Code" placeholder="—" /></td>
              <td data-label="Category" className={`${cell} text-slate-500`}><InlineEdit value={p.category} onSave={save(p.id, "category")} label="Category" placeholder="—" listId="product-categories" /></td>
              <td data-label="Pack size" className={`${cell} text-slate-500`}><InlineEdit value={p.pack_size} onSave={save(p.id, "pack_size")} label="Pack size" type="number" placeholder="—" /></td>
              <td data-label="Packaging" className={`${cell} text-slate-500`}><InlineEdit value={p.packaging} onSave={save(p.id, "packaging")} label="Packaging" placeholder="—" /></td>
              <td data-label="Cost" className={`${cell} text-right text-slate-600`}><InlineEdit value={p.cost} onSave={saveCost(p.id)} label="Cost" type="number" format={money} placeholder="—" /></td>
              <td data-label="Price excl VAT" className={`${cell} text-right text-slate-600`}><InlineEdit value={p.price_excl_vat} onSave={save(p.id, "price_excl_vat")} label="Selling price excl VAT" type="number" format={money} placeholder="—" /></td>
              <td data-label="Price incl VAT" data-key className={`${cell} text-right font-semibold text-slate-800`}><InlineEdit value={p.price} onSave={save(p.id, "price")} label="Selling price incl VAT" type="number" required format={money} /></td>
              <td data-actions className={`${cell} text-right`}>
                <div className="flex justify-end gap-1">
                  <button onClick={() => onEdit(p)} className="p-2 text-slate-400 hover:text-emerald-600 transition-colors" title="All details" aria-label={`Edit all details of ${p.name}`}>
                    <Edit size={18} />
                  </button>
                  <button onClick={() => onDelete(p)} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Delete" aria-label={`Delete ${p.name}`}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-400">No products match.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const Products = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [showHidden, setShowHidden] = useState(false);
  const [view, setView] = useState(savedView);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [pictureChange, setPictureChange] = useState({ file: null, remove: false });
  const [viewing, setViewing] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const thumbnails = useProductThumbnails();
  const { user } = useAuth();
  const { data: book } = useSupplierBook();
  const bookLanguages = loadedLanguages(book);
  const showBook = view === "catalog" && bookLanguages.length > 0;

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await apiClient.get("/products/")).data,
  });

  const chooseView = (next) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private mode etc. - the choice just isn't remembered.
    }
  };

  // The product first, then its picture (a new product needs its id first).
  const saveMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const saved = id
        ? (await apiClient.put(`/products/${id}`, data)).data
        : (await apiClient.post("/products/", data)).data;
      await savePictureChange(saved.id, pictureChange);
      return saved;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-thumbnails"] });
    },
    onSuccess: () => closeModal(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/products/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyProduct);
    setPictureChange({ file: null, remove: false });
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyProduct);
    setPictureChange({ file: null, remove: false });
    setIsModalOpen(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setPictureChange({ file: null, remove: false });
    setForm({
      name: p.name || "",
      price: p.price ?? "",
      unit: p.unit || "unit",
      dosage: p.dosage ?? 0,
      description: p.description || "",
      in_stock: isInStock(p),
      is_active: isActive(p),
      code: p.code || "",
      category: p.category || "",
      pack_size: p.pack_size ?? "",
      packaging: p.packaging || "",
      cost: p.cost ?? "",
      price_excl_vat: p.price_excl_vat ?? "",
    });
    setIsModalOpen(true);
  };

  const handleCostChange = (value) => setForm((prev) => ({ ...prev, cost: value, ...recomputeFromCost(value) }));

  const buildPayload = () => ({
    name: form.name,
    price: Number(form.price),
    unit: form.unit || "unit",
    dosage: Number(form.dosage) || 0,
    description: form.description.trim() || null,
    in_stock: form.in_stock,
    is_active: form.is_active,
    code: form.code || null,
    category: form.category || null,
    pack_size: form.pack_size === "" ? null : Number(form.pack_size),
    packaging: form.packaging || null,
    cost: form.cost === "" ? null : Number(form.cost),
    price_excl_vat: form.price_excl_vat === "" ? null : Number(form.price_excl_vat),
  });

  const handleSave = () => saveMutation.mutate({ id: editingId, data: buildPayload() });

  const handleDelete = (product) => {
    if (window.confirm(`Delete "${product.name}"? This can't be undone.\n\nTip: "Hide" keeps it off the catalogue without deleting it.`)) {
      deleteMutation.mutate(product.id);
    }
  };

  const categoryNames = useMemo(
    () => Array.from(new Set((products || []).map((p) => p.category).filter(Boolean))).sort(),
    [products]
  );
  const categoryFilter = useMemo(
    () => ["All", ...categoryNames, ...((products || []).some((p) => !p.category) ? ["Uncategorised"] : [])],
    [products, categoryNames]
  );
  const hiddenCount = (products || []).filter((p) => !isActive(p)).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products || []).filter((p) =>
      (showHidden || isActive(p)) &&
      (category === "All" || categoryOf(p) === category) &&
      (!q || p.name?.toLowerCase().includes(q) || String(p.code || "").toLowerCase().includes(q) ||
        String(p.description || "").toLowerCase().includes(q))
    );
  }, [products, search, category, showHidden]);
  const selection = useSelection(useMemo(() => filtered.map((p) => p.id), [filtered]));

  const openCatalogue = () =>
    setCatalogue({
      kind: "catalogue",
      id: category,
      title: category === "All" ? "catalogue" : `catalogue - ${category}`,
      url: category === "All" ? "/products/catalogue.pdf" : `/products/catalogue.pdf?category=${encodeURIComponent(category)}`,
    });

  if (isLoading) return <div className="p-8 text-center">Loading products...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Products</h2>
          <p className="text-slate-500">
            {products?.length || 0} products{hiddenCount ? `, ${hiddenCount} hidden` : ""} - tap any detail to change it
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {bookLanguages.length ? bookLanguages.map((lang) => (
            <button key={lang} type="button"
              onClick={() => setCatalogue({ kind: "catalogue", id: lang, title: `catalogue (${LANGUAGE_NAMES[lang]})`,
                url: `/catalogue/kyron/${lang}.pdf`, filename: `Catalogue (${LANGUAGE_NAMES[lang]}).pdf` })}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:border-emerald-400">
              <FileDown size={18} /> PDF ({LANGUAGE_NAMES[lang]})
            </button>
          )) : (
            <button onClick={openCatalogue}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:border-emerald-400">
              <FileDown size={18} /> PDF catalogue
            </button>
          )}
          <button onClick={openAddModal}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus size={20} /> Add Product
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-3">
          {!showBook && (<>
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code or description..." aria-label="Search products"
              className="w-full pl-10 pr-4 py-3 md:py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1 md:hidden" role="group" aria-label="Category">
            {categoryFilter.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${category === c ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                {c}
              </button>
            ))}
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"
            className="hidden p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 md:block">
            {categoryFilter.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Show hidden
          </label>
          </>)}
          <div className={`flex overflow-hidden rounded-lg border border-slate-200 ${showBook ? "ml-auto" : ""}`} role="group" aria-label="View">
            <ViewButton active={view === "catalog"} onClick={() => chooseView("catalog")} Icon={LayoutGrid}>Catalog</ViewButton>
            <ViewButton active={view === "table"} onClick={() => chooseView("table")} Icon={Rows3}>Table</ViewButton>
          </div>
        </div>

        <datalist id="product-categories">
          {categoryNames.map((c) => <option key={c} value={c} />)}
        </datalist>

        {!showBook && (
          <div className="space-y-2 p-3 empty:hidden">
            <BulkBar selection={selection} noun="product" describe={(id) => products?.find((p) => p.id === id)?.name || `#${id}`}
              deleteOne={(id) => apiClient.delete(`/products/${id}`, { silent: true })}
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: ["products"] });
                queryClient.invalidateQueries({ queryKey: ["product-thumbnails"] });
              }} />
          </div>
        )}

        {showBook ? (
          <SupplierCatalogue book={book} products={products} canEdit={Boolean(user?.is_admin)} />
        ) : view === "catalog" ? (
          <>
            {book && <LoadBookPrompt canEdit={Boolean(user?.is_admin)} />}
            <ProductCatalog products={filtered} thumbnails={thumbnails} onOpenPicture={setViewing}
              onEdit={openEditModal} onDelete={handleDelete} selection={selection} />
          </>
        ) : (
          <ProductTable products={filtered} thumbnails={thumbnails} onOpenPicture={setViewing}
            onEdit={openEditModal} onDelete={handleDelete} selection={selection} />
        )}

        {view === "catalog" && <CatalogueLibrary canEdit={Boolean(user?.is_admin)} />}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? "Edit Product" : "Add Product"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <input type="text" value={form.category} list="product-categories" onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Entstowwe / Vaccines" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description (shown in the catalogue)</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What it's for, dosage notes, withdrawal period..." className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pack Size (ml/gr)</label>
              <input type="number" value={form.pack_size} onChange={(e) => setForm({ ...form, pack_size: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Packaging</label>
              <input type="text" value={form.packaging} onChange={(e) => setForm({ ...form, packaging: e.target.value })}
                placeholder="e.g. 6 x 500 ml" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cost (excl VAT)</label>
              <input type="number" value={form.cost} onChange={(e) => handleCostChange(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Selling excl VAT</label>
              <input type="number" value={form.price_excl_vat} onChange={(e) => setForm({ ...form, price_excl_vat: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Selling incl VAT</label>
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>
          <p className="text-xs text-slate-400 -mt-2">
            Editing cost auto-fills the standard markup (excl = cost × 1.25, incl = excl × 1.15) - you can still override either selling price by hand.
          </p>
          <PictureField currentSrc={editingId ? thumbnails[editingId] : null} change={pictureChange} onChange={setPictureChange} />
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.in_stock} onChange={(e) => setForm({ ...form, in_stock: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
              In stock
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
              Show in the catalogue and product lists
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Dosage (for the Product Calculator)</label>
            <input type="number" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: Number(e.target.value) })} className={inputClass} />
          </div>
          <button disabled={!form.name || !form.price || saveMutation.isPending} onClick={handleSave}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50">
            {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Save Product"}
          </button>
        </div>
      </Modal>

      <ProductPictureViewer product={viewing} onClose={() => setViewing(null)} />
      <DocumentPreview doc={catalogue} onClose={() => setCatalogue(null)} />
    </div>
  );
};

export default Products;
