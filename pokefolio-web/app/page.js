"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Plus, TrendingUp, TrendingDown, ExternalLink, X, Trash2, Pencil } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const TABLE = "cards";

const CONDITIONS = [
  { value: "mint", label: "Mint (M)" },
  { value: "nearmint", label: "Near Mint (NM)" },
  { value: "excellent", label: "Excellent (EX)" },
  { value: "good", label: "Good (GD)" },
  { value: "played", label: "Played (PL)" },
  { value: "poor", label: "Poor (PO)" },
];

const EMPTY_FORM = {
  name: "",
  set: "",
  number: "",
  condition: "nearmint",
  purchasePrice: "",
  currentPrice: "",
  quantity: "1",
};

function formatEUR(n) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function cardmarketUrl(name) {
  const q = encodeURIComponent((name || "").trim());
  return `https://www.cardmarket.com/fr/Pokemon/Products/Search?category=-1&searchString=${q}&category=-1&searchMode=v2`;
}

async function searchTcgdexCard(name, number) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) return { status: "empty" };

  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(trimmedName)}`);
    if (!res.ok) return { status: "error" };
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) return { status: "notfound" };

    let candidates = list;
    if (number) {
      const num = String(number).split("/")[0].trim();
      const filtered = list.filter((c) => String(c.localId) === num);
      if (filtered.length > 0) candidates = filtered;
    }

    const best = candidates[0];
    const detailRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${best.id}`);
    if (!detailRes.ok) return { status: "error" };
    const detail = await detailRes.json();

    const cm = detail.pricing && detail.pricing.cardmarket;
    if (!cm) return { status: "noprice", card: detail };

    return {
      status: "ok",
      card: detail,
      price: cm.trend || cm.avg30 || cm.avg7 || cm.avg || cm.low || null,
      matchCount: candidates.length,
    };
  } catch (e) {
    return { status: "error" };
  }
}

