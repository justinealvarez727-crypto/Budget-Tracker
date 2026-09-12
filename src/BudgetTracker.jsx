import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  Plus, Trash2, Pencil, X, ArrowLeftRight, Wallet, LayoutDashboard,
  ListOrdered, FolderTree, Target, Check, Landmark, ArrowUpCircle,
  LogOut, Calculator, Sun, Moon, Search, PiggyBank, Scale, Eye, EyeOff, CreditCard,
  ShoppingCart, Utensils, Car, Home, Zap, Heart, Gift, Plane, BookOpen,
  Gamepad2, Smartphone, Wifi, Coffee, Dumbbell, Baby, PawPrint, Briefcase,
  GraduationCap, Music, Film, Bus, Fuel, ShoppingBag, Pill, Shirt,
  Scissors, TreePine, DollarSign, Tag,
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ------------------------------------------------------------------ */
/* Tokens & helpers                                                    */
/* ------------------------------------------------------------------ */

const PALETTE = ["#5C7A52", "#A13A1F", "#6E5A47", "#B8842A", "#4C5F8A", "#7A5079", "#B0793E", "#2E7C6E"];

const ICON_MAP = {
  ShoppingCart, Utensils, Car, Home, Zap, Heart, Gift, Plane, BookOpen,
  Gamepad2, Smartphone, Wifi, Coffee, Dumbbell, Baby, PawPrint, Briefcase,
  GraduationCap, Music, Film, Bus, Fuel, ShoppingBag, Pill, Shirt,
  Scissors, TreePine, DollarSign, Tag,
};
const ICON_NAMES = Object.keys(ICON_MAP);
function CategoryIcon({ name, size = 14, ...rest }) {
  const Cmp = ICON_MAP[name] || Tag;
  return <Cmp size={size} {...rest} />;
}

const fmtMoney = (n) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const fmtDay = (d) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const MASK = "•••••";

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

/* Tiny safe expression evaluator for the amount calculator: + - * / ( ) only */
function safeEval(input) {
  const tokens = String(input).match(/(\d+\.?\d*|\.\d+|[+\-*/()])/g);
  if (!tokens || tokens.length === 0) return NaN;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parseExpr() {
    let val = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      val = op === "+" ? val + rhs : val - rhs;
    }
    return val;
  }
  function parseTerm() {
    let val = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      val = op === "*" ? val * rhs : val / rhs;
    }
    return val;
  }
  function parseFactor() {
    if (peek() === "-") { next(); return -parseFactor(); }
    if (peek() === "(") {
      next();
      const val = parseExpr();
      if (peek() === ")") next();
      return val;
    }
    const t = next();
    return t === undefined ? NaN : parseFloat(t);
  }
  const result = parseExpr();
  return Number.isFinite(result) ? result : NaN;
}

/* ------------------------------------------------------------------ */
/* Row <-> app object mapping (snake_case DB <-> camelCase JS)         */
/* ------------------------------------------------------------------ */

const accountFromRow = (r) => ({ id: r.id, name: r.name, type: r.type, initialBalance: Number(r.initial_balance), color: r.color });
const accountToRow = (a) => ({ name: a.name, type: a.type, initial_balance: a.initialBalance, color: a.color });

const categoryFromRow = (r) => ({ id: r.id, name: r.name, type: r.type, color: r.color, icon: r.icon || "Tag" });
const categoryToRow = (c) => ({ name: c.name, type: c.type, color: c.color, icon: c.icon || "Tag" });

const txnFromRow = (r) => ({
  id: r.id,
  type: r.type,
  amount: Number(r.amount),
  accountId: r.account_id,
  fromAccountId: r.from_account_id,
  toAccountId: r.to_account_id,
  categoryId: r.category_id,
  budgetId: r.budget_id || null,
  debtId: r.debt_id || null,
  note: r.note || "",
  fee: { enabled: !!r.fee_enabled, amount: Number(r.fee_amount || 0) },
  date: r.occurred_at,
  isAdjustment: !!r.is_adjustment,
});
const txnToRow = (t) => ({
  type: t.type,
  amount: t.amount,
  account_id: t.accountId || null,
  from_account_id: t.fromAccountId || null,
  to_account_id: t.toAccountId || null,
  category_id: t.categoryId || null,
  budget_id: t.budgetId || null,
  debt_id: t.debtId || null,
  note: t.note || "",
  fee_enabled: t.fee?.enabled || false,
  fee_amount: t.fee?.enabled ? t.fee.amount : 0,
  occurred_at: t.date,
  is_adjustment: t.isAdjustment || false,
});

const budgetFromRow = (r) => ({ id: r.id, name: r.name, period: r.period, categoryId: r.category_id || "all", amount: Number(r.amount) });
const budgetToRow = (b) => ({ name: b.name, period: b.period, category_id: b.categoryId === "all" ? null : b.categoryId, amount: b.amount });

const goalFromRow = (r) => ({
  id: r.id, name: r.name, targetAmount: Number(r.target_amount), targetDate: r.target_date,
  accountId: r.account_id, manualSaved: Number(r.manual_saved || 0), color: r.color,
});
const goalToRow = (g) => ({
  name: g.name, target_amount: g.targetAmount, target_date: g.targetDate || null,
  account_id: g.accountId || null, manual_saved: g.manualSaved ?? 0, color: g.color,
});

const debtFromRow = (r) => ({
  id: r.id, name: r.name, totalAmount: Number(r.total_amount), dueDate: r.due_date, color: r.color,
});
const debtToRow = (d) => ({
  name: d.name, total_amount: d.totalAmount, due_date: d.dueDate || null, color: d.color,
});

/* ------------------------------------------------------------------ */
/* Small UI atoms                                                       */
/* ------------------------------------------------------------------ */

function IconCircle({ children, bg, fg }) {
  return (
    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: bg, color: fg }}>
      {children}
    </div>
  );
}

