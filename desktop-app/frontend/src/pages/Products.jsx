import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Search, Trash2, Plus, Edit } from "lucide-react";
import apiClient from "../api/client";
import Modal from "../components/Modal";

const formatMoney = (value) =>
  typeof value === "number"
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const emptyProduct = {
  name: "", price: "", unit: "unit", dosage: 0,
  code: "", category: "", pack_size: "", packaging: "", cost: "", price_excl_vat: "",
};

// Fields imported from a supplier price list carry cost/excl-VAT alongside the
// final "price" (incl VAT) - the same three-value pricing the /products/import
// endpoint computes, kept in sync here so an edited cost still shows a sane
// excl/incl VAT split rather than going stale.
const recomputeFromCost = (cost) => {
  const c = Number(cost);
  if (Number.isNaN(c)) return {};
  const exclVat = Math.round(c * 1.25 * 10000) / 10000;
  const inclVat = Math.round(exclVat * 1.15 * 10000) / 10000;
  return { price_excl_vat: exclVat, price: inclVat };
};

const Products = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyProduct);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await apiClient.get("/products/")).data,
  });

  const addMutation = useMutation({
    mutationFn: async (data) => (await apiClient.post("/products/", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => (await apiClient.put(`/products/${id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => (await apiClient.delete(`/products/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyProduct);
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyProduct);
    setIsModalOpen(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name || "",
      price: p.price ?? "",
      unit: p.unit || "unit",
      dosage: p.dosage ?? 0,
      code: p.code || "",
      category: p.category || "",
      pack_size: p.pack_size ?? "",
      packaging: p.packaging || "",
      cost: p.cost ?? "",
      price_excl_vat: p.price_excl_vat ?? "",
    });
    setIsModalOpen(true);
  };

  const handleCostChange = (value) => {
    const derived = recomputeFromCost(value);
    setForm((prev) => ({ ...prev, cost: value, ...derived }));
  };

  const buildPayload = () => ({
    name: form.name,
    price: Number(form.price),
    unit: form.unit || "unit",
    dosage: Number(form.dosage) || 0,
    code: form.code || null,
    category: form.category || null,
    pack_size: form.pack_size === "" ? null : Number(form.pack_size),
    packaging: form.packaging || null,
    cost: form.cost === "" ? null : Number(form.cost),
    price_excl_vat: form.price_excl_vat === "" ? null : Number(form.price_excl_vat),
  });

  const handleSave = () => {
    const payload = buildPayload();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const categories = useMemo(() => {
    const list = products || [];
    const set = new Set(list.map((p) => p.category).filter(Boolean));
    const hasUncategorised = list.some((p) => !p.category);
    const names = Array.from(set).sort();
    if (hasUncategorised) names.push("Uncategorised");
    return ["All", ...names];
  }, [products]);

  const filtered = useMemo(() => {
    return (products || []).filter((p) => {
      const matchesCategory =
        category === "All" ||
        (category === "Uncategorised" ? !p.category : p.category === category);
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        (p.code && String(p.code).toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [products, search, category]);

  const handleDelete = (product) => {
    if (window.confirm(`Delete "${product.name}"? This can't be undone.`)) {
      deleteMutation.mutate(product.id);
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading products...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Products</h2>
          <p className="text-slate-500">
            {products?.length || 0} products — imported from your price list plus anything added manually
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} /> Add Product
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
              <tr>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 font-medium">Code</th>
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-6 py-3 font-medium">Pack Size</th>
                <th className="px-6 py-3 font-medium">Packaging</th>
                <th className="px-6 py-3 font-medium text-right">Cost</th>
                <th className="px-6 py-3 font-medium text-right">Excl VAT</th>
                <th className="px-6 py-3 font-medium text-right">Incl VAT</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Package size={16} />
                      </div>
                      <span className="font-medium text-slate-700">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">{p.code || "—"}</td>
                  <td className="px-6 py-4 text-slate-500 text-sm">{p.category || "—"}</td>
                  <td className="px-6 py-4 text-slate-500 text-sm">{p.pack_size ?? "—"}</td>
                  <td className="px-6 py-4 text-slate-500 text-sm">{p.packaging || "—"}</td>
                  <td className="px-6 py-4 text-slate-600 text-sm text-right">
                    {p.cost != null ? `R ${formatMoney(p.cost)}` : "—"}
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm text-right">
                    {p.price_excl_vat != null ? `R ${formatMoney(p.price_excl_vat)}` : "—"}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-800 text-sm text-right">
                    R {formatMoney(p.price)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEditModal(p)}
                        className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    {products?.length ? "No products match your search." : "No products yet - import a price list from Settings, or add one manually."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? "Edit Product" : "Add Product"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Entstowwe / Vaccines"
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pack Size (ml/gr)</label>
              <input
                type="number"
                value={form.pack_size}
                onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Packaging</label>
              <input
                type="text"
                value={form.packaging}
                onChange={(e) => setForm({ ...form, packaging: e.target.value })}
                placeholder="e.g. 6 x 500 ml"
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cost (excl VAT)</label>
              <input
                type="number"
                value={form.cost}
                onChange={(e) => handleCostChange(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Selling excl VAT</label>
              <input
                type="number"
                value={form.price_excl_vat}
                onChange={(e) => setForm({ ...form, price_excl_vat: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Selling incl VAT</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 -mt-2">
            Editing cost auto-fills the standard markup (excl = cost × 1.25, incl = excl × 1.15) - you can still override either selling price by hand.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Dosage (for the Product Calculator)</label>
            <input
              type="number"
              value={form.dosage}
              onChange={(e) => setForm({ ...form, dosage: Number(e.target.value) })}
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <button
            disabled={!form.name || !form.price || addMutation.isPending || updateMutation.isPending}
            onClick={handleSave}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50"
          >
            {editingId
              ? (updateMutation.isPending ? "Saving..." : "Save Changes")
              : (addMutation.isPending ? "Saving..." : "Save Product")}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Products;
