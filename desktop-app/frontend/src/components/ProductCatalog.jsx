import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Edit, Eye, EyeOff, Package, Trash2 } from "lucide-react";
import apiClient from "../api/client";
import InlineEdit from "./InlineEdit";
import { SelectBox } from "./BulkSelect";
import { checkPictureFile, savePictureChange } from "./ProductPicture";
import { money } from "../utils/format";
import { categoryOf, isActive, isInStock, priceExcl } from "../utils/products";

// Saves one or more product fields straight away; the list updates at once
// and rolls back if the save fails.
export function useProductPatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, changes }) => (await apiClient.patch(`/products/${id}`, changes)).data,
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey: ["products"] });
      const previous = queryClient.getQueryData(["products"]);
      queryClient.setQueryData(["products"], (old) => (old || []).map((p) => (p.id === id ? { ...p, ...changes } : p)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["products"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

const Switch = ({ checked, onChange, label }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
    className="flex min-h-11 items-center gap-2 text-xs font-medium text-slate-600 focus:outline-none sm:min-h-0 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
    <span className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${checked ? "justify-end bg-emerald-500" : "justify-start bg-slate-300"}`}>
      <span className="h-4 w-4 rounded-full bg-white shadow" />
    </span>
    {label}
  </button>
);

const CardPicture = ({ product, src, onOpen }) => {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const upload = useMutation({
    mutationFn: (file) => savePictureChange(product.id, { file }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["product-thumbnails"] }),
  });
  const pick = (file) => {
    if (!file) return;
    const problem = checkPictureFile(file);
    setError(problem);
    if (!problem) upload.mutate(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
      className={`relative flex h-52 items-center justify-center overflow-hidden rounded-t-xl sm:h-36 bg-slate-50 ${dragging ? "ring-2 ring-inset ring-emerald-500" : ""}`}
    >
      {src ? (
        <button type="button" onClick={() => onOpen(product)} className="h-full w-full" title={`View picture of ${product.name}`}>
          <img src={src} alt={product.name} className="h-full w-full object-contain" />
        </button>
      ) : (
        <div className="flex flex-col items-center gap-1 text-xs text-slate-400">
          <Package size={28} aria-hidden="true" />
          <span className="sm:hidden">Tap the camera to add a picture</span>
          <span className="hidden sm:inline">Drop a picture here</span>
        </div>
      )}
      <button type="button" onClick={() => inputRef.current?.click()} title={src ? "Change picture" : "Add picture"}
        aria-label={`${src ? "Change" : "Add"} picture for ${product.name}`}
        className="absolute right-2 top-2 rounded-full bg-white/90 p-2.5 text-slate-600 sm:p-1.5 shadow hover:text-emerald-700">
        <Camera size={15} />
      </button>
      {upload.isPending && <span className="absolute inset-x-0 bottom-0 bg-white/80 py-1 text-center text-xs text-slate-600">Uploading…</span>}
      {error && <span role="alert" className="absolute inset-x-0 bottom-0 bg-red-50 px-2 py-1 text-center text-xs text-red-700">{error}</span>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
};

const ProductCard = ({ product, thumb, onOpenPicture, onEdit, onDelete, priceLabel, selection }) => {
  const patch = useProductPatch();
  const save = (field) => (value) => patch.mutateAsync({ id: product.id, changes: { [field]: value } });
  const hidden = !isActive(product);

  return (
    <article aria-label={product.name}
      className={`relative flex flex-col rounded-xl border bg-white shadow-sm ${selection?.has(product.id) ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200"} ${hidden ? "opacity-60" : ""}`}>
      {selection && <SelectBox selection={selection} id={product.id} label={`Select ${product.name}`} className="absolute left-2 top-2 z-10 h-6! w-6! bg-white sm:h-4! sm:w-4!" />}
      <CardPicture product={product} src={thumb} onOpen={onOpenPicture} />
      <div className="flex-1 space-y-1.5 p-3 text-sm">
        <InlineEdit value={product.name} onSave={save("name")} label="Name" required className="text-base font-semibold text-slate-800 sm:text-sm" />
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <InlineEdit value={product.code} onSave={save("code")} label="Code" placeholder="Add code" />
          <span aria-hidden="true">·</span>
          <InlineEdit value={product.packaging} onSave={save("packaging")} label="Packaging" placeholder="Add packaging" />
        </div>
        <InlineEdit value={product.description} onSave={save("description")} label="Description" multiline
          placeholder="Add a description" className="text-slate-600" />
        <div className="flex items-end justify-between gap-2 pt-1">
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <InlineEdit value={product.price} onSave={save("price")} label={`${priceLabel} incl VAT`} type="number" required format={money}
                className="text-xl font-bold text-slate-800 sm:text-base" />
              <span className="text-xs text-slate-500">incl. VAT</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <InlineEdit value={priceExcl(product)} onSave={save("price_excl_vat")} label={`${priceLabel} excl VAT`} type="number" format={money}
                className="text-base text-slate-600 sm:text-sm" />
              <span className="text-xs text-slate-500">excl. VAT</span>
            </div>
          </div>
          <InlineEdit value={product.category} onSave={save("category")} label="Category" placeholder="No category"
            listId="product-categories" className="text-xs text-slate-500" />
        </div>
        {hidden && <p className="text-xs font-medium text-slate-500">Hidden from the catalogue and pickers</p>}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <Switch checked={isInStock(product)} onChange={(v) => save("in_stock")(v)} label={isInStock(product) ? "In stock" : "Out of stock"} />
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => save("is_active")(hidden)} title={hidden ? "Show again" : "Hide (keeps old invoices intact)"}
            aria-label={`${hidden ? "Show" : "Hide"} ${product.name}`} className="p-2.5 text-slate-400 hover:text-emerald-600 sm:p-1.5">
            {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button type="button" onClick={() => onEdit(product)} title="All details" aria-label={`Edit all details of ${product.name}`}
            className="p-2.5 text-slate-400 hover:text-emerald-600 sm:p-1.5"><Edit size={16} /></button>
          <button type="button" onClick={() => onDelete(product)} title="Delete" data-admin-only aria-label={`Delete ${product.name}`}
            className="p-2.5 text-slate-400 hover:text-red-600 sm:p-1.5"><Trash2 size={16} /></button>
        </div>
      </footer>
    </article>
  );
};

// Products grouped under category headings. `products` is already filtered
// by the page's search/category/hidden controls.
const ProductCatalog = ({ products, thumbnails, onOpenPicture, onEdit, onDelete, priceLabel = "Price", selection }) => {
  const groups = useMemo(() => {
    const map = new Map();
    [...products]
      .sort((a, b) => categoryOf(a).localeCompare(categoryOf(b)) || a.name.localeCompare(b.name))
      .forEach((p) => map.set(categoryOf(p), [...(map.get(categoryOf(p)) || []), p]));
    return [...map.entries()];
  }, [products]);

  if (!groups.length) return <p className="p-12 text-center text-slate-400">No products match.</p>;
  return (
    <div className="space-y-8 p-3 sm:p-4">
      {groups.map(([name, items]) => (
        <section key={name} aria-labelledby={`cat-${name}`}>
          <h3 id={`cat-${name}`} className="mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-1 text-lg font-bold text-slate-800">
            {name} <span className="text-sm font-normal text-slate-400">{items.length}</span>
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} thumb={thumbnails[p.id]} onOpenPicture={onOpenPicture}
                onEdit={onEdit} onDelete={onDelete} priceLabel={priceLabel} selection={selection} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default ProductCatalog;