export default function PokeFolioPage() {
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [priceLookup, setPriceLookup] = useState(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Chargement initial depuis Supabase
  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from(TABLE)
        .select("*")
        .order("added_at", { ascending: false });
      if (err) {
        setError("Impossible de charger la collection : " + err.message);
      } else {
        setCards(data || []);
      }
      setLoaded(true);
    }
    load();
  }, []);

  function openAddForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
    setPriceLookup(null);
    setShowForm(true);
  }

  function openEditForm(card) {
    setForm({
      name: card.name,
      set: card.set || "",
      number: card.number || "",
      condition: card.condition,
      purchasePrice: String(card.purchase_price),
      currentPrice: String(card.current_price),
      quantity: String(card.quantity || 1),
    });
    setEditingId(card.id);
    setFormError("");
    setPriceLookup(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
    setPriceLookup(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Le nom de la carte est obligatoire.");
      return;
    }
    setFormError("");
    setSaving(true);

    const purchasePrice = parseFloat(String(form.purchasePrice).replace(",", ".")) || 0;
    const currentPrice = parseFloat(String(form.currentPrice).replace(",", ".")) || 0;
    const quantity = Math.max(1, parseInt(String(form.quantity).replace(",", "."), 10) || 1);

    const payload = {
      name: form.name.trim(),
      set: form.set.trim(),
      number: form.number.trim(),
      condition: form.condition,
      purchase_price: purchasePrice,
      current_price: currentPrice,
      quantity,
    };

    if (editingId) {
      const { data, error: err } = await supabase
        .from(TABLE)
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();
      if (err) {
        setFormError("Erreur lors de la modification : " + err.message);
        setSaving(false);
        return;
      }
      setCards((prev) => prev.map((c) => (c.id === editingId ? data : c)));
    } else {
      const { data, error: err } = await supabase
        .from(TABLE)
        .insert({ ...payload, added_at: new Date().toISOString() })
        .select()
        .single();
      if (err) {
        setFormError("Erreur lors de l'ajout : " + err.message);
        setSaving(false);
        return;
      }
      setCards((prev) => [data, ...prev]);
    }
    setSaving(false);
    closeForm();
  }

  async function handleLookupPrice() {
    if (!form.name.trim()) return;
    setLooking(true);
    setPriceLookup(null);
    const result = await searchTcgdexCard(form.name, form.number);
    setPriceLookup(result);
    setLooking(false);
  }

  async function handleDelete(id) {
    const { error: err } = await supabase.from(TABLE).delete().eq("id", id);
    if (err) {
      setError("Impossible de supprimer cette carte : " + err.message);
      return;
    }
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  const stats = useMemo(() => {
    const totalPaid = cards.reduce((s, c) => s + c.purchase_price * (c.quantity || 1), 0);
    const totalValue = cards.reduce((s, c) => s + c.current_price * (c.quantity || 1), 0);
    const diff = totalValue - totalPaid;
    const pct = totalPaid > 0 ? (diff / totalPaid) * 100 : 0;
    const totalCards = cards.reduce((s, c) => s + (c.quantity || 1), 0);
    return { totalPaid, totalValue, diff, pct, totalCards };
  }, [cards]);

  const filteredCards = useMemo(() => {
    const sorted = [...cards].sort((a, b) => {
      const da = (a.current_price - a.purchase_price) * (a.quantity || 1);
      const db = (b.current_price - b.purchase_price) * (b.quantity || 1);
      return db - da;
    });
    if (filter === "gain") return sorted.filter((c) => c.current_price >= c.purchase_price);
    if (filter === "loss") return sorted.filter((c) => c.current_price < c.purchase_price);
    return sorted;
  }, [cards, filter]);

  const isPositive = stats.diff >= 0;

  return (
    <div className="min-h-screen bg-[#1A1D24] text-[#E8E6E1]">
      {/* Header */}
      <header className="border-b border-[#2E323C] sticky top-0 bg-[#1A1D24]/95 backdrop-blur z-20">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#FFCC33] flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[#1A1D24]" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight">PokéFolio</h1>
          </div>
          <button
            onClick={openAddForm}
            className="flex items-center gap-1.5 bg-[#FFCC33] text-[#1A1D24] font-semibold text-sm px-4 py-2 rounded-lg hover:bg-[#FFD75E] transition-colors"
          >
            <Plus size={16} strokeWidth={2.5} />
            Ajouter une carte
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {/* Hero stats */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="sm:col-span-1 bg-[#242832] rounded-2xl p-6 border border-[#2E323C]">
            <p className="text-xs uppercase tracking-wider text-[#8A8F9C] mb-2 font-medium">Valeur totale</p>
            <p className="font-display text-3xl font-bold font-mono-pf">{formatEUR(stats.totalValue)}</p>
            <p className="text-xs text-[#8A8F9C] mt-2">{stats.totalCards} carte{stats.totalCards !== 1 ? "s" : ""}</p>
          </div>
          <div className="sm:col-span-1 bg-[#242832] rounded-2xl p-6 border border-[#2E323C]">
            <p className="text-xs uppercase tracking-wider text-[#8A8F9C] mb-2 font-medium">Investi</p>
            <p className="font-display text-3xl font-bold font-mono-pf text-[#C7C4BD]">{formatEUR(stats.totalPaid)}</p>
            <p className="text-xs text-[#8A8F9C] mt-2">Prix d'achat cumulés</p>
          </div>
          <div className={`sm:col-span-1 rounded-2xl p-6 border ${isPositive ? "bg-[#1B2E22] border-[#2A4A35]" : "bg-[#2E1F1F] border-[#4A2A2A]"}`}>
            <p className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: isPositive ? "#7FE3A4" : "#F2A0A0" }}>
              {isPositive ? "Plus-value" : "Moins-value"}
            </p>
            <div className="flex items-center gap-2">
              {isPositive ? <TrendingUp size={22} className="text-[#4ADE80]" /> : <TrendingDown size={22} className="text-[#F87171]" />}
              <p className={`font-display text-3xl font-bold font-mono-pf ${isPositive ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                {isPositive ? "+" : ""}{formatEUR(stats.diff)}
              </p>
            </div>
            <p className={`text-xs mt-2 font-mono-pf ${isPositive ? "text-[#7FE3A4]" : "text-[#F2A0A0]"}`}>
              {stats.totalPaid > 0 ? `${isPositive ? "+" : ""}${stats.pct.toFixed(1)}%` : "—"}
            </p>
          </div>
        </section>

        {/* Filters */}
        {cards.length > 0 && (
          <div className="flex items-center gap-2 mb-5">
            {[
              { key: "all", label: "Toutes" },
              { key: "gain", label: "En hausse" },
              { key: "loss", label: "En baisse" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-sm px-3.5 py-1.5 rounded-full border transition-colors ${
                  filter === f.key ? "bg-[#FFCC33] text-[#1A1D24] border-[#FFCC33] font-semibold" : "border-[#2E323C] text-[#8A8F9C] hover:border-[#3A3F4B]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Grid / Empty state */}
        {loaded && cards.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-[#2E323C] rounded-2xl">
            <p className="font-display text-lg font-semibold mb-1.5">Le classeur est vide</p>
            <p className="text-sm text-[#8A8F9C] mb-5">Ajoute ta première carte pour commencer à suivre sa valeur.</p>
            <button onClick={openAddForm} className="inline-flex items-center gap-1.5 bg-[#FFCC33] text-[#1A1D24] font-semibold text-sm px-4 py-2 rounded-lg hover:bg-[#FFD75E] transition-colors">
              <Plus size={16} strokeWidth={2.5} />
              Ajouter une carte
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCards.map((card) => {
              const qty = card.quantity || 1;
              const diff = (card.current_price - card.purchase_price) * qty;
              const pct = card.purchase_price > 0 ? ((card.current_price - card.purchase_price) / card.purchase_price) * 100 : 0;
              const pos = diff >= 0;
              const condLabel = CONDITIONS.find((c) => c.value === card.condition)?.label || card.condition;
              return (
                <article key={card.id} className="bg-[#242832] rounded-2xl overflow-hidden border border-[#2E323C] flex" style={{ borderLeft: `4px solid ${pos ? "#4ADE80" : "#F87171"}` }}>
                  <div className="flex-1 p-4 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <h3 className="font-display font-semibold text-base leading-tight">{card.name}</h3>
                        <p className="text-xs text-[#8A8F9C] mt-0.5">
                          {card.set}{card.number ? ` · #${card.number}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEditForm(card)} aria-label="Modifier" className="p-1.5 rounded-md text-[#8A8F9C] hover:text-[#E8E6E1] hover:bg-[#2E323C] transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(card.id)} aria-label="Supprimer" className="p-1.5 rounded-md text-[#8A8F9C] hover:text-[#F87171] hover:bg-[#2E323C] transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] uppercase tracking-wide text-[#6B707C] mb-3">
                      {condLabel}{qty > 1 ? ` · ×${qty}` : ""}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#6B707C]">Achat</p>
                        <p className="font-mono-pf text-sm text-[#C7C4BD]">{formatEUR(card.purchase_price)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#6B707C]">Actuel</p>
                        <p className="font-mono-pf text-sm font-semibold">{formatEUR(card.current_price)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-auto mb-3">
                      {pos ? <TrendingUp size={14} className="text-[#4ADE80]" /> : <TrendingDown size={14} className="text-[#F87171]" />}
                      <span className={`font-mono-pf text-sm font-semibold ${pos ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                        {pos ? "+" : ""}{formatEUR(diff)}
                      </span>
                      <span className={`font-mono-pf text-xs ${pos ? "text-[#4ADE80]/70" : "text-[#F87171]/70"}`}>
                        ({pos ? "+" : ""}{pct.toFixed(1)}%)
                      </span>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-[#2E323C]">
                      <button type="button" onClick={() => window.open(cardmarketUrl(card.name), "_blank", "noopener,noreferrer")} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium text-[#8A8F9C] hover:text-[#E8E6E1] py-1.5 rounded-md hover:bg-[#2E323C] transition-colors">
                        Voir sur Cardmarket <ExternalLink size={11} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {error && <p className="text-sm text-[#F87171] mt-4">{error}</p>}
      </main>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-30" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="bg-white rounded-2xl border border-[#E5E3DD] w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#E5E3DD] sticky top-0 bg-white">
              <h2 className="font-display font-bold text-lg text-[#1A1D24]">{editingId ? "Modifier la carte" : "Ajouter une carte"}</h2>
              <button onClick={closeForm} aria-label="Fermer" className="p-1.5 rounded-md text-[#8A8F9C] hover:text-[#1A1D24] hover:bg-[#F0EEE8] transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#6B707C] mb-1.5">Nom de la carte *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Charizard"
                  className="w-full bg-white border border-[#D8D6D0] text-[#1A1D24] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#E0A800] transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B707C] mb-1.5">Set</label>
                  <input
                    type="text"
                    value={form.set}
                    onChange={(e) => setForm({ ...form, set: e.target.value })}
                    placeholder="Base Set"
                    className="w-full bg-white border border-[#D8D6D0] text-[#1A1D24] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#E0A800] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B707C] mb-1.5">Numéro</label>
                  <input
                    type="text"
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                    placeholder="4/102"
                    className="w-full bg-white border border-[#D8D6D0] text-[#1A1D24] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#E0A800] transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B707C] mb-1.5">État</label>
                <select
                  value={form.condition}
                  onChange={(e) => setForm({ ...form, condition: e.target.value })}
                  className="w-full bg-white border border-[#D8D6D0] text-[#1A1D24] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#E0A800] transition-colors"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B707C] mb-1.5">Prix d'achat (€) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={form.purchasePrice}
                    onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                    placeholder="0,00"
                    className="w-full bg-white border border-[#D8D6D0] text-[#1A1D24] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#E0A800] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B707C] mb-1.5">Prix actuel (€) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={form.currentPrice}
                    onChange={(e) => setForm({ ...form, currentPrice: e.target.value })}
                    placeholder="0,00"
                    className="w-full bg-white border border-[#D8D6D0] text-[#1A1D24] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#E0A800] transition-colors"
                  />
                </div>
              </div>

              {form.name ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleLookupPrice}
                      disabled={looking}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-[#1A1D24] bg-[#FFE9A8] border border-[#E0A800] py-2.5 rounded-lg hover:bg-[#FFDD7A] transition-colors disabled:opacity-60"
                    >
                      {looking ? "Recherche..." : "Chercher le prix automatiquement"}
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(cardmarketUrl(form.name), "_blank", "noopener,noreferrer")}
                      aria-label="Voir sur Cardmarket"
                      className="px-3 flex items-center justify-center border border-[#D8D6D0] rounded-lg hover:border-[#B8B6B0] transition-colors text-[#6B707C]"
                    >
                      <ExternalLink size={16} />
                    </button>
                  </div>

                  {priceLookup && priceLookup.status === "ok" && (
                    <div className="flex items-center justify-between bg-[#EAF7EE] border border-[#BFE5C9] rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs text-[#2F6B40] font-medium">
                          {priceLookup.card.name} {priceLookup.card.localId ? `#${priceLookup.card.localId}` : ""}
                        </p>
                        <p className="font-mono text-sm font-semibold text-[#1A1D24]">
                          {formatEUR(priceLookup.price)}{priceLookup.matchCount > 1 ? " (1ère correspondance)" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, currentPrice: String(priceLookup.price) }))}
                        className="text-xs font-semibold text-[#1A1D24] bg-[#FFCC33] px-3 py-1.5 rounded-md hover:bg-[#FFD75E] transition-colors"
                      >
                        Utiliser ce prix
                      </button>
                    </div>
                  )}
                  {priceLookup && priceLookup.status === "notfound" && (
                    <p className="text-xs text-[#A8761F]">Aucune carte trouvée avec ce nom sur la base TCGdex.</p>
                  )}
                  {priceLookup && priceLookup.status === "noprice" && (
                    <p className="text-xs text-[#A8761F]">Carte trouvée, mais aucun prix Cardmarket disponible pour elle.</p>
                  )}
                  {priceLookup && priceLookup.status === "error" && (
                    <p className="text-xs text-[#C0392B]">La recherche a échoué. Réessaie, ou utilise le lien Cardmarket directement.</p>
                  )}
                </div>
              ) : (
                <div className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-[#A8A6A0] bg-[#F3F1EB] border border-[#E5E3DD] py-2.5 rounded-lg cursor-not-allowed">
                  Chercher le prix automatiquement
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#6B707C] mb-1.5">Quantité</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full bg-white border border-[#D8D6D0] text-[#1A1D24] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#E0A800] transition-colors"
                />
              </div>

              {formError && <p className="text-sm text-[#C0392B] -mt-1">{formError}</p>}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={closeForm} className="flex-1 text-sm font-medium text-[#1A1D24] border border-[#D8D6D0] py-2.5 rounded-lg hover:border-[#B8B6B0] transition-colors">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ backgroundColor: "#FFCC33", color: "#1A1D24", border: "1px solid #FFCC33", borderRadius: "8px" }}
                  className="flex-1 text-sm font-semibold py-2.5 transition-colors disabled:opacity-60"
                >
                  {saving ? "..." : editingId ? "Enregistrer" : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
