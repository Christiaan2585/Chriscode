import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calculator as CalcIcon,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  CheckCircle2,
  ShoppingCart,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  AlertTriangle,
  RotateCcw,
  Search,
} from "lucide-react";
import apiClient from "../api/client";
import { useNavigate } from "react-router-dom";

const SPECIES_OPTIONS = ["Cows", "Sheep", "Goats", "Horses", "Pigs"];

const CONFIDENCE_META = {
  high: { label: "Verified from product label", badge: "bg-emerald-100 text-emerald-700", Icon: ShieldCheck },
  medium: { label: "Partially verified — double-check the label", badge: "bg-amber-100 text-amber-700", Icon: ShieldAlert },
  low: { label: "Low confidence — verify against the physical label before dosing", badge: "bg-red-100 text-red-700", Icon: ShieldAlert },
  unverified: { label: "Not yet verified — check the physical label", badge: "bg-slate-200 text-slate-600", Icon: ShieldQuestion },
};

const BASIS_LABEL = {
  per_kg: "Dosed by bodyweight",
  per_head: "Fixed dose per animal",
  per_quarter: "Dosed per udder quarter (intramammary)",
  label_only: "No computed rate — dose from label",
  manual: "No dosing data on file — enter manually",
};

// A plain HTML <select> is a native OS popup - with a product catalogue this
// long (dozens of products), that popup is exactly the kind of control that
// intermittently stops responding to the first click inside an Electron
// window (a well-known Electron/Chromium quirk, worse right after a step
// transition just re-rendered the page). Rendering our own list here avoids
// that failure mode entirely, and searching a long list is easier anyway.
function ProductDropdown({ products, dosingByProduct, species, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, query]);

  const selected = products.find((p) => p.id == value);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full p-4 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none bg-slate-50 transition-all text-lg flex items-center justify-between text-left"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? selected.name : "-- Choose a Product --"}
        </span>
        <ChevronDown size={20} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full bg-white border-2 border-slate-100 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full outline-none text-sm py-1"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((p) => {
              const hasRule = !!dosingByProduct[p.id]?.[species];
              const isSelected = p.id == value;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(String(p.id));
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-emerald-50 transition-colors ${
                    isSelected ? "bg-emerald-50 font-semibold text-emerald-800" : "text-slate-700"
                  }`}
                >
                  <span className={hasRule ? "text-emerald-600" : "text-slate-300"}>{hasRule ? "✓" : "—"}</span>
                  <span className="flex-1">{p.name}</span>
                  {!hasRule && <span className="text-xs text-slate-400">manual entry</span>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No products match "{query}".</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const emptyManual = { dose: "" };

const Calculator = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [species, setSpecies] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [animalCount, setAnimalCount] = useState("");
  const [avgWeight, setAvgWeight] = useState("");
  const [quarters, setQuarters] = useState(4);
  const [manual, setManual] = useState(emptyManual);

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await apiClient.get("/products/")).data,
  });

  const { data: dosingRules, isLoading: dosingLoading } = useQuery({
    queryKey: ["dosing"],
    queryFn: async () => (await apiClient.get("/dosing/")).data,
  });

  const isLoading = productsLoading || dosingLoading;

  // productId -> { species -> rule }
  const dosingByProduct = useMemo(() => {
    const map = {};
    (dosingRules || []).forEach((r) => {
      if (!map[r.product_id]) map[r.product_id] = {};
      map[r.product_id][r.species] = r;
    });
    return map;
  }, [dosingRules]);

  const productsForSpecies = useMemo(() => {
    if (!products) return [];
    if (!species) return products;
    const withRule = [...products]
      .filter((p) => dosingByProduct[p.id]?.[species])
      .sort((a, b) => a.name.localeCompare(b.name));
    const withoutRule = [...products]
      .filter((p) => !dosingByProduct[p.id]?.[species])
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...withRule, ...withoutRule];
  }, [products, species, dosingByProduct]);

  const selectedProduct = products?.find((p) => p.id == selectedProductId);
  const rule = selectedProduct && species ? dosingByProduct[selectedProduct.id]?.[species] : null;
  const hasComputableRule = rule && (rule.basis === "per_kg" || rule.basis === "per_head" || rule.basis === "per_quarter");
  const basis = hasComputableRule ? rule.basis : "manual";

  const perAnimalAmount = useMemo(() => {
    if (basis === "per_kg") {
      if (!rule?.dose_value || !avgWeight) return 0;
      return rule.dose_value * Number(avgWeight);
    }
    if (basis === "per_head") {
      return rule?.dose_value || 0;
    }
    if (basis === "per_quarter") {
      return (rule?.dose_value || 0) * (Number(quarters) || 0);
    }
    return Number(manual.dose) || 0;
  }, [basis, rule, avgWeight, quarters, manual]);

  const totalAmount = perAnimalAmount * (Number(animalCount) || 0);
  const doseUnit = basis === "manual" ? (selectedProduct?.unit || "unit") : (rule?.dose_unit || selectedProduct?.unit || "unit");

  const packSize = selectedProduct?.pack_size;
  // Math.max(0, ...) matters here, not just for tidiness: when totalAmount is
  // still 0 (nothing entered yet), (0 - 1e-9) / packSize is a tiny negative
  // number, and Math.ceil() of that is -0 - which then multiplies through to
  // an ugly, confusing "R -0.00" total cost before the user has typed anything.
  const packsNeeded = packSize ? Math.max(0, Math.ceil((totalAmount - 1e-9) / packSize)) : null;
  const totalCost = packsNeeded != null
    ? packsNeeded * (selectedProduct?.price || 0)
    : (selectedProduct?.price || 0) * totalAmount;

  const confidenceKey = basis === "manual" ? "unverified" : (rule?.confidence || "unverified");
  const confidenceMeta = CONFIDENCE_META[confidenceKey] || CONFIDENCE_META.unverified;

  const canContinueStep1 = !!species;
  const canContinueStep2 = !!selectedProductId;
  const canContinueStep3 =
    Number(animalCount) > 0 &&
    (basis === "per_head" ||
      basis === "per_quarter" ||
      (basis === "per_kg" && Number(avgWeight) > 0) ||
      (basis === "manual" && Number(manual.dose) > 0));

  const reset = () => {
    setStep(1);
    setSpecies("");
    setSelectedProductId("");
    setAnimalCount("");
    setAvgWeight("");
    setQuarters(4);
    setManual(emptyManual);
  };

  const handleCreateQuote = () => {
    navigate("/quotes", {
      state: {
        presetItem: {
          product_id: selectedProduct.id,
          quantity: packsNeeded || Math.max(1, Math.ceil(totalAmount) || 1),
          unit_price: selectedProduct.price,
        },
      },
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading products and dosing data...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-4 mb-4">
        <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg">
          <CalcIcon size={32} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Product Calculator</h2>
          <p className="text-slate-500">Species-aware dosage and cost estimation</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mb-4">
        {[1, 2, 3].map((i) => (
          <React.Fragment key={i}>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                step === i ? "bg-emerald-600 text-white" : step > i ? "bg-emerald-200 text-emerald-700" : "bg-slate-200 text-slate-500"
              }`}
            >
              {i}
            </div>
            {i < 3 && <div className={`w-16 h-1 rounded-full transition-all ${step > i ? "bg-emerald-600" : "bg-slate-200"}`}></div>}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 min-h-[420px]">
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-800">Step 1: Animal Type</h3>
              <p className="text-sm text-slate-500">Which species are you treating? This filters products to the ones with a dosing rate for that species.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SPECIES_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpecies(s);
                      setSelectedProductId("");
                    }}
                    className={`py-5 rounded-2xl font-bold border-2 transition-all ${
                      species === s
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-lg"
                        : "bg-slate-50 border-slate-100 text-slate-600 hover:border-emerald-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                disabled={!canContinueStep1}
                onClick={() => setStep(2)}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
              >
                Continue <ChevronRight size={20} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-800">Step 2: Select Product</h3>
              <div>
                <label className="block text-sm font-medium text-slate-500 mb-2">
                  Which product are you using for {species}?
                </label>
                <ProductDropdown
                  products={productsForSpecies}
                  dosingByProduct={dosingByProduct}
                  species={species}
                  value={selectedProductId}
                  onChange={setSelectedProductId}
                />
                {selectedProduct && !hasComputableRule && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <span>
                      {rule?.label_text
                        ? `No auto-calculated rate for ${species.toLowerCase()}. Label note: "${rule.label_text}"`
                        : `No dosing data found for ${species.toLowerCase()} on this product yet. You'll enter the dose per animal by hand from the physical label.`}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(1)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                  <ChevronLeft size={20} /> Back
                </button>
                <button
                  disabled={!canContinueStep2}
                  onClick={() => setStep(3)}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-800">Step 3: Animals &amp; Dose</h3>

              <div>
                <label className="block text-sm font-medium text-slate-500 mb-2">How many {species.toLowerCase()} are being treated?</label>
                <input
                  type="number"
                  min="0"
                  value={animalCount}
                  onChange={(e) => setAnimalCount(e.target.value)}
                  className="w-full p-4 text-3xl text-center border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none transition-all font-bold"
                  placeholder="0"
                />
              </div>

              {basis === "per_kg" && (
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">
                    Average bodyweight per animal (kg)
                    <span className="ml-2 text-xs text-slate-400">rate: {rule.dose_value} {rule.dose_unit}/kg</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={avgWeight}
                    onChange={(e) => setAvgWeight(e.target.value)}
                    className="w-full p-4 text-2xl text-center border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none transition-all font-bold"
                    placeholder="e.g. 350"
                  />
                </div>
              )}

              {basis === "per_head" && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm text-emerald-800">
                  Fixed dose: <strong>{rule.dose_value} {rule.dose_unit}</strong> per animal, regardless of weight.
                </div>
              )}

              {basis === "per_quarter" && (
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">
                    Quarters treated per animal
                    <span className="ml-2 text-xs text-slate-400">rate: {rule.dose_value} {rule.dose_unit} each</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={quarters}
                    onChange={(e) => setQuarters(e.target.value)}
                    className="w-full p-4 text-2xl text-center border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none transition-all font-bold"
                  />
                  <p className="text-xs text-slate-400 mt-1">Usually 4 (all quarters) for a dry-cow / mastitis tube.</p>
                </div>
              )}

              {basis === "manual" && (
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">
                    Dose per animal ({selectedProduct?.unit || "unit"}) — from the product label
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={manual.dose}
                    onChange={(e) => setManual({ dose: e.target.value })}
                    className="w-full p-4 text-2xl text-center border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none transition-all font-bold"
                    placeholder="0"
                  />
                  {rule?.notes && <p className="text-xs text-slate-400 mt-2">Note on file: {rule.notes}</p>}
                </div>
              )}

              <div className="flex gap-4">
                <button onClick={() => setStep(2)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                  <ChevronLeft size={20} /> Back
                </button>
                <button
                  disabled={!canContinueStep3}
                  onClick={() => setStep(4)}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all disabled:bg-slate-300 flex items-center justify-center gap-2"
                >
                  Calculate <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="p-4 bg-emerald-100 text-emerald-600 rounded-full">
                  <CheckCircle2 size={48} />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-800">Calculation Complete!</h3>
              <p className="text-slate-500">Review the details on the right, then add it to a client quote.</p>
              <div className="flex gap-4">
                <button onClick={reset} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                  <RotateCcw size={18} /> Restart
                </button>
                <button
                  onClick={handleCreateQuote}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} /> Create Quote
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-emerald-900 text-white p-8 rounded-3xl shadow-xl flex flex-col gap-6">
          <div className="space-y-1">
            <span className="text-emerald-300 text-xs font-medium uppercase tracking-wider">Total Amount Required</span>
            <div className="text-4xl font-black tracking-tight">
              {totalAmount ? totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}{" "}
              <span className="text-lg font-light text-emerald-300">{doseUnit}</span>
            </div>
            {packsNeeded != null && (
              <div className="text-sm text-emerald-300">
                ≈ {packsNeeded} pack{packsNeeded === 1 ? "" : "s"} of {packSize} {doseUnit} each
              </div>
            )}
          </div>

          <div className="w-full h-px bg-emerald-800"></div>

          <div className="space-y-1">
            <span className="text-emerald-300 text-xs font-medium uppercase tracking-wider">Estimated Total Cost</span>
            <div className="text-3xl font-bold">
              R {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {selectedProduct && (
            <>
              <div className="w-full h-px bg-emerald-800"></div>
              <div className="space-y-3 text-left text-sm">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-xs ${confidenceMeta.badge}`}>
                  <confidenceMeta.Icon size={14} />
                  {confidenceMeta.label}
                </div>
                <p className="text-emerald-200">
                  <span className="text-emerald-400 font-semibold">Basis: </span>
                  {BASIS_LABEL[basis]}
                </p>
                {rule?.route && (
                  <p className="text-emerald-200">
                    <span className="text-emerald-400 font-semibold">Route: </span>
                    {rule.route}
                  </p>
                )}
                {rule?.label_text && (
                  <p className="text-emerald-200">
                    <span className="text-emerald-400 font-semibold">Label: </span>
                    {rule.label_text}
                  </p>
                )}
                {(rule?.withdrawal_meat_days != null || rule?.withdrawal_milk_days != null) && (
                  <p className="text-emerald-200">
                    <span className="text-emerald-400 font-semibold">Withdrawal: </span>
                    {rule?.withdrawal_meat_days != null ? `${rule.withdrawal_meat_days}d meat` : ""}
                    {rule?.withdrawal_meat_days != null && rule?.withdrawal_milk_days != null ? " / " : ""}
                    {rule?.withdrawal_milk_days != null ? `${rule.withdrawal_milk_days}d milk` : ""}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="mt-auto pt-4 border-t border-emerald-800 flex items-start gap-2 text-xs text-emerald-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>This is a calculation aid, not a substitute for the product's own label or insert. Always confirm the dose against the physical packaging before administering, especially for anything flagged low-confidence or unverified above.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