function WaxSeal({ size = 34, children, rotate = -6 }) {
  return (
    <div className="wax-seal" style={{ width: size, height: size, fontSize: size * 0.42, transform: `rotate(${rotate}deg)` }}>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(20,13,7,0.6)", zIndex: 50 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="paper-card torn-top w-full overflow-y-auto" style={{ maxWidth: wide ? 640 : 460, maxHeight: "88vh", padding: "1.5rem" }}>
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

function SectionTitle({ children }) {
  return <h2 className="display-font ledger-title" style={{ fontSize: 24 }}>{children}</h2>;
}

function TypePill({ type }) {
  const cfg = {
    expense: { bg: "var(--rust-100)", fg: "var(--rust-800)", label: "Expense" },
    income: { bg: "var(--forest-100)", fg: "var(--forest-800)", label: "Income" },
    transfer: { bg: "var(--slate-100)", fg: "var(--slate-800)", label: "Transfer" },
  }[type];
  return <span className="pill" style={{ background: cfg.bg, color: cfg.fg }}>{cfg.label}</span>;
}

const CALC_BUTTONS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "C", "0", ".", "+", "⌫", "="];
const CALC_MAP = { "÷": "/", "×": "*", "−": "-" };

function AmountInput({ value, onChange, placeholder = "0.00", required }) {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");

  const press = (btn) => {
    if (btn === "C") { setExpr(""); return; }
    if (btn === "⌫") { setExpr((e) => e.slice(0, -1)); return; }
    if (btn === "=") {
      const result = safeEval(expr || value || "0");
      if (!Number.isNaN(result)) {
        const rounded = Math.round(result * 100) / 100;
        onChange(String(rounded));
        setExpr(String(rounded));
      }
      return;
    }
    setExpr((e) => (e || "") + (CALC_MAP[btn] || btn));
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="number" min="0" step="0.01" value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} required={required}
        />
        <button
          type="button" className="icon-btn" style={{ width: 38 }}
          onClick={() => { setExpr(value ? String(value) : ""); setOpen((o) => !o); }}
          aria-label="Open calculator"
        >
          <Calculator size={16} />
        </button>
      </div>
      {open && (
        <div className="calc-popup">
          <div className="calc-display mono-font">{expr || "0"}</div>
          <div className="calc-grid">
            {CALC_BUTTONS.map((b) => (
              <button
                type="button" key={b} className={`calc-btn ${b === "=" ? "calc-eq" : ""}`}
                onClick={() => press(b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main App                                                             */
/* ------------------------------------------------------------------ */

export default function BudgetTracker({ session }) {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [theme, setTheme] = useState(() => (typeof window !== "undefined" && localStorage.getItem("ledger-theme")) || "dark");
  useEffect(() => { localStorage.setItem("ledger-theme", theme); }, [theme]);

  const [hideAmounts, setHideAmounts] = useState(() => (typeof window !== "undefined" && localStorage.getItem("ledger-hide-amounts") === "1"));
  useEffect(() => { localStorage.setItem("ledger-hide-amounts", hideAmounts ? "1" : "0"); }, [hideAmounts]);

  const [tab, setTab] = useState("dashboard");
  const [txnModal, setTxnModal] = useState(null);
  const [accModal, setAccModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);
  const [goalModal, setGoalModal] = useState(null);
  const [contributeGoal, setContributeGoal] = useState(null);
  const [adjustAccount, setAdjustAccount] = useState(null);
  const [debtModal, setDebtModal] = useState(null);

  /* ---------------- initial load ---------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      const [accRes, catRes, txnRes, budRes, goalRes, debtRes] = await Promise.all([
        supabase.from("accounts").select("*").order("created_at"),
        supabase.from("categories").select("*").order("created_at"),
        supabase.from("transactions").select("*").order("occurred_at", { ascending: false }),
        supabase.from("budgets").select("*").order("created_at"),
        supabase.from("savings_goals").select("*").order("created_at"),
        supabase.from("debts").select("*").order("created_at"),
      ]);
      if (cancelled) return;
      const firstError = accRes.error || catRes.error || txnRes.error || budRes.error || goalRes.error || debtRes.error;
      if (firstError) {
        setErrorMsg(firstError.message);
        setLoading(false);
        return;
      }
      setAccounts((accRes.data || []).map(accountFromRow));
      setCategories((catRes.data || []).map(categoryFromRow));
      setTransactions((txnRes.data || []).map(txnFromRow));
      setBudgets((budRes.data || []).map(budgetFromRow));
      setGoals((goalRes.data || []).map(goalFromRow));
      setDebts((debtRes.data || []).map(debtFromRow));
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
      if (t.isAdjustment) continue;
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
      buckets.push({ date: d, income: 0, expense: 0, netDelta: 0 });
    }
    const dayIndex = (iso) => {
      const d = new Date(iso);
      d.setHours(0, 0, 0, 0);
      return buckets.findIndex((b) => b.date.getTime() === d.getTime());
    };
    for (const t of transactions) {
      const idx = dayIndex(t.date);
      if (idx === -1) continue;
      if (t.type === "income") {
        buckets[idx].netDelta += t.amount;
        if (!t.isAdjustment) buckets[idx].income += t.amount;
      }
      if (t.type === "expense") {
        buckets[idx].netDelta -= t.amount;
        if (!t.isAdjustment) buckets[idx].expense += t.amount;
      }
      if (t.type === "transfer" && t.fee?.enabled) buckets[idx].netDelta -= t.fee.amount;
    }
    let runningDelta = 0;
    const withNet = buckets.map((b) => ({ ...b }));
    for (let i = withNet.length - 1; i >= 0; i--) {
      withNet[i].netWorth = base - runningDelta;
      runningDelta += withNet[i].netDelta;
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
      if (t.type !== "expense" || t.isAdjustment) continue;
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
        .filter((t) => {
          if (t.type !== "expense" || t.isAdjustment || new Date(t.date) < periodStart) return false;
          if (t.budgetId) return t.budgetId === b.id;
          return b.categoryId === "all" || t.categoryId === b.categoryId;
        })
        .reduce((s, t) => s + t.amount, 0);
      return { ...b, spent, pct: b.amount > 0 ? Math.min(100, (spent / b.amount) * 100) : 0 };
    });
  }, [budgets, transactions]);

  const goalsWithProgress = useMemo(() => {
    return goals.map((g) => {
      const saved = g.accountId ? accountBalance(g.accountId) : g.manualSaved;
      const clamped = Math.max(0, saved);
      return { ...g, saved: clamped, pct: g.targetAmount > 0 ? Math.min(100, (clamped / g.targetAmount) * 100) : 0 };
    });
  }, [goals, accounts, transactions]);

  const debtProgress = useMemo(() => {
    return debts.map((d) => {
      const paid = transactions
        .filter((t) => t.type === "expense" && !t.isAdjustment && t.debtId === d.id)
        .reduce((s, t) => s + t.amount, 0);
      const remaining = Math.max(0, d.totalAmount - paid);
      const pct = d.totalAmount > 0 ? Math.min(100, (paid / d.totalAmount) * 100) : 0;
      return { ...d, paid, remaining, pct };
    });
  }, [debts, transactions]);

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
  const adjustAccountBalance = async (account, actualStr, note) => {
    const actual = parseFloat(actualStr);
    if (!Number.isFinite(actual)) return;
    const current = accountBalance(account.id);
    const diff = Math.round((actual - current) * 100) / 100;
    if (diff === 0) { setAdjustAccount(null); return; }
    const row = txnToRow({
      type: diff > 0 ? "income" : "expense",
      amount: Math.abs(diff),
      accountId: account.id,
      categoryId: null,
      budgetId: null,
      note: note || "Balance adjustment",
      date: new Date().toISOString(),
      isAdjustment: true,
    });
    const { data, error } = await supabase.from("transactions").insert(row).select().single();
    if (error) return setErrorMsg(error.message);
    setTransactions((prev) => [txnFromRow(data), ...prev]);
    setAdjustAccount(null);
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

  const upsertGoal = async (g) => {
    const row = goalToRow(g);
    if (g.id && goals.some((x) => x.id === g.id)) {
      const { data, error } = await supabase.from("savings_goals").update(row).eq("id", g.id).select().single();
      if (error) return setErrorMsg(error.message);
      setGoals((prev) => prev.map((x) => (x.id === g.id ? goalFromRow(data) : x)));
    } else {
      const { data, error } = await supabase.from("savings_goals").insert(row).select().single();
      if (error) return setErrorMsg(error.message);
      setGoals((prev) => [...prev, goalFromRow(data)]);
    }
    setGoalModal(null);
  };
  const deleteGoal = async (id) => {
    const { error } = await supabase.from("savings_goals").delete().eq("id", id);
    if (error) return setErrorMsg(error.message);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };
  const contributeToGoal = async (goal, delta) => {
    const newAmount = Math.max(0, (goal.manualSaved || 0) + delta);
    const { data, error } = await supabase.from("savings_goals").update({ manual_saved: newAmount }).eq("id", goal.id).select().single();
    if (error) return setErrorMsg(error.message);
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? goalFromRow(data) : g)));
    setContributeGoal(null);
  };

  const upsertDebt = async (d) => {
    const row = debtToRow(d);
    if (d.id && debts.some((x) => x.id === d.id)) {
      const { data, error } = await supabase.from("debts").update(row).eq("id", d.id).select().single();
      if (error) return setErrorMsg(error.message);
      setDebts((prev) => prev.map((x) => (x.id === d.id ? debtFromRow(data) : x)));
    } else {
      const { data, error } = await supabase.from("debts").insert(row).select().single();
      if (error) return setErrorMsg(error.message);
      setDebts((prev) => [...prev, debtFromRow(data)]);
    }
    setDebtModal(null);
  };
  const deleteDebt = async (id) => {
    const { error } = await supabase.from("debts").delete().eq("id", id);
    if (error) return setErrorMsg(error.message);
    setDebts((prev) => prev.filter((d) => d.id !== id));
  };

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const categoryName = (id) => (id === "all" ? "All categories" : categories.find((c) => c.id === id)?.name || "Uncategorized");
  const categoryColor = (id) => categories.find((c) => c.id === id)?.color || "#888780";
  const categoryIcon = (id) => categories.find((c) => c.id === id)?.icon || "Tag";

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", icon: ListOrdered },
    { id: "accounts", label: "Accounts", icon: Landmark },
    { id: "categories", label: "Categories", icon: FolderTree },
    { id: "budgets", label: "Budgets", icon: Target },
    { id: "savings", label: "Savings", icon: PiggyBank },
    { id: "debts", label: "Debts", icon: CreditCard },
  ];

  return (
    <div className="bt-root" data-theme={theme}>
      <style>{`
        .bt-root {
          font-family: 'Inter', system-ui, sans-serif;
          min-height: 100vh; padding: 1.25rem;
          --forest: #5C7A52; --forest-100: #E4EAE0; --forest-800: #33452C;
          --rust: #A13A1F; --rust-100: #F2E0D6; --rust-800: #5C2010;
          --slate: #6E5A47; --slate-100: #EAE2D6; --slate-800: #3E3020;
          --brass: #B8842A; --brass-100: #F5E7C9; --brass-800: #6B4C15;
          --wax: #7A1F1F; --wax-ink: #F4E9D0;
          --ink: #2B1B0E; --ink-soft: #6B4A2E; --paper-dim: #EADFC4;
        }
        .bt-root[data-theme="dark"] {
          --bg: #241A12; --fg: #F4E9D0; --card-bg: #F4E9D0; --card-border: rgba(43,27,14,0.18);
          --muted: rgba(244,233,208,0.55); --muted-strong: rgba(244,233,208,0.75);
          --sidebar-active-bg: rgba(244,233,208,0.1); --metric-bg: rgba(244,233,208,0.06); --metric-border: rgba(244,233,208,0.14);
        }
        .bt-root[data-theme="light"] {
          --bg: #E9DCBD; --fg: #2B1B0E; --card-bg: #FFFBF0; --card-border: rgba(43,27,14,0.14);
          --muted: rgba(43,27,14,0.55); --muted-strong: rgba(43,27,14,0.72);
          --sidebar-active-bg: rgba(43,27,14,0.08); --metric-bg: rgba(43,27,14,0.04); --metric-border: rgba(43,27,14,0.12);
        }
        .bt-root {
          background-color: var(--bg); color: var(--fg);
          background-image: radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1.4px);
          background-size: 3px 3px;
        }
        .bt-root * { box-sizing: border-box; }
        .display-font { font-family: 'Fraunces', Georgia, serif; }
        .mono-font { font-family: 'IBM Plex Mono', monospace; }
        .ledger-title { display: inline-block; padding-bottom: 6px; border-bottom: 3px double var(--muted-strong); margin-bottom: 18px; }
        .paper-card {
          background-color: var(--card-bg); color: var(--ink); border-radius: 8px;
          background-image: radial-gradient(rgba(43,27,14,0.035) 1px, transparent 1.4px);
          background-size: 3px 3px;
          box-shadow: 0 1px 0 rgba(43,27,14,0.06), 0 10px 22px -16px rgba(43,27,14,0.45), 0 2px 6px -2px rgba(43,27,14,0.15);
          border: 1px solid var(--card-border);
        }
        .torn-top { position: relative; margin-top: 9px; }
        .torn-top::before {
          content: ""; position: absolute; left: 0; right: 0; top: -8px; height: 8px;
          background:
            linear-gradient(135deg, var(--card-bg) 25%, transparent 25%) 0 0/14px 14px repeat-x,
            linear-gradient(225deg, var(--card-bg) 25%, transparent 25%) 0 0/14px 14px repeat-x;
        }
        .field-label { display:block; font-size: 12px; letter-spacing: 0.03em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 4px; }
        input, select, textarea {
          width: 100%; background: var(--paper-dim); border: 1px solid rgba(43,27,14,0.18);
          border-radius: 6px; padding: 8px 10px; font-size: 14px; color: var(--ink); font-family: inherit;
        }
        input:focus, select:focus, textarea:focus { outline: 2px solid var(--forest); outline-offset: 1px; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: transform 0.06s ease; }
        .btn:active { transform: scale(0.97); }
        .btn-primary { background: var(--forest); color: #F3F5EF; box-shadow: 0 3px 0 var(--forest-800); }
        .btn-primary:active { box-shadow: 0 1px 0 var(--forest-800); }
        .btn-outline-dark { background: transparent; border-color: rgba(43,27,14,0.3); color: var(--ink); }
        .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 6px; border: 1px solid rgba(43,27,14,0.18); background: transparent; color: var(--ink-soft); cursor: pointer; }
        .icon-btn:hover { background: rgba(43,27,14,0.07); }
        .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
        .tag-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(43,27,14,0.08); color: var(--ink-soft); padding: 2px 8px; border-radius: 999px; font-size: 11px; }
        .stamp {
          display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px;
          border: 1.5px solid var(--rust); border-radius: 4px; color: var(--rust);
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
          transform: rotate(-3deg); font-family: 'Fraunces', serif;
        }
        .nav-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 8px; border: none; background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; cursor: pointer; text-align: left; }
        .nav-btn.active { background: var(--sidebar-active-bg); color: var(--fg); }
        .nav-btn:hover:not(.active) { background: var(--sidebar-active-bg); }
        .receipt-row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px dashed rgba(43,27,14,0.2); }
        .receipt-row:last-child { border-bottom: none; }
        .receipt-row-click { cursor: pointer; border-radius: 6px; }
        .receipt-row-click:hover { background: rgba(43,27,14,0.05); }
        .progress-track { height: 8px; border-radius: 999px; background: rgba(43,27,14,0.12); overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 999px; }
        .metric-card { background: var(--metric-bg); border: 1px solid var(--metric-border); border-radius: 8px; padding: 14px 16px; position: relative; }
        .metric-hero { grid-column: span 1; }
        .theme-toggle { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; border:1px solid var(--metric-border); background: var(--metric-bg); color: var(--fg); cursor:pointer; }
        .icon-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap: 6px; max-height: 160px; overflow-y:auto; padding: 4px; background: rgba(43,27,14,0.05); border-radius: 8px; }
        .icon-swatch { display:flex; align-items:center; justify-content:center; width: 32px; height: 32px; border-radius: 8px; border: 2px solid transparent; background: var(--paper-dim); cursor:pointer; color: var(--ink-soft); }
        .icon-swatch.selected { border-color: var(--forest); background: var(--forest-100); color: var(--forest-800); }
        .calc-popup { margin-top: 8px; background: rgba(43,27,14,0.05); border: 1px solid rgba(43,27,14,0.15); border-radius: 8px; padding: 8px; }
        .calc-display { text-align: right; font-size: 18px; padding: 6px 8px; margin-bottom: 6px; color: var(--ink); }
        .calc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .calc-btn { padding: 10px 0; border-radius: 6px; border: 1px solid rgba(43,27,14,0.15); background: #FFFCF3; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer; }
        .calc-btn:active { transform: scale(0.95); }
        .calc-eq { background: var(--forest); color: #fff; border-color: var(--forest); }
        .wax-seal {
          display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0;
          background: radial-gradient(circle at 35% 30%, #a23636, var(--wax) 70%);
          color: var(--wax-ink); font-weight: 700;
          box-shadow: 0 2px 5px rgba(0,0,0,0.4), inset 0 -2px 3px rgba(0,0,0,0.3), inset 0 2px 2px rgba(255,255,255,0.18);
          position: relative;
        }
        .wax-seal::after { content: ""; position: absolute; inset: -3px; border-radius: 50%; border: 2px dotted rgba(244,233,208,0.4); }
        .goal-badge { position: absolute; top: -12px; right: -8px; z-index: 2; }
        .privacy-toggle { display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:8px; border:1px solid var(--metric-border); background: var(--metric-bg); color: var(--fg); cursor:pointer; }
        @media (min-width: 768px) { .bt-layout { display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; } }
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
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
              <WaxSeal size={32} rotate={-8}><Wallet size={15} /></WaxSeal>
              <span className="display-font" style={{ fontSize: 18, fontWeight: 600 }}>Ledger</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button className="icon-btn md:hidden" onClick={() => supabase.auth.signOut()} aria-label="Sign out"><LogOut size={16} /></button>
            </div>
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
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Net worth</div>
            <div className="mono-font" style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{fmtMoney(netWorth)}</div>
          </div>
          <div className="hidden md:block mt-4" style={{ fontSize: 12, color: "var(--muted)" }}>
            {session.user.email}
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1"
              style={{ marginTop: 6, background: "none", border: "none", color: "var(--muted-strong)", cursor: "pointer", fontSize: 12, padding: 0 }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>

        <div>
          {loading ? (
            <p style={{ fontSize: 14, color: "var(--muted-strong)" }}>Loading your data…</p>
          ) : (
            <>
              {tab === "dashboard" && (
                <DashboardView
                  netWorth={netWorth} monthTotals={monthTotals} accountsWithBalance={accountsWithBalance}
                  dailySeries={dailySeries} categoryBreakdown={categoryBreakdown} budgetProgress={budgetProgress}
                  goalsWithProgress={goalsWithProgress} sortedTransactions={sortedTransactions}
                  accountName={accountName} categoryName={categoryName} categoryIcon={categoryIcon}
                  onNewTxn={() => setTxnModal("new")} onEditTxn={(t) => setTxnModal(t)}
                  hideAmounts={hideAmounts} onToggleHide={() => setHideAmounts((h) => !h)}
                />
              )}
              {tab === "transactions" && (
                <TransactionsView
                  transactions={sortedTransactions} accountName={accountName} categoryName={categoryName}
                  categoryColor={categoryColor} categoryIcon={categoryIcon}
                  onNew={() => setTxnModal("new")} onEdit={(t) => setTxnModal(t)} onDelete={deleteTransaction}
                />
              )}
              {tab === "accounts" && (
                <AccountsView
                  accounts={accountsWithBalance} onNew={() => setAccModal("new")} onEdit={(a) => setAccModal(a)}
                  onDelete={deleteAccount} onAdjust={(a) => setAdjustAccount(a)} netWorth={netWorth}
                />
              )}
              {tab === "categories" && (
                <CategoriesView categories={categories} transactions={transactions} onNew={() => setCatModal("new")} onEdit={(c) => setCatModal(c)} onDelete={deleteCategory} />
              )}
              {tab === "budgets" && (
                <BudgetsView budgetProgress={budgetProgress} categoryName={categoryName} onNew={() => setBudgetModal("new")} onEdit={(b) => setBudgetModal(b)} onDelete={deleteBudget} />
              )}
              {tab === "savings" && (
                <SavingsView
                  goalsWithProgress={goalsWithProgress} accountName={accountName}
                  onNew={() => setGoalModal("new")} onEdit={(g) => setGoalModal(g)} onDelete={deleteGoal}
                  onContribute={(g) => setContributeGoal(g)}
                />
              )}
              {tab === "debts" && (
                <DebtsView
                  debtProgress={debtProgress}
                  onNew={() => setDebtModal("new")} onEdit={(d) => setDebtModal(d)} onDelete={deleteDebt}
                  onLogPayment={(d) => setTxnModal({ type: "expense", debtId: d.id })}
                />
              )}
            </>
          )}
        </div>
      </div>

      {txnModal && (
        <TransactionForm
          initial={txnModal === "new" ? null : txnModal}
          accounts={accounts} categories={categories} budgets={budgets} debts={debts}
          onCancel={() => setTxnModal(null)} onSave={upsertTransaction}
        />
      )}
      {accModal && <AccountForm initial={accModal === "new" ? null : accModal} onCancel={() => setAccModal(null)} onSave={upsertAccount} />}
      {catModal && <CategoryForm initial={catModal === "new" ? null : catModal} onCancel={() => setCatModal(null)} onSave={upsertCategory} />}
      {budgetModal && (
        <BudgetForm initial={budgetModal === "new" ? null : budgetModal} categories={categories} onCancel={() => setBudgetModal(null)} onSave={upsertBudget} />
      )}
      {goalModal && (
        <GoalForm initial={goalModal === "new" ? null : goalModal} accounts={accounts} onCancel={() => setGoalModal(null)} onSave={upsertGoal} />
      )}
      {contributeGoal && (
        <ContributeForm goal={contributeGoal} onCancel={() => setContributeGoal(null)} onSave={contributeToGoal} />
      )}
      {adjustAccount && (
        <AdjustBalanceForm
          account={adjustAccount} currentBalance={accountBalance(adjustAccount.id)}
          onCancel={() => setAdjustAccount(null)} onSave={adjustAccountBalance}
        />
      )}
      {debtModal && (
        <DebtForm initial={debtModal === "new" ? null : debtModal} onCancel={() => setDebtModal(null)} onSave={upsertDebt} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

function DashboardView({
  netWorth, monthTotals, accountsWithBalance, dailySeries, categoryBreakdown, budgetProgress,
  goalsWithProgress, sortedTransactions, accountName, categoryName, categoryIcon, onNewTxn, onEditTxn,
  hideAmounts, onToggleHide,
}) {
  const totalSaved = goalsWithProgress.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goalsWithProgress.reduce((s, g) => s + g.targetAmount, 0);
  const show = (v) => (hideAmounts ? MASK : fmtMoney(v));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Dashboard</SectionTitle>
        <div className="flex items-center gap-2">
          <button className="privacy-toggle" onClick={onToggleHide} aria-label={hideAmounts ? "Show amounts" : "Hide amounts"} title={hideAmounts ? "Show amounts" : "Hide amounts"}>
            {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button className="btn btn-primary" onClick={onNewTxn}><Plus size={16} /> Log entry</button>
        </div>
      </div>

      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="metric-card">
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>Net worth</div>
          <div className="display-font mono-font" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>{show(netWorth)}</div>
        </div>
        <div className="metric-card">
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>Income (30d)</div>
          <div className="mono-font" style={{ fontSize: 22, fontWeight: 600, color: "#6E9161" }}>{show(monthTotals.inc)}</div>
        </div>
        <div className="metric-card">
          <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>Expenses (30d)</div>
          <div className="mono-font" style={{ fontSize: 22, fontWeight: 600, color: "#C1552F" }}>{show(monthTotals.exp)}</div>
        </div>
        {goalsWithProgress.length > 0 ? (
          <div className="metric-card">
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>Total saved</div>
            <div className="mono-font" style={{ fontSize: 22, fontWeight: 600, color: "#D19A3D" }}>{show(totalSaved)}</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{hideAmounts ? "goal hidden" : `of ${fmtMoney(totalTarget)} goal`}</div>
          </div>
        ) : (
          <div className="metric-card">
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>Net (30d)</div>
            <div className="mono-font" style={{ fontSize: 22, fontWeight: 600 }}>{show(monthTotals.inc - monthTotals.exp)}</div>
          </div>
        )}
      </div>

      <div className="paper-card torn-top p-4 mb-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Accounts overview</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {accountsWithBalance.map((a) => (
            <div key={a.id} style={{ borderLeft: `3px solid ${a.color}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{a.name}</div>
              <div className="mono-font" style={{ fontSize: 16, fontWeight: 600 }}>{hideAmounts ? MASK : fmtMoney(a.balance)}</div>
            </div>
          ))}
          {accountsWithBalance.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Add an account to get started.</p>}
        </div>
      </div>

      <div className="paper-card torn-top p-4 mb-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Net worth trend — last 21 days</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dailySeries}>
            <defs>
              <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5C7A52" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#5C7A52" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(43,27,14,0.12)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B4A2E" }} interval={2} />
            <YAxis tick={{ fontSize: 11, fill: "#6B4A2E" }} width={70} tickFormatter={(v) => (hideAmounts ? "" : fmtMoney(v))} />
            <Tooltip formatter={(v) => (hideAmounts ? MASK : fmtMoney(v))} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Area type="monotone" dataKey="Net worth" stroke="#5C7A52" fill="url(#nw)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="paper-card p-4">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>Income vs expense — daily</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(43,27,14,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B4A2E" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#6B4A2E" }} width={60} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill="#5C7A52" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="#A13A1F" radius={[3, 3, 0, 0]} />
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
          <p style={{ fontSize: 10, color: "var(--ink-soft)", marginBottom: 4, opacity: 0.8 }}>Tap an entry to edit it</p>
          <div>
            {sortedTransactions.slice(0, 6).map((t) => (
              <ReceiptRow key={t.id} t={t} accountName={accountName} categoryName={categoryName} categoryIcon={categoryIcon} onClick={onEditTxn} />
            ))}
            {sortedTransactions.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Nothing logged yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ t, accountName, categoryName, categoryIcon, onClick }) {
  const isExp = t.type === "expense";
  const isInc = t.type === "income";
  const isAdj = t.isAdjustment;
  const sign = isExp ? "−" : isInc ? "+" : "";
  const color = isExp ? "var(--rust-800)" : isInc ? "var(--forest-800)" : "var(--slate-800)";
  const label = isExp || isInc ? categoryName(t.categoryId) : `${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`;
  return (
    <div className={`receipt-row ${onClick ? "receipt-row-click" : ""}`} onClick={onClick ? () => onClick(t) : undefined}>
      <IconCircle bg={isAdj ? "var(--slate-100)" : isExp ? "var(--rust-100)" : isInc ? "var(--forest-100)" : "var(--slate-100)"} fg={color}>
        {isAdj ? <Scale size={16} /> : isExp ? <CategoryIcon name={categoryIcon(t.categoryId)} size={17} /> : isInc ? <ArrowUpCircle size={17} /> : <ArrowLeftRight size={16} />}
      </IconCircle>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || label}</div>
        <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{isAdj ? "Balance adjustment" : label} · {fmtDate(t.date)} {fmtTime(t.date)}</div>
      </div>
      <div className="mono-font" style={{ fontSize: 14, fontWeight: 600, color }}>{sign}{fmtMoney(t.amount)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transactions                                                         */
/* ------------------------------------------------------------------ */

function TransactionsView({ transactions, accountName, categoryName, categoryColor, categoryIcon, onNew, onEdit, onDelete }) {
  const [filterType, setFilterType] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = transactions.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const label = t.type === "transfer" ? `${accountName(t.fromAccountId)} ${accountName(t.toAccountId)}` : `${accountName(t.accountId)} ${categoryName(t.categoryId)}`;
    return (t.note || "").toLowerCase().includes(q) || label.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionTitle>Transactions</SectionTitle>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Log entry</button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="paper-card flex items-center gap-2" style={{ flex: 1, minWidth: 200, padding: "6px 10px" }}>
          <Search size={15} style={{ color: "var(--ink-soft)", flexShrink: 0 }} />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search note, category, or account…"
            style={{ background: "transparent", border: "none", padding: "4px 0" }}
          />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ width: "auto" }}>
          <option value="all">All types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>

      <div className="paper-card torn-top">
        {filtered.length === 0 && <p style={{ padding: 20, fontSize: 13, color: "var(--ink-soft)" }}>Nothing matches yet.</p>}
        <div style={{ padding: "4px 14px" }}>
          {filtered.map((t) => {
            const isExp = t.type === "expense";
            const isInc = t.type === "income";
            const isAdj = t.isAdjustment;
            const sign = isExp ? "−" : isInc ? "+" : "";
            const color = isExp ? "var(--rust-800)" : isInc ? "var(--forest-800)" : "var(--slate-800)";
            return (
              <div key={t.id} className="receipt-row">
                <IconCircle bg={isAdj ? "var(--slate-100)" : isExp ? "var(--rust-100)" : isInc ? "var(--forest-100)" : "var(--slate-100)"} fg={color}>
                  {isAdj ? <Scale size={16} /> : isExp ? <CategoryIcon name={categoryIcon(t.categoryId)} size={17} /> : isInc ? <ArrowUpCircle size={17} /> : <ArrowLeftRight size={16} />}
                </IconCircle>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.note || "(no note)"}</span>
                    <TypePill type={t.type} />
                    {isAdj && <span className="stamp">Reconciled</span>}
                    {(isExp || isInc) && !isAdj && (
                      <span className="tag-chip" style={{ background: `${categoryColor(t.categoryId)}22`, color: categoryColor(t.categoryId) }}>
                        <CategoryIcon name={categoryIcon(t.categoryId)} size={10} />{categoryName(t.categoryId)}
                      </span>
                    )}
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

function AccountsView({ accounts, onNew, onEdit, onDelete, onAdjust, netWorth }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Accounts</SectionTitle>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New account</button>
      </div>
      <div className="paper-card torn-top p-4 mb-4">
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Total net worth across all accounts</div>
        <div className="display-font mono-font" style={{ fontSize: 28, fontWeight: 700 }}>{fmtMoney(netWorth)}</div>
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
                <button className="icon-btn" onClick={() => onAdjust(a)} aria-label="Adjust balance" title="Adjust balance"><Scale size={14} /></button>
                <button className="icon-btn" onClick={() => onEdit(a)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => onDelete(a.id)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="mono-font" style={{ fontSize: 22, fontWeight: 600, marginTop: 10 }}>{fmtMoney(a.balance)}</div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Opening balance {fmtMoney(a.initialBalance)}</div>
          </div>
        ))}
        {accounts.length === 0 && <p style={{ fontSize: 13, color: "var(--muted-strong)" }}>No accounts yet — create your first one.</p>}
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
    <div className="paper-card torn-top p-4 mb-4">
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--ink-soft)" }}>{title}</h3>
      <div className="flex flex-col gap-2">
        {list.map((c) => (
          <div key={c.id} className="flex items-center justify-between" style={{ padding: "6px 0", borderBottom: "1px dashed rgba(43,27,14,0.2)" }}>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center rounded-full" style={{ width: 24, height: 24, background: `${c.color}22`, color: c.color }}>
                <CategoryIcon name={c.icon} size={13} />
              </span>
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
        <SectionTitle>Categories</SectionTitle>
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
        <SectionTitle>Budgets</SectionTitle>
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
        {budgetProgress.length === 0 && <p style={{ fontSize: 13, color: "var(--muted-strong)" }}>No budgets set yet.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Savings                                                              */
/* ------------------------------------------------------------------ */

function SavingsView({ goalsWithProgress, accountName, onNew, onEdit, onDelete, onContribute }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Savings</SectionTitle>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New goal</button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {goalsWithProgress.map((g) => (
          <div key={g.id} className="paper-card p-4" style={{ borderTop: `4px solid ${g.color}`, position: "relative", overflow: "visible" }}>
            {g.pct >= 100 && (
              <div className="goal-badge">
                <WaxSeal size={46} rotate={-10}>✓</WaxSeal>
              </div>
            )}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {g.accountId ? `Linked to ${accountName(g.accountId)}` : "Tracked manually"}
                  {g.targetDate ? ` · by ${fmtDate(g.targetDate)}` : ""}
                </div>
              </div>
              <div className="flex gap-1">
                <button className="icon-btn" onClick={() => onEdit(g)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => onDelete(g.id)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${g.pct}%`, background: g.pct >= 100 ? "var(--forest)" : "var(--brass)" }} />
            </div>
            <div className="flex justify-between mt-2 mono-font" style={{ fontSize: 12 }}>
              <span>{fmtMoney(g.saved)} saved</span>
              <span style={{ color: "var(--ink-soft)" }}>of {fmtMoney(g.targetAmount)}</span>
            </div>
            {!g.accountId && (
              <button className="btn btn-outline-dark mt-3" style={{ width: "100%", justifyContent: "center" }} onClick={() => onContribute(g)}>
                <PiggyBank size={14} /> Add contribution
              </button>
            )}
          </div>
        ))}
        {goalsWithProgress.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted-strong)" }}>
            No savings goals yet. Create one — link it to a dedicated account for automatic tracking, or track it manually.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Debts — the reverse of Savings: progress fills as the balance shrinks */
/* ------------------------------------------------------------------ */

function DebtsView({ debtProgress, onNew, onEdit, onDelete, onLogPayment }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Debts</SectionTitle>
        <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> New debt</button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {debtProgress.map((d) => (
          <div key={d.id} className="paper-card p-4" style={{ borderTop: `4px solid ${d.color}`, position: "relative", overflow: "visible" }}>
            {d.remaining <= 0 && (
              <div className="goal-badge">
                <WaxSeal size={46} rotate={-10}>✓</WaxSeal>
              </div>
            )}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {d.remaining <= 0 ? "Paid off" : "Owed"}{d.dueDate ? ` · due ${fmtDate(d.dueDate)}` : ""}
                </div>
              </div>
              <div className="flex gap-1">
                <button className="icon-btn" onClick={() => onEdit(d)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => onDelete(d.id)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${d.pct}%`, background: d.pct >= 100 ? "var(--forest)" : "var(--rust)" }} />
            </div>
            <div className="flex justify-between mt-2 mono-font" style={{ fontSize: 12 }}>
              <span>{fmtMoney(d.paid)} paid</span>
              <span style={{ color: "var(--ink-soft)" }}>of {fmtMoney(d.totalAmount)}</span>
            </div>
            <div className="mono-font" style={{ fontSize: 16, fontWeight: 700, marginTop: 6, color: d.remaining <= 0 ? "var(--forest-800)" : "var(--rust-800)" }}>
              {fmtMoney(d.remaining)} remaining
            </div>
            {d.remaining > 0 && (
              <button className="btn btn-outline-dark mt-3" style={{ width: "100%", justifyContent: "center" }} onClick={() => onLogPayment(d)}>
                <CreditCard size={14} /> Log a payment
              </button>
            )}
          </div>
        ))}
        {debtProgress.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted-strong)" }}>
            No debts tracked yet. Add one, then log payments against it — each payment automatically deducts from what's left.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                                */
/* ------------------------------------------------------------------ */

function TransactionForm({ initial, accounts, categories, budgets, debts, onCancel, onSave }) {
  const isAdjustment = initial?.isAdjustment || false;
  const isEditing = !!initial?.id;
  const [type, setType] = useState(initial?.type || "expense");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId || accounts[0]?.id || "");
  const [fromAccountId, setFromAccountId] = useState(initial?.fromAccountId || accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId || accounts[1]?.id || accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [budgetId, setBudgetId] = useState(initial?.budgetId || "");
  const [debtId, setDebtId] = useState(initial?.debtId || "");
  const [feeEnabled, setFeeEnabled] = useState(initial?.fee?.enabled || false);
  const [feeAmount, setFeeAmount] = useState(initial?.fee?.amount ?? "");
  const [note, setNote] = useState(initial?.note || "");
  const [saving, setSaving] = useState(false);

  const relevantCats = categories.filter((c) => c.type === type);
  useEffect(() => {
    if (!isAdjustment && type !== "transfer" && relevantCats.length && !relevantCats.some((c) => c.id === categoryId)) {
      setCategoryId(relevantCats[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const base = { id: initial?.id, type, amount: amt, note, date: initial?.date || new Date().toISOString(), isAdjustment };
    setSaving(true);
    if (type === "transfer") {
      if (fromAccountId === toAccountId) { setSaving(false); return; }
      await onSave({ ...base, fromAccountId, toAccountId, fee: { enabled: feeEnabled, amount: feeEnabled ? parseFloat(feeAmount) || 0 : 0 } });
    } else {
      await onSave({
        ...base, accountId,
        categoryId: isAdjustment ? null : categoryId,
        budgetId: isAdjustment ? null : (type === "expense" ? budgetId || null : null),
        debtId: isAdjustment ? null : (type === "expense" ? debtId || null : null),
      });
    }
    setSaving(false);
  };

  return (
    <Modal title={isAdjustment ? "Edit balance adjustment" : isEditing ? "Edit entry" : "Log a new entry"} onClose={onCancel}>
      <form onSubmit={submit}>
        {isAdjustment && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Scale size={13} /> This entry reconciles your logged balance with a real-world amount.
          </p>
        )}
        <Field label="Entry type">
          <div className="flex gap-2">
            {["expense", "income", "transfer"].map((t) => (
              <button
                type="button" key={t} className="btn"
                style={{ flex: 1, justifyContent: "center", background: type === t ? (t === "expense" ? "var(--rust)" : t === "income" ? "var(--forest)" : "var(--slate)") : "var(--paper-dim)", color: type === t ? "#fff" : "var(--ink-soft)" }}
                onClick={() => setType(t)}
                disabled={isAdjustment && t === "transfer"}
              >
                {t === "expense" ? "Expense" : t === "income" ? "Income" : "Transfer"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Amount (PHP)">
          <AmountInput value={amount} onChange={setAmount} required />
        </Field>

        {type !== "transfer" ? (
          <>
            <Field label={type === "expense" ? "Withdraw from account" : "Deposit to account"}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            {!isAdjustment && (
              <>
                <Field label="Category">
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    {relevantCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {relevantCats.length === 0 && <option value="">No categories — add one first</option>}
                  </select>
                </Field>
                {type === "expense" && (
                  <Field label="Assign to a budget">
                    <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
                      <option value="">Auto (match by category)</option>
                      {budgets.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.period})</option>)}
                    </select>
                  </Field>
                )}
                {type === "expense" && debts && debts.length > 0 && (
                  <Field label="Apply to a debt (optional)">
                    <select value={debtId} onChange={(e) => setDebtId(e.target.value)}>
                      <option value="">Not a debt payment</option>
                      {debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {debtId && <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: -6 }}>This amount will be deducted from that debt's remaining balance.</p>}
                  </Field>
                )}
              </>
            )}
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
              {feeEnabled && <AmountInput value={feeAmount} onChange={setFeeAmount} placeholder="Fee amount" />}
            </Field>
          </>
        )}

        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
        </Field>

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
            <option value="savings">Savings</option>
            <option value="investment">Investment</option>
            <option value="crypto">Crypto</option>
            <option value="loan">Loan</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Opening balance (PHP)">
          <AmountInput value={initialBalance} onChange={setInitialBalance} />
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
  const [icon, setIcon] = useState(initial?.icon || "Tag");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: initial?.id, name: name.trim(), type, color, icon });
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
        <Field label="Icon">
          <div className="icon-grid">
            {ICON_NAMES.map((name2) => (
              <button
                type="button" key={name2}
                className={`icon-swatch ${icon === name2 ? "selected" : ""}`}
                onClick={() => setIcon(name2)}
                aria-label={name2}
              >
                <CategoryIcon name={name2} size={16} />
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
        <Field label="Budget amount (PHP)"><AmountInput value={amount} onChange={setAmount} required /></Field>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create budget"}</button>
        </div>
      </form>
    </Modal>
  );
}

function GoalForm({ initial, accounts, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [targetAmount, setTargetAmount] = useState(initial?.targetAmount ?? "");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ? initial.targetDate.slice(0, 10) : "");
  const [accountId, setAccountId] = useState(initial?.accountId || "");
  const [color, setColor] = useState(initial?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(targetAmount);
    if (!name.trim() || !amt || amt <= 0) return;
    setSaving(true);
    await onSave({
      id: initial?.id, name: name.trim(), targetAmount: amt,
      targetDate: targetDate || null, accountId: accountId || null,
      manualSaved: initial?.manualSaved ?? 0, color,
    });
    setSaving(false);
  };

  return (
    <Modal title={initial ? "Edit savings goal" : "New savings goal"} onClose={onCancel}>
      <form onSubmit={submit}>
        <Field label="Goal name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" required /></Field>
        <Field label="Target amount (PHP)"><AmountInput value={targetAmount} onChange={setTargetAmount} required /></Field>
        <Field label="Target date (optional)">
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
        <Field label="Track using">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Manually (I'll add contributions myself)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>Linked to {a.name} — auto-tracks that account's balance</option>)}
          </select>
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
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create goal"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DebtForm({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [totalAmount, setTotalAmount] = useState(initial?.totalAmount ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ? initial.dueDate.slice(0, 10) : "");
  const [color, setColor] = useState(initial?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(totalAmount);
    if (!name.trim() || !amt || amt <= 0) return;
    setSaving(true);
    await onSave({ id: initial?.id, name: name.trim(), totalAmount: amt, dueDate: dueDate || null, color });
    setSaving(false);
  };

  return (
    <Modal title={initial ? "Edit debt" : "New debt"} onClose={onCancel}>
      <form onSubmit={submit}>
        <Field label="Debt name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Credit card, Student loan" required /></Field>
        <Field label="Total amount owed (PHP)"><AmountInput value={totalAmount} onChange={setTotalAmount} required /></Field>
        <Field label="Due date (optional)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Color tag">
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: color === c ? "2px solid var(--ink)" : "2px solid transparent" }} aria-label={`Choose color ${c}`} />
            ))}
          </div>
        </Field>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>
          Once created, log payments against this debt from the Debts tab (or by picking it in the
          "Apply to a debt" field when logging any expense) — each payment automatically reduces
          what's left.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create debt"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ContributeForm({ goal, onCancel, onSave }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("add"); // 'add' | 'remove'
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    await onSave(goal, mode === "add" ? amt : -amt);
    setSaving(false);
  };

  return (
    <Modal title={`Update "${goal.name}"`} onClose={onCancel}>
      <form onSubmit={submit}>
        <Field label="Currently saved">
          <p className="mono-font" style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoney(goal.manualSaved || 0)}</p>
        </Field>
        <Field label="Action">
          <div className="flex gap-2">
            <button type="button" className="btn" style={{ flex: 1, justifyContent: "center", background: mode === "add" ? "var(--forest)" : "var(--paper-dim)", color: mode === "add" ? "#fff" : "var(--ink-soft)" }} onClick={() => setMode("add")}>Add money</button>
            <button type="button" className="btn" style={{ flex: 1, justifyContent: "center", background: mode === "remove" ? "var(--rust)" : "var(--paper-dim)", color: mode === "remove" ? "#fff" : "var(--ink-soft)" }} onClick={() => setMode("remove")}>Withdraw</button>
          </div>
        </Field>
        <Field label="Amount (PHP)"><AmountInput value={amount} onChange={setAmount} required /></Field>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Update"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustBalanceForm({ account, currentBalance, onCancel, onSave }) {
  const [actual, setActual] = useState(String(Math.round(currentBalance * 100) / 100));
  const [note, setNote] = useState("Balance adjustment");
  const [saving, setSaving] = useState(false);

  const diff = (parseFloat(actual) || 0) - currentBalance;
  const meaningfulDiff = Math.abs(diff) > 0.004;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(account, actual, note);
    setSaving(false);
  };

  return (
    <Modal title={`Adjust "${account.name}"`} onClose={onCancel}>
      <form onSubmit={submit}>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>
          Use this when your logged balance doesn't match what your bank or wallet actually shows —
          for example, if you forgot to log something. It creates a dated adjustment entry so your
          history stays traceable, instead of silently editing the past.
        </p>
        <Field label="Currently tracked balance">
          <p className="mono-font" style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoney(currentBalance)}</p>
        </Field>
        <Field label="Actual balance right now">
          <AmountInput value={actual} onChange={setActual} required />
        </Field>
        {meaningfulDiff && (
          <p style={{ fontSize: 12, color: diff > 0 ? "var(--forest)" : "var(--rust)", marginTop: -8, marginBottom: 10 }}>
            This will log {diff > 0 ? "an income" : "an expense"} adjustment of {fmtMoney(Math.abs(diff))}.
          </p>
        )}
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !meaningfulDiff}>{saving ? "Saving…" : "Save adjustment"}</button>
        </div>
      </form>
    </Modal>
  );
}
