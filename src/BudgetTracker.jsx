import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  Plus, Trash2, Pencil, X, ArrowLeftRight, Wallet, Tag as TagIcon,
  LayoutDashboard, ListOrdered, FolderTree, Target, Check, Landmark,
  ArrowDownCircle, ArrowUpCircle, LogOut,
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ------------------------------------------------------------------ */
/* Tokens & helpers                                                    */
/* ------------------------------------------------------------------ */

const PALETTE = ["#3E6B4F", "#9A3324", "#55696B", "#C08829", "#4A5FA0", "#7A5C8E", "#B0793E", "#2E7C7A"];

const fmtMoney = (n) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const fmtDay = (d) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });

function startOfPeriod(period, ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  if (period === "daily") return d;
  if (period === "weekly") {
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
  }
  if (period === "monthly") {
    d.setDate(1);
    return d;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Row <-> app object mapping (snake_case DB <-> camelCase JS)         */
/* ------------------------------------------------------------------ */

const accountFromRow = (r) => ({ id: r.id, name: r.name, type: r.type, initialBalance: Number(r.initial_balance), color: r.color });
const accountToRow = (a) => ({ name: a.name, type: a.type, initial_balance: a.initialBalance, color: a.color });

const categoryFromRow = (r) => ({ id: r.id, name: r.name, type: r.type, color: r.color });
const categoryToRow = (c) => ({ name: c.name, type: c.type, color: c.color });

const txnFromRow = (r) => ({
  id: r.id,
  type: r.type,
  amount: Number(r.amount),
  accountId: r.account_id,
  fromAccountId: r.from_account_id,
  toAccountId: r.to_account_id,
  categoryId: r.category_id,
  tags: r.tags || [],
  note: r.note || "",
  fee: { enabled: !!r.fee_enabled, amount: Number(r.fee_amount || 0) },
  date: r.occurred_at,
});
const txnToRow = (t) => ({
  type: t.type,
  amount: t.amount,
  account_id: t.accountId || null,
  from_account_id: t.fromAccountId || null,
  to_account_id: t.toAccountId || null,
  category_id: t.categoryId || null,
  tags: t.tags || [],
  note: t.note || "",
  fee_enabled: t.fee?.enabled || false,
  fee_amount: t.fee?.enabled ? t.fee.amount : 0,
  occurred_at: t.date,
});

const budgetFromRow = (r) => ({ id: r.id, name: r.name, period: r.period, categoryId: r.category_id || "all", amount: Number(r.amount) });
const budgetToRow = (b) => ({ name: b.name, period: b.period, category_id: b.categoryId === "all" ? null : b.categoryId, amount: b.amount });

/* ------------------------------------------------------------------ */
/* Small UI atoms (unchanged look from the prototype)                  */
/* ------------------------------------------------------------------ */

function IconCircle({ children, bg, fg }) {
  return (
    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: bg, color: fg }}>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(15,20,18,0.55)", zIndex: 50 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="paper-card w-full overflow-y-auto" style={{ maxWidth: wide ? 640 : 460, maxHeight: "88vh", padding: "1.5rem" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="display-font" style={{ fontSize: 20, color: "var(--ink)" }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function TypePill({ type }) {
  const cfg = {
    expense: { bg: "var(--rust-100)", fg: "var(--rust-800)", label: "Expense" },
    income: { bg: "var(--forest-100)", fg: "var(--forest-800)", label: "Income" },
    transfer: { bg: "var(--slate-100)", fg: "var(--slate-800)", label: "Transfer" },
  }[type];
  return <span className="pill" style={{ background: cfg.bg, color: cfg.fg }}>{cfg.label}</span>;
}

/* ------------------------------------------------------------------ */
/* Main App                                                             */
/* ------------------------------------------------------------------ */

export default function BudgetTracker({ session }) {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [tab, setTab] = useState("dashboard");
  const [txnModal, setTxnModal] = useState(null);
  const [accModal, setAccModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);

  /* ---------------- initial load ---------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      const [accRes, catRes, txnRes, budRes] = await Promise.all([
        supabase.from("accounts").select("*").order("created_at"),
        supabase.from("categories").select("*").order("created_at"),
        supabase.from("transactions").select("*").order("occurred_at", { ascending: false }),
        supabase.from("budgets").select("*").order("created_at"),
      ]);
      if (cancelled) return;
      const firstError = accRes.error || catRes.error || txnRes.error || budRes.error;
      if (firstError) {
        setErrorMsg(firstError.message);
        setLoading(false);
        return;
      }
      const accs = (accRes.data || []).map(accountFromRow);
      const cats = (catRes.data || []).map(categoryFromRow);
      const txns = (txnRes.data || []).map(txnFromRow);
      const buds = (budRes.data || []).map(budgetFromRow);
      setAccounts(accs);
      setCategories(cats);
      setTransactions(txns);
      setBudgets(buds);
      setAllTags([...new Set(txns.flatMap((t) => t.tags || []))]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------------- computed values ---------------- */

  const accountBalance = (accId) => {
    const acc = accounts.find((a) => a.id === accId);
    if (!acc) return 0;
    let bal = acc.initialBalance;
    for (const t of transactions) {
      if (t.type === "expense" && t.accountId === accId) bal -= t.amount;
      else if (t.type === "income" && t.accountId === accId) bal += t.amount;
      else if (t.type === "transfer") {
        if (t.fromAccountId === accId) bal -= t.amount + (t.fee?.enabled ? t.fee.amount : 0);
        if (t.toAccountId === accId) bal += t.amount;
      }
    }
    return bal;
  };

  const accountsWithBalance = useMemo(() => accounts.map((a) => ({ ...a, balance: accountBalance(a.id) })), [accounts, transactions]);
  const netWorth = useMemo(() => accountsWithBalance.reduce((s, a) => s + a.balance, 0), [accountsWithBalance]);

  const totalIncomeExpense = (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    let inc = 0, exp = 0;
    for (const t of transactions) {
      if (new Date(t.date) < cutoff) continue;
      if (t.type === "income") inc += t.amount;
      if (t.type === "expense") exp += t.amount;
    }
    return { inc, exp };
  };
  const monthTotals = totalIncomeExpense(30);

  const dailySeries = useMemo(() => {
    const days = 21;
    const base = netWorth;
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ date: d, income: 0, expense: 0 });
    }
    const dayIndex = (iso) => {
      const d = new Date(iso);
      d.setHours(0, 0, 0, 0);
      return buckets.findIndex((b) => b.date.getTime() === d.getTime());
    };
    for (const t of transactions) {
      const idx = dayIndex(t.date);
      if (idx === -1) continue;
      if (t.type === "income") buckets[idx].income += t.amount;
      if (t.type === "expense") buckets[idx].expense += t.amount;
    }
    let runningDelta = 0;
    const withNet = buckets.map((b) => ({ ...b }));
    for (let i = withNet.length - 1; i >= 0; i--) {
      withNet[i].netWorth = base - runningDelta;
      runningDelta += withNet[i].income - withNet[i].expense;
    }
    return withNet.map((b) => ({
      label: fmtDay(b.date),
      Income: Math.round(b.income),
      Expense: Math.round(b.expense),
      "Net worth": Math.round(b.netWorth),
    }));
  }, [transactions, netWorth]);

  const categoryBreakdown = useMemo(() => {
    const cutoff = startOfPeriod("monthly");
    const totals = {};
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (new Date(t.date) < cutoff) continue;
      totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount;
    }
    return Object.entries(totals)
      .map(([catId, value]) => {
        const cat = categories.find((c) => c.id === catId);
        return { name: cat ? cat.name : "Uncategorized", value: Math.round(value), color: cat ? cat.color : "#888780" };
      })
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories]);

  const budgetProgress = useMemo(() => {
    return budgets.map((b) => {
      const periodStart = startOfPeriod(b.period);
      const spent = transactions
        .filter((t) => t.type === "expense" && new Date(t.date) >= periodStart && (b.categoryId === "all" || t.categoryId === b.categoryId))
        .reduce((s, t) => s + t.amount, 0);
      return { ...b, spent, pct: b.amount > 0 ? Math.min(100, (spent / b.amount) * 100) : 0 };
    });
  }, [budgets, transactions]);

  const sortedTransactions = useMemo(() => [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)), [transactions]);

  /* ---------------- handlers (Supabase-backed) ---------------- */

  const upsertTransaction = async (txn) => {
    const row = txnToRow(txn);
    if (txn.id && transactions.some((t) => t.id === txn.id)) {
      const { data, error } = await supabase.from("transactions").update(row).eq("id", txn.id).select().single();
      if (error) return setErrorMsg(error.message);
      setTransactions((prev) => prev.map((t) => (t.id === txn.id ? txnFromRow(data) : t)));
    } else {
      const { data, error } = await supabase.from("transactions").insert(row).select().single();
      if (error) return setErrorMsg(error.message);
      setTransactions((prev) => [txnFromRow(data), ...prev]);
    }
    setAllTags((prev) => [...new Set([...prev, ...(txn.tags || [])])]);
    setTxnModal(null);
  };
  const deleteTransaction = async (id) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return setErrorMsg(error.message);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const upsertAccount = async (acc) => {
    const row = accountToRow(acc);
    if (acc.id && accounts.some((a) => a.id === acc.id)) {
      const { data, error } = await supabase.from("accounts").update(row).eq("id", acc.id).select().single();
      if (error) return setErrorMsg(error.message);
      setAccounts((prev) => prev.map((a) => (a.id === acc.id ? accountFromRow(data) : a)));
    } else {
      const { data, error } = await supabase.from("accounts").insert(row).select().single();
      if (error) return setErrorMsg(error.message);
      setAccounts((prev) => [...prev, accountFromRow(data)]);
    }
    setAccModal(null);
  };
  const deleteAccount = async (id) => {
    const inUse = transactions.some((t) => t.accountId === id || t.fromAccountId === id || t.toAccountId === id);
    if (inUse && !window.confirm("This account has transactions linked to it. Delete anyway? Past entries will keep their amounts but show no account.")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return setErrorMsg(error.message);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const upsertCategory = async (cat) => {
    const row = categoryToRow(cat);
    if (cat.id && categories.some((c) => c.id === cat.id)) {
      const { data, error } = await supabase.from("categories").update(row).eq("id", cat.id).select().single();
      if (error) return setErrorMsg(error.message);
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? categoryFromRow(data) : c)));
    } else {
      const { data, error } = await supabase.from("categories").insert(row).select().single();
      if (error) return setErrorMsg(error.message);
      setCategories((prev) => [...prev, categoryFromRow(data)]);
    }
    setCatModal(null);
  };
  const deleteCategory = async (id) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return setErrorMsg(error.message);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const upsertBudget = async (b) => {
    const row = budgetToRow(b);
    if (b.id && budgets.some((x) => x.id === b.id)) {
      const { data, error } = await supabase.from("budgets").update(row).eq("id", b.id).select().single();
      if (error) return setErrorMsg(error.message);
      setBudgets((prev) => prev.map((x) => (x.id === b.id ? budgetFromRow(data) : x)));
    } else {
      const { data, error } = await supabase.from("budgets").insert(row).select().single();
      if (error) return setErrorMsg(error.message);
      setBudgets((prev) => [...prev, budgetFromRow(data)]);
    }
    setBudgetModal(null);
  };
  const deleteBudget = async (id) => {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) return setErrorMsg(error.message);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const categoryName = (id) => (id === "all" ? "All categories" : categories.find((c) => c.id === id)?.name || "Uncategorized");
  const categoryColor = (id) => categories.find((c) => c.id === id)?.color || "#888780";

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", icon: ListOrdered },
    { id: "accounts", label: "Accounts", icon: Landmark },
    { id: "categories", label: "Categories", icon: FolderTree },
    { id: "budgets", label: "Budgets", icon: Target },
  ];

  return (
    <div className="bt-root">
      <style>{`
        .bt-root {
          --ink: #1B2521; --ink-soft: #4A4438; --paper: #F6F1E4; --paper-dim: #ECE4CF;
          --forest: #3E6B4F; --forest-100: #E3EDE5; --forest-800: #1E3D2A;
          --rust: #9A3324; --rust-100: #F3E1DB; --rust-800: #5C1E15;
          --slate: #55696B; --slate-100: #E4EAEA; --slate-800: #2C3839;
          --brass: #C08829; --brass-100: #F6E9D1; --brass-800: #6E4C15;
          font-family: 'Inter', system-ui, sans-serif; background: var(--ink); color: var(--paper);
          min-height: 100vh; padding: 1.25rem;
        }
        .bt-root * { box-sizing: border-box; }
        .display-font { font-family: 'Fraunces', Georgia, serif; }
        .mono-font { font-family: 'IBM Plex Mono', monospace; }
        .paper-card { background: var(--paper); color: var(--ink); border-radius: 10px; box-shadow: 0 1px 0 rgba(0,0,0,0.08); }
        .field-label { display:block; font-size: 12px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 4px; }
        input, select, textarea {
          width: 100%; background: var(--paper-dim); border: 1px solid rgba(27,37,33,0.15);
          border-radius: 6px; padding: 8px 10px; font-size: 14px; color: var(--ink); font-family: inherit;
        }
        input:focus, select:focus, textarea:focus { outline: 2px solid var(--forest); outline-offset: 1px; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: transform 0.06s ease; }
        .btn:active { transform: scale(0.97); }
        .btn-primary { background: var(--forest); color: #EFF6EF; }
        .btn-outline-dark { background: transparent; border-color: rgba(27,37,33,0.25); color: var(--ink); }
        .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 6px; border: 1px solid rgba(27,37,33,0.15); background: transparent; color: var(--ink-soft); cursor: pointer; }
        .icon-btn:hover { background: rgba(27,37,33,0.06); }
        .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
        .tag-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(27,37,33,0.08); color: var(--ink-soft); padding: 2px 8px; border-radius: 999px; font-size: 11px; }
        .nav-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 8px; border: none; background: transparent; color: rgba(246,241,228,0.7); font-size: 14px; font-weight: 600; cursor: pointer; text-align: left; }
        .nav-btn.active { background: rgba(246,241,228,0.1); color: var(--paper); }
        .nav-btn:hover:not(.active) { background: rgba(246,241,228,0.06); }
        .receipt-row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px dashed rgba(27,37,33,0.18); }
        .receipt-row:last-child { border-bottom: none; }
        .progress-track { height: 8px; border-radius: 999px; background: rgba(27,37,33,0.1); overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 999px; }
        .metric-card { background: rgba(246,241,228,0.06); border: 1px solid rgba(246,241,228,0.12); border-radius: 10px; padding: 14px 16px; }
        @media (min-width: 768px) { .bt-layout { display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; } }
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      `}</style>

      {errorMsg && (
        <div className="paper-card mb-4 p-3" style={{ borderLeft: "4px solid var(--rust)" }}>
          <strong style={{ fontSize: 13 }}>Something went wrong:</strong>{" "}
          <span style={{ fontSize: 13 }}>{errorMsg}</span>{" "}
          <button className="icon-btn" style={{ float: "right" }} onClick={() => setErrorMsg(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="bt-layout">
        <div>
          <div className="flex items-center justify-between mb-5 px-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: "var(--brass)", color: "#3A2A08" }}>
                <Wallet size={16} />
              </div>
              <span className="display-font" style={{ fontSize: 18, fontWeight: 600 }}>Ledger</span>
            </div>
            <button className="icon-btn md:hidden" onClick={() => supabase.auth.signOut()} aria-label="Sign out"><LogOut size={16} /></button>
          </div>
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <button key={n.id} className={`nav-btn ${tab === n.id ? "active" : ""}`} style={{ whiteSpace: "nowrap" }} onClick={() => setTab(n.id)}>
                  <Icon size={16} />{n.label}
                </button>
              );
            })}
          </nav>
          <div className="hidden md:block mt-6 metric-card">
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(246,241,228,0.55)" }}>Net worth</div>
            <div className="mono-font" style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{fmtMoney(netWorth)}</div>
          </div>
          <div className="hidden md:block mt-4" style={{ fontSize: 12, color: "rgba(246,241,228,0.55)" }}>
            {session.user.email}
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1"
              style={{ marginTop: 6, background: "none", border: "none", color: "rgba(246,241,228,0.75)", cursor: "pointer", fontSize: 12, padding: 0 }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>

        <div>
          {loading ? (
            <p style={{ fontSize: 14, color: "rgba(246,241,228,0.7)" }}>Loading your data…</p>
          ) : (
            <>
              {tab === "dashboard" && (
                <DashboardView
                  netWorth={netWorth} monthTotals={monthTotals} accountsWithBalance={accountsWithBalance}
                  dailySeries={dailySeries} categoryBreakdown={categoryBreakdown} budgetProgress={budgetProgress}
                  sortedTransactions={sortedTransactions} accountName={accountName} categoryName={categoryName}
                  onNewTxn={() => setTxnModal("new")}
                />
              )}
              {tab === "transactions" && (
                <TransactionsView
                  transactions={sortedTransactions} accountName={accountName} categoryName={categoryName}
                  categoryColor={categoryColor} onNew={() => setTxnModal("new")} onEdit={(t) => setTxnModal(t)} onDelete={deleteTransaction}
                />
              )}
              {tab === "accounts" && (
                <AccountsView accounts={accountsWithBalance} onNew={() => setAccModal("new")} onEdit={(a) => setAccModal(a)} onDelete={deleteAccount} netWorth={netWorth} />
              )}
              {tab === "categories" && (
                <CategoriesView categories={categories} transactions={transactions} onNew={() => setCatModal("new")} onEdit={(c) => setCatModal(c)} onDelete={deleteCategory} />
              )}
              {tab === "budgets" && (
                <BudgetsView budgetProgress={budgetProgress} categoryName={categoryName} onNew={() => setBudgetModal("new")} onEdit={(b) => setBudgetModal(b)} onDelete={deleteBudget} />
              )}
            </>
          )}
        </div>
      </div>

      {txnModal && (
        <TransactionForm initial={txnModal === "new" ? null : txnModal} accounts={accounts} categories={categories} allTags={allTags} onCancel={() => setTxnModal(null)} onSave={upsertTransaction} />
      )}
      {accModal && <AccountForm initial={accModal === "new" ? null : accModal} onCancel={() => setAccModal(null)} onSave={upsertAccount} />}
      {catModal && <CategoryForm initial={catModal === "new" ? null : catModal} onCancel={() => setCatModal(null)} onSave={upsertCategory} />}
      {budgetModal && (
        <BudgetForm initial={budgetModal === "new" ? null : budgetModal} categories={categories} onCancel={() => setBudgetModal(null)} onSave={upsertBudget} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

function DashboardView({ netWorth, monthTotals, accountsWithBalance, dailySeries, categoryBreakdown, budgetProgress, sortedTransactions, accountName, categoryName, onNewTxn }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="display-font" style={{ fontSize: 24 }}>Dashboard</h2>
        <button className="btn btn-primary" onClick={onNewTxn}><Plus size={16} /> Log entry</button>
      </div>

      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="metric-card">
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "rgba(246,241,228,0.55)" }}>Net worth</div>
          <div className="mono-font" style={{ fontSize: 22, fontWeight: 600 }}>{fmtMoney(netWorth)}</div>
        </div>
        <div className="metric-card">
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "rgba(246,241,228,0.55)" }}>Income (30d)</div>
          <div className="mono-font" style={{ fontSize: 22, fontWeight: 600, color: "#7FBE97" }}>{fmtMoney(monthTotals.inc)}</div>
        </div>
        <div className="metric-card">
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "rgba(246,241,228,0.55)" }}>Expenses (30d)</div>
          <div className="mono-font" style={{ fontSize: 22, fontWeight: 600, color: "#E28A76" }}>{fmtMoney(monthTotals.exp)}</div>
        </div>
        <div className="metric-card">
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "rgba(246,241,228,0.55)" }}>Net (30d)</div>
          <div className="mono-font" style={{ fontSize: 22, fontWeight: 600 }}>{fmtMoney(monthTotals.inc - monthTotals.exp)}</div>
        </div>
      </div>

      <div className="paper-card p-4 mb-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Net worth trend — last 21 days</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dailySeries}>
            <defs>
              <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E6B4F" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#3E6B4F" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,37,33,0.1)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#4A4438" }} interval={2} />
            <YAxis tick={{ fontSize: 11, fill: "#4A4438" }} width={70} tickFormatter={(v) => fmtMoney(v)} />
            <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Area type="monotone" dataKey="Net worth" stroke="#3E6B4F" fill="url(#nw)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="paper-card p-4">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Income vs expense — daily</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,37,33,0.1)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#4A4438" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#4A4438" }} width={60} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill="#3E6B4F" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="#9A3324" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="paper-card p-4">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Spending by category — this month</h3>
          {categoryBreakdown.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No expenses logged this month yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={categoryBreakdown} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {categoryBreakdown.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="paper-card p-4">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Budgets — live</h3>
          <div className="flex flex-col gap-3">
            {budgetProgress.map((b) => (
              <div key={b.id}>
                <div className="flex justify-between mb-1" style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{b.name}</span>
                  <span className="mono-font" style={{ color: "var(--ink-soft)" }}>{fmtMoney(b.spent)} / {fmtMoney(b.amount)}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${b.pct}%`, background: b.pct >= 100 ? "var(--rust)" : b.pct >= 80 ? "var(--brass)" : "var(--forest)" }} />
                </div>
              </div>
            ))}
            {budgetProgress.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>No budgets set yet.</p>}
          </div>
        </div>

        <div className="paper-card p-4">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "var(--ink-soft)" }}>Recent activity</h3>
          <div>
            {sortedTransactions.slice(0, 6).map((t) => <ReceiptRow key={t.id} t={t} accountName={accountName} categoryName={categoryName} />)}
            {sortedTransactions.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Nothing logged yet.</p>}
          </div>
        </div>
      </div>

      <div className="paper-card p-4 mt-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Accounts overview</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {accountsWithBalance.map((a) => (
            <div key={a.id} style={{ borderLeft: `3px solid ${a.color}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{a.name}</div>
              <div className="mono-font" style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoney(a.balance)}</div>
            </div>
          ))}
          {accountsWithBalance.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Add an account to get started.</p>}
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ t, accountName, categoryName }) {
  const isExp = t.type === "expense";
  const isInc = t.type === "income";
  const sign = isExp ? "−" : isInc ? "+" : "";
  const color = isExp ? "var(--rust-800)" : isInc ? "var(--forest-800)" : "var(--slate-800)";
  const label = isExp || isInc ? categoryName(t.categoryId) : `${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`;
  return (
    <div className="receipt-row">
      <IconCircle bg={isExp ? "var(--rust-100)" : isInc ? "var(--forest-100)" : "var(--slate-100)"} fg={color}>
        {isExp ? <ArrowDownCircle size={17} /> : isInc ? <ArrowUpCircle size={17} /> : <ArrowLeftRight size={16} />}
      </IconCircle>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || label}</div>
        <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{label} · {fmtDate(t.date)} {fmtTime(t.date)}</div>
      </div>
      <div className="mono-font" style={{ fontSize: 14, fontWeight: 600, color }}>{sign}{fmtMoney(t.amount)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transactions                                                         */
/* ------------------------------------------------------------------ */

function TransactionsView({ transactions, accountName, categoryName, categoryColor, onNew, onEdit, onDelete }) {
  const [filterType, setFilterType] = useState("all");
  const filtered = filterType === "all" ? transactions : transactions.filter((t) => t.type === filterType);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="display-font" style={{ fontSize: 24 }}>Transactions</h2>
        <div className="flex items-center gap-2">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ width: "auto" }}>
            <option value="all">All types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
          <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Log entry</button>
        </div>
      </div>

      <div className="paper-card">
        {filtered.length === 0 && <p style={{ padding: 20, fontSize: 13, color: "var(--ink-soft)" }}>Nothing logged yet. Add your first entry.</p>}
        <div style={{ padding: "4px 14px" }}>
          {filtered.map((t) => {
            const isExp = t.type === "expense";
            const isInc = t.type === "income";
            const sign = isExp ? "−" : isInc ? "+" : "";
            const color = isExp ? "var(--rust-800)" : isInc ? "var(--forest-800)" : "var(--slate-800)";
            return (
              <div key={t.id} className="receipt-row">
                <IconCircle bg={isExp ? "var(--rust-100)" : isInc ? "var(--forest-100)" : "var(--slate-100)"} fg={color}>
                  {isExp ? <ArrowDownCircle size={17} /> : isInc ? <ArrowUpCircle size={17} /> : <ArrowLeftRight size={16} />}
                </IconCircle>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.note || "(no note)"}</span>
                    <TypePill type={t.type} />
                    {(isExp || isInc) && (
                      <span className="tag-chip" style={{ background: `${categoryColor(t.categoryId)}22`, color: categoryColor(t.categoryId) }}>
                        {categoryName(t.categoryId)}
                      </span>
                    )}
                    {t.tags?.map((tg) => <span key={tg} className="tag-chip"><TagIcon size={10} />{tg}</span>)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                    {isExp || isInc ? accountName(t.accountId) : `${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`}
                    {t.type === "transfer" && t.fee?.enabled ? ` · fee ${fmtMoney(t.fee.amount)}` : ""}
                    {" · "}{fmtDate(t.date)} {fmtTime(t.date)}
                  </div>
                </div>
                <div className="mono-font" style={{ fontSize: 14, fontWeight: 600, color, whiteSpace: "nowrap" }}>{sign}{fmtMoney(t.amount)}</div>
                <div className="flex gap-1">
                  <button className="icon-btn" onClick={() => onEdit(t)} aria-label="Edit"><Pencil size={14} /></button>
                  <button className="icon-btn" onClick={() => onDelete(t.id)} aria-label="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accounts                                                             */
/* ------------------------------------------------------------------ */

function AccountsView({ accounts, onNew, onEdit, onDelete, netWorth }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="display-font" style={{ fontSize: 24 }}>Accounts</h2>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New account</button>
      </div>
      <div className="paper-card p-4 mb-4">
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Total net worth across all accounts</div>
        <div className="mono-font" style={{ fontSize: 26, fontWeight: 600 }}>{fmtMoney(netWorth)}</div>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {accounts.map((a) => (
          <div key={a.id} className="paper-card p-4" style={{ borderTop: `4px solid ${a.color}` }}>
            <div className="flex items-start justify-between">
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "capitalize" }}>{a.type}</div>
              </div>
              <div className="flex gap-1">
                <button className="icon-btn" onClick={() => onEdit(a)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => onDelete(a.id)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="mono-font" style={{ fontSize: 22, fontWeight: 600, marginTop: 10 }}>{fmtMoney(a.balance)}</div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Opening balance {fmtMoney(a.initialBalance)}</div>
          </div>
        ))}
        {accounts.length === 0 && <p style={{ fontSize: 13, color: "rgba(246,241,228,0.6)" }}>No accounts yet — create your first one.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Categories                                                           */
/* ------------------------------------------------------------------ */

function CategoriesView({ categories, transactions, onNew, onEdit, onDelete }) {
  const usageCount = (id) => transactions.filter((t) => t.categoryId === id).length;
  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  const Group = ({ title, list }) => (
    <div className="paper-card p-4 mb-4">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>{title}</h3>
      <div className="flex flex-col gap-2">
        {list.map((c) => (
          <div key={c.id} className="flex items-center justify-between" style={{ padding: "6px 0", borderBottom: "1px dashed rgba(27,37,33,0.15)" }}>
            <div className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{usageCount(c.id)} entries</span>
            </div>
            <div className="flex gap-1">
              <button className="icon-btn" onClick={() => onEdit(c)} aria-label="Edit"><Pencil size={14} /></button>
              <button className="icon-btn" onClick={() => onDelete(c.id)} aria-label="Delete"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>No categories yet.</p>}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="display-font" style={{ fontSize: 24 }}>Categories</h2>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New category</button>
      </div>
      <Group title="Expense categories" list={expenseCats} />
      <Group title="Income categories" list={incomeCats} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Budgets                                                              */
/* ------------------------------------------------------------------ */

function BudgetsView({ budgetProgress, categoryName, onNew, onEdit, onDelete }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="display-font" style={{ fontSize: 24 }}>Budgets</h2>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New budget</button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {budgetProgress.map((b) => (
          <div key={b.id} className="paper-card p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{b.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "capitalize" }}>{b.period} · {categoryName(b.categoryId)}</div>
              </div>
              <div className="flex gap-1">
                <button className="icon-btn" onClick={() => onEdit(b)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => onDelete(b.id)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${b.pct}%`, background: b.pct >= 100 ? "var(--rust)" : b.pct >= 80 ? "var(--brass)" : "var(--forest)" }} />
            </div>
            <div className="flex justify-between mt-2 mono-font" style={{ fontSize: 12 }}>
              <span>{fmtMoney(b.spent)} spent</span>
              <span style={{ color: "var(--ink-soft)" }}>of {fmtMoney(b.amount)}</span>
            </div>
          </div>
        ))}
        {budgetProgress.length === 0 && <p style={{ fontSize: 13, color: "rgba(246,241,228,0.6)" }}>No budgets set yet.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                                */
/* ------------------------------------------------------------------ */

function TransactionForm({ initial, accounts, categories, allTags, onCancel, onSave }) {
  const [type, setType] = useState(initial?.type || "expense");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId || accounts[0]?.id || "");
  const [fromAccountId, setFromAccountId] = useState(initial?.fromAccountId || accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId || accounts[1]?.id || accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [feeEnabled, setFeeEnabled] = useState(initial?.fee?.enabled || false);
  const [feeAmount, setFeeAmount] = useState(initial?.fee?.amount ?? "");
  const [note, setNote] = useState(initial?.note || "");
  const [tags, setTags] = useState(initial?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const relevantCats = categories.filter((c) => c.type === type);
  useEffect(() => {
    if (type !== "transfer" && relevantCats.length && !relevantCats.some((c) => c.id === categoryId)) {
      setCategoryId(relevantCats[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const addTag = (t) => {
    const clean = t.trim();
    if (!clean || tags.includes(clean)) return;
    setTags([...tags, clean]);
    setTagInput("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const base = { id: initial?.id, type, amount: amt, note, tags, date: initial?.date || new Date().toISOString() };
    setSaving(true);
    if (type === "transfer") {
      if (fromAccountId === toAccountId) { setSaving(false); return; }
      await onSave({ ...base, fromAccountId, toAccountId, fee: { enabled: feeEnabled, amount: feeEnabled ? parseFloat(feeAmount) || 0 : 0 } });
    } else {
      await onSave({ ...base, accountId, categoryId });
    }
    setSaving(false);
  };

  return (
    <Modal title={initial ? "Edit entry" : "Log a new entry"} onClose={onCancel}>
      <form onSubmit={submit}>
        <Field label="Entry type">
          <div className="flex gap-2">
            {["expense", "income", "transfer"].map((t) => (
              <button
                type="button" key={t} className="btn"
                style={{ flex: 1, justifyContent: "center", background: type === t ? (t === "expense" ? "var(--rust)" : t === "income" ? "var(--forest)" : "var(--slate)") : "var(--paper-dim)", color: type === t ? "#fff" : "var(--ink-soft)" }}
                onClick={() => setType(t)}
              >
                {t === "expense" ? "Expense" : t === "income" ? "Income" : "Transfer"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Amount (PHP)">
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
        </Field>

        {type !== "transfer" ? (
          <>
            <Field label={type === "expense" ? "Withdraw from account" : "Deposit to account"}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {relevantCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                {relevantCats.length === 0 && <option value="">No categories — add one first</option>}
              </select>
            </Field>
          </>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="From account">
                <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="To account">
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
            {fromAccountId === toAccountId && <p style={{ fontSize: 12, color: "var(--rust)", marginTop: -8, marginBottom: 8 }}>Pick two different accounts.</p>}
            <Field label="Transfer fee">
              <div className="flex items-center gap-3">
                <button
                  type="button" className="icon-btn"
                  style={{ width: 40, background: feeEnabled ? "var(--brass)" : "transparent", color: feeEnabled ? "#3A2A08" : "var(--ink-soft)" }}
                  onClick={() => setFeeEnabled(!feeEnabled)} aria-pressed={feeEnabled}
                >
                  {feeEnabled ? <Check size={14} /> : <X size={14} />}
                </button>
                <span style={{ fontSize: 13 }}>{feeEnabled ? "This transfer has a fee" : "No fee for this transfer"}</span>
              </div>
              {feeEnabled && (
                <input type="number" min="0" step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder="Fee amount" style={{ marginTop: 8 }} />
              )}
            </Field>
          </>
        )}

        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
        </Field>

        {type !== "transfer" && (
          <Field label="Tags">
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((t) => (
                <span key={t} className="tag-chip">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                placeholder="Type a tag and press enter" list="tag-suggestions"
              />
              <datalist id="tag-suggestions">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
              <button type="button" className="btn btn-outline-dark" onClick={() => addTag(tagInput)}>Add</button>
            </div>
          </Field>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Log entry"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AccountForm({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "cash");
  const [initialBalance, setInitialBalance] = useState(initial?.initialBalance ?? 0);
  const [color, setColor] = useState(initial?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: initial?.id, name: name.trim(), type, initialBalance: parseFloat(initialBalance) || 0, color });
    setSaving(false);
  };

  return (
    <Modal title={initial ? "Edit account" : "New account"} onClose={onCancel}>
      <form onSubmit={submit}>
        <Field label="Account name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UnionBank Savings" required /></Field>
        <Field label="Account type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="ewallet">E-wallet</option>
            <option value="credit">Credit card</option>
            <option value="investment">Investment</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Opening balance (PHP)"><input type="number" step="0.01" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} /></Field>
        <Field label="Color tag">
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: color === c ? "2px solid var(--ink)" : "2px solid transparent" }} aria-label={`Choose color ${c}`} />
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create account"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryForm({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "expense");
  const [color, setColor] = useState(initial?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: initial?.id, name: name.trim(), type, color });
    setSaving(false);
  };

  return (
    <Modal title={initial ? "Edit category" : "New category"} onClose={onCancel}>
      <form onSubmit={submit}>
        <Field label="Category name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscriptions" required /></Field>
        <Field label="Applies to">
          <div className="flex gap-2">
            {["expense", "income"].map((t) => (
              <button type="button" key={t} className="btn" style={{ flex: 1, justifyContent: "center", background: type === t ? "var(--forest)" : "var(--paper-dim)", color: type === t ? "#fff" : "var(--ink-soft)" }} onClick={() => setType(t)}>
                {t === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Color tag">
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: color === c ? "2px solid var(--ink)" : "2px solid transparent" }} aria-label={`Choose color ${c}`} />
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create category"}</button>
        </div>
      </form>
    </Modal>
  );
}

function BudgetForm({ initial, categories, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [period, setPeriod] = useState(initial?.period || "monthly");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "all");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [saving, setSaving] = useState(false);

  const expenseCats = categories.filter((c) => c.type === "expense");

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!name.trim() || !amt || amt <= 0) return;
    setSaving(true);
    await onSave({ id: initial?.id, name: name.trim(), period, categoryId, amount: amt });
    setSaving(false);
  };

  return (
    <Modal title={initial ? "Edit budget" : "New budget"} onClose={onCancel}>
      <form onSubmit={submit}>
        <Field label="Budget name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly food budget" required /></Field>
        <Field label="Period">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="all">All expense categories</option>
            {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Budget amount (PHP)"><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create budget"}</button>
        </div>
      </form>
    </Modal>
  );
}
