import { useState, useMemo, useEffect } from "react";

// Safe storage that falls back to in-memory when localStorage is blocked
const store = (() => {
  const mem: Record<string, string> = {};
  const safe = {
    get: (k: string) => { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
    set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  };
  return safe;
})();
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  X,
  Home,
  ShoppingCart,
  Coffee,
  DollarSign,
  TrendingUp,
  Repeat,
  CreditCard,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Category = "fixed" | "variable" | "leisure";

interface Expense {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  category: Category;
  totalInstallments: number; // 0=recurring, 1=once, n>1=installments
  startMonth: string; // "YYYY-MM"
}

interface Payment {
  expenseId: string;
  month: string;
  paid: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CATS = {
  fixed: {
    label: "Despesas Fixas",
    short: "Fixas",
    target: 50,
    color: "#5b7fff",
    alpha: "rgba(91,127,255,0.12)",
    icon: Home,
  },
  variable: {
    label: "Despesas Variáveis",
    short: "Variáveis",
    target: 40,
    color: "#ff9f43",
    alpha: "rgba(255,159,67,0.12)",
    icon: ShoppingCart,
  },
  leisure: {
    label: "Lazer",
    short: "Lazer",
    target: 10,
    color: "#26de81",
    alpha: "rgba(38,222,129,0.12)",
    icon: Coffee,
  },
} as const;

const CATS_ORDER: Category[] = ["fixed", "variable", "leisure"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtMonthLong = (m: string) => {
  const [y, mo] = m.split("-");
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${names[parseInt(mo) - 1]} ${y}`;
};

const fmtMonthShort = (m: string) => {
  const [y, mo] = m.split("-");
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[parseInt(mo) - 1]}/${y.slice(2)}`;
};

const monthDiff = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const todayMonth = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})();

const todayDay = new Date().getDate();

const uid = () => Math.random().toString(36).slice(2, 10);

function getVisibleExpenses(expenses: Expense[], month: string) {
  return expenses
    .filter((e) => {
      if (e.startMonth > month) return false;
      if (e.totalInstallments === 0) return true;
      if (e.totalInstallments === 1) return e.startMonth === month;
      return monthDiff(e.startMonth, month) < e.totalInstallments;
    })
    .map((e) => ({
      expense: e,
      installNum: monthDiff(e.startMonth, month) + 1,
    }))
    .sort((a, b) => a.expense.dueDay - b.expense.dueDay);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border border-border px-4 py-3 text-sm shadow-2xl"
      style={{ background: "#1a1e35" }}
    >
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-8">
          <span className="text-muted-foreground">{p.name}</span>
          <span
            className="font-medium"
            style={{ fontFamily: "'DM Mono', monospace", color: p.name === "Meta" ? "#6471a8" : p.fill }}
          >
            {fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Budget Rings (SVG) ────────────────────────────────────────────────────────
function Ring({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min((pct / 100) * circ, circ);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke="rgba(255,255,255,0.06)" strokeWidth={5} fill="none"
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={5} fill="none"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    </svg>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  month,
  onMonthChange,
  income,
  editingIncome,
  incomeInput,
  onEditIncome,
  onIncomeChange,
  onIncomeSubmit,
  totals,
  grandTotal,
}: {
  month: string;
  onMonthChange: (m: string) => void;
  income: number;
  editingIncome: boolean;
  incomeInput: string;
  onEditIncome: () => void;
  onIncomeChange: (v: string) => void;
  onIncomeSubmit: () => void;
  totals: Record<Category, { total: number; paid: number }>;
  grandTotal: number;
}) {
  const remaining = income - grandTotal;
  const isCurrentMonth = month === todayMonth;

  return (
    <aside
      className="w-72 shrink-0 flex flex-col border-r border-border px-6 py-8 gap-6"
      style={{ background: "var(--sidebar)", minHeight: "100vh" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #5b7fff 0%, #26de81 100%)" }}
        >
          <DollarSign size={15} className="text-white" />
        </div>
        <span className="font-semibold text-sm tracking-wide">FinControl</span>
        {isCurrentMonth && (
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(91,127,255,0.18)", color: "#5b7fff" }}
          >
            hoje
          </span>
        )}
      </div>

      {/* Month nav */}
      <div>
        <p className="text-xs uppercase tracking-widest font-medium text-muted-foreground mb-2">
          Período
        </p>
        <div className="flex items-center justify-between">
          <button
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold">{fmtMonthShort(month)}</span>
          <button
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Income */}
      <div>
        <p className="text-xs uppercase tracking-widest font-medium text-muted-foreground mb-2">
          Renda Mensal
        </p>
        {editingIncome ? (
          <div className="flex gap-2">
            <input
              type="number"
              value={incomeInput}
              onChange={(e) => onIncomeChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onIncomeSubmit()}
              onBlur={onIncomeSubmit}
              className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              style={{ background: "var(--input-background)" }}
              autoFocus
            />
            <button
              onClick={onIncomeSubmit}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
              style={{ background: "#5b7fff" }}
            >
              <Check size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={onEditIncome}
            className="w-full text-left group flex items-baseline gap-2"
          >
            <span
              className="text-xl font-medium"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              {fmt(income)}
            </span>
            <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              editar
            </span>
          </button>
        )}
      </div>

      {/* Category rings */}
      <div>
        <p className="text-xs uppercase tracking-widest font-medium text-muted-foreground mb-3">
          Distribuição
        </p>
        <div className="space-y-4">
          {CATS_ORDER.map((cat) => {
            const c = CATS[cat];
            const target = Math.round((income * c.target) / 100);
            const spent = totals[cat].total;
            const pct = target > 0 ? Math.min((spent / target) * 100, 100) : 0;
            const over = spent > target;
            return (
              <div key={cat} className="flex items-center gap-3">
                <Ring pct={pct} color={over ? "#ff4d6d" : c.color} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium">{c.short}</span>
                    <span className="text-xs font-medium" style={{ color: c.color }}>
                      {c.target}%
                    </span>
                  </div>
                  <div
                    className="text-xs text-muted-foreground truncate"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {fmt(spent)}
                    <span className="opacity-50"> / {fmt(target)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Balance summary */}
      <div className="space-y-2.5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Comprometido</span>
          <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(grandTotal)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Disponível</span>
          <span
            className="font-semibold"
            style={{
              fontFamily: "'DM Mono', monospace",
              color: remaining >= 0 ? "#26de81" : "#ff4d6d",
            }}
          >
            {fmt(remaining)}
          </span>
        </div>
      </div>

      {/* Day indicator */}
      {isCurrentMonth && (
        <div
          className="mt-auto rounded-xl px-4 py-3 text-xs"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="text-muted-foreground">Hoje é dia </span>
          <span className="font-semibold text-foreground">{todayDay}</span>
          <span className="text-muted-foreground"> de {fmtMonthLong(month)}</span>
        </div>
      )}
    </aside>
  );
}

// ── Budget Cards ──────────────────────────────────────────────────────────────
function BudgetCards({
  income,
  totals,
}: {
  income: number;
  totals: Record<Category, { total: number; paid: number }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {CATS_ORDER.map((cat) => {
        const c = CATS[cat];
        const Icon = c.icon;
        const target = Math.round((income * c.target) / 100);
        const spent = totals[cat].total;
        const pct = target > 0 ? Math.min((spent / target) * 100, 100) : 0;
        const over = spent > target;
        return (
          <div
            key={cat}
            className="rounded-2xl p-5 border border-border"
            style={{ background: c.alpha }}
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: c.color + "25" }}
              >
                <Icon size={14} style={{ color: c.color }} />
              </div>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: c.color + "20", color: c.color }}
              >
                {c.target}%
              </span>
            </div>
            <div
              className="text-lg font-semibold mb-0.5"
              style={{ fontFamily: "'DM Mono', monospace", color: over ? "#ff4d6d" : "var(--foreground)" }}
            >
              {fmt(spent)}
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              meta {fmt(target)}
            </div>
            <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: over ? "#ff4d6d" : c.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Expense Item ──────────────────────────────────────────────────────────────
function ExpenseItem({
  expense,
  installNum,
  paid,
  onToggle,
  onDelete,
  currentMonth,
}: {
  expense: Expense;
  installNum: number;
  paid: boolean;
  onToggle: () => void;
  onDelete: () => void;
  currentMonth: string;
}) {
  const cat = CATS[expense.category];
  const isLate =
    !paid &&
    currentMonth === todayMonth &&
    expense.dueDay < todayDay;

  let badge: string | null = null;
  if (expense.totalInstallments === 0) badge = "Recorrente";
  else if (expense.totalInstallments > 1) badge = `${installNum}/${expense.totalInstallments}`;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all group"
      style={{
        background: paid ? "transparent" : "var(--card)",
        borderColor: isLate
          ? "rgba(255,77,109,0.3)"
          : paid
          ? "var(--border)"
          : "var(--border)",
        opacity: paid ? 0.55 : 1,
      }}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
        style={{
          borderColor: paid ? cat.color : isLate ? "#ff4d6d" : "rgba(255,255,255,0.2)",
          background: paid ? cat.color : "transparent",
        }}
        title={paid ? "Marcar como não pago" : "Marcar como pago"}
      >
        {paid && <Check size={10} className="text-white" />}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-sm font-medium ${paid ? "line-through text-muted-foreground" : ""}`}
          >
            {expense.name}
          </span>
          {badge && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "10px",
                background: cat.color + "20",
                color: cat.color,
              }}
            >
              {badge}
            </span>
          )}
          {isLate && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ fontSize: "10px", background: "rgba(255,77,109,0.15)", color: "#ff4d6d" }}
            >
              vencida
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Vence dia {expense.dueDay}
        </div>
      </div>

      {/* Amount */}
      <span
        className="text-sm font-semibold shrink-0"
        style={{
          fontFamily: "'DM Mono', monospace",
          color: paid ? "var(--muted-foreground)" : "var(--foreground)",
        }}
      >
        {fmt(expense.amount)}
      </span>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive text-muted-foreground"
        title="Excluir"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Expense Section ───────────────────────────────────────────────────────────
function ExpenseSection({
  category,
  items,
  isPaid,
  onToggle,
  onDelete,
  onAdd,
  currentMonth,
}: {
  category: Category;
  items: Array<{ expense: Expense; installNum: number }>;
  isPaid: (id: string) => boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  currentMonth: string;
}) {
  const c = CATS[category];
  const Icon = c.icon;
  const total = items.reduce((s, { expense }) => s + expense.amount, 0);
  const paidCount = items.filter(({ expense }) => isPaid(expense.id)).length;

  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: c.color + "22" }}
          >
            <Icon size={12} style={{ color: c.color }} />
          </div>
          <h2 className="text-sm font-semibold">{c.label}</h2>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {paidCount}/{items.length}
            </span>
          )}
        </div>
        {total > 0 && (
          <span
            className="text-sm font-medium"
            style={{ fontFamily: "'DM Mono', monospace", color: c.color }}
          >
            {fmt(total)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <div
            className="py-5 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground"
          >
            Sem despesas nesta categoria
          </div>
        )}
        {items.map(({ expense, installNum }) => (
          <ExpenseItem
            key={expense.id}
            expense={expense}
            installNum={installNum}
            paid={isPaid(expense.id)}
            onToggle={() => onToggle(expense.id)}
            onDelete={() => onDelete(expense.id)}
            currentMonth={currentMonth}
          />
        ))}
        <button
          onClick={onAdd}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all group"
        >
          <Plus size={13} className="group-hover:text-primary transition-colors" />
          Adicionar despesa
        </button>
      </div>
    </section>
  );
}

// ── Spending Chart ────────────────────────────────────────────────────────────
function SpendingChart({
  chartData,
  last6Months,
}: {
  chartData: Array<{ name: string; Meta: number; Gasto: number; fill: string }>;
  last6Months: Array<{ month: string; total: number }>;
}) {
  const [view, setView] = useState<"category" | "trend">("category");

  return (
    <div
      className="mt-8 rounded-2xl border border-border p-6"
      style={{ background: "var(--card)" }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold">Análise de Gastos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {view === "category" ? "Meta vs. gasto por categoria" : "Tendência dos últimos meses"}
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-border text-xs">
          <button
            onClick={() => setView("category")}
            className="px-3 py-1.5 transition-colors"
            style={{
              background: view === "category" ? "rgba(91,127,255,0.2)" : "transparent",
              color: view === "category" ? "#5b7fff" : "var(--muted-foreground)",
            }}
          >
            Categorias
          </button>
          <button
            onClick={() => setView("trend")}
            className="px-3 py-1.5 transition-colors border-l border-border"
            style={{
              background: view === "trend" ? "rgba(91,127,255,0.2)" : "transparent",
              color: view === "trend" ? "#5b7fff" : "var(--muted-foreground)",
            }}
          >
            Tendência
          </button>
        </div>
      </div>

      {view === "category" ? (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4} barCategoryGap="32%">
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#6471a8" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#6471a8", fontFamily: "'DM Mono', monospace" }}
                tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                width={52}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="Meta" radius={[5, 5, 0, 0]} fill="rgba(255,255,255,0.06)" />
              <Bar dataKey="Gasto" radius={[5, 5, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={`gasto-${entry.name}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-6 mt-3 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.12)" }} />
              <span className="text-xs text-muted-foreground">Meta</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-1.5 rounded" style={{ background: "#5b7fff" }} />
              <span className="text-xs text-muted-foreground">Gasto</span>
            </div>
          </div>
        </>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={last6Months.map((m) => ({
              name: fmtMonthShort(m.month),
              Total: m.total,
            }))}
            barCategoryGap="40%"
          >
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#6471a8" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#6471a8", fontFamily: "'DM Mono', monospace" }}
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              width={52}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="Total" radius={[5, 5, 0, 0]} fill="#5b7fff" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Add Modal ─────────────────────────────────────────────────────────────────
function AddModal({
  defaultCategory,
  currentMonth,
  onClose,
  onAdd,
}: {
  defaultCategory: Category;
  currentMonth: string;
  onClose: () => void;
  onAdd: (e: Expense) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState(String(todayDay));
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [installType, setInstallType] = useState<"once" | "recurring" | "installment">("once");
  const [installCount, setInstallCount] = useState("12");
  const [startMonth, setStartMonth] = useState(currentMonth);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!name.trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;
    const totalInstallments =
      installType === "recurring"
        ? 0
        : installType === "installment"
        ? Math.max(2, parseInt(installCount) || 2)
        : 1;
    onAdd({
      id: uid(),
      name: name.trim(),
      amount: parsedAmount,
      dueDay: Math.min(31, Math.max(1, parseInt(dueDay) || todayDay)),
      category,
      totalInstallments,
      startMonth: installType === "once" ? currentMonth : startMonth,
    });
  };

  const installTypes: Array<[typeof installType, string, typeof Repeat | typeof CreditCard | typeof DollarSign]> = [
    ["once", "Única", DollarSign],
    ["recurring", "Recorrente", Repeat],
    ["installment", "Parcelada", CreditCard],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,0.7)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl border border-border p-6 shadow-2xl"
        style={{ background: "#1a1e35" }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold">Nova Despesa</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Nome da despesa</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Aluguel, Netflix, Academia..."
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              style={{ background: "rgba(255,255,255,0.06)" }}
              required
              autoFocus
            />
          </div>

          {/* Amount + Due day */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Valor (R$)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                step="0.01"
                min="0.01"
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                style={{ background: "rgba(255,255,255,0.06)" }}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Dia de vencimento</label>
              <input
                type="number"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                min="1"
                max="31"
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Categoria</label>
            <div className="grid grid-cols-3 gap-2">
              {CATS_ORDER.map((cat) => {
                const c = CATS[cat];
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className="py-2.5 px-2 rounded-xl text-xs font-medium border transition-all"
                    style={{
                      borderColor: active ? c.color : "rgba(255,255,255,0.08)",
                      background: active ? c.color + "22" : "rgba(255,255,255,0.04)",
                      color: active ? c.color : "var(--muted-foreground)",
                    }}
                  >
                    {c.short}
                    <div className="text-xs opacity-70 mt-0.5">{c.target}%</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {installTypes.map(([val, lbl, Icon]) => {
                const active = installType === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setInstallType(val)}
                    className="py-2.5 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-1"
                    style={{
                      borderColor: active ? "#5b7fff" : "rgba(255,255,255,0.08)",
                      background: active ? "rgba(91,127,255,0.18)" : "rgba(255,255,255,0.04)",
                      color: active ? "#5b7fff" : "var(--muted-foreground)",
                    }}
                  >
                    <Icon size={13} />
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Installment options */}
          {installType === "installment" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Nº de parcelas</label>
                <input
                  type="number"
                  value={installCount}
                  onChange={(e) => setInstallCount(e.target.value)}
                  min="2"
                  max="240"
                  className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Início</label>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              </div>
            </div>
          )}

          {installType === "recurring" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">A partir de</label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 mt-2"
            style={{ background: "linear-gradient(135deg, #5b7fff, #4466ff)" }}
          >
            Adicionar Despesa
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [month, setMonth] = useState(todayMonth);
  const [income, setIncome] = useState(5000);
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("5000");
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try { return JSON.parse(store.get("fin_expenses") || "[]"); } catch { return []; }
  });
  const [payments, setPayments] = useState<Payment[]>(() => {
    try { return JSON.parse(store.get("fin_payments") || "[]"); } catch { return []; }
  });
  const [showModal, setShowModal] = useState(false);
  const [modalCategory, setModalCategory] = useState<Category>("fixed");

  useEffect(() => {
    const saved = store.get("fin_income");
    if (saved) { const v = Number(saved); setIncome(v); setIncomeInput(String(v)); }
  }, []);
  useEffect(() => { store.set("fin_expenses", JSON.stringify(expenses)); }, [expenses]);
  useEffect(() => { store.set("fin_payments", JSON.stringify(payments)); }, [payments]);
  useEffect(() => { store.set("fin_income", String(income)); }, [income]);

  const visible = useMemo(
    () => getVisibleExpenses(expenses, month),
    [expenses, month]
  );

  const isPaid = (id: string) =>
    payments.some((p) => p.expenseId === id && p.month === month && p.paid);

  const togglePaid = (id: string) =>
    setPayments((prev) => {
      const ex = prev.find((p) => p.expenseId === id && p.month === month);
      if (ex) {
        return prev.map((p) =>
          p.expenseId === id && p.month === month ? { ...p, paid: !p.paid } : p
        );
      }
      return [...prev, { expenseId: id, month, paid: true }];
    });

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setPayments((prev) => prev.filter((p) => p.expenseId !== id));
  };

  const totals = useMemo(() => {
    const t: Record<Category, { total: number; paid: number }> = {
      fixed: { total: 0, paid: 0 },
      variable: { total: 0, paid: 0 },
      leisure: { total: 0, paid: 0 },
    };
    visible.forEach(({ expense }) => {
      t[expense.category].total += expense.amount;
      if (isPaid(expense.id)) t[expense.category].paid += expense.amount;
    });
    return t;
  }, [visible, payments, month]);

  const grandTotal = CATS_ORDER.reduce((s, c) => s + totals[c].total, 0);
  const grandPaid = CATS_ORDER.reduce((s, c) => s + totals[c].paid, 0);

  const chartData = CATS_ORDER.map((cat) => ({
    name: CATS[cat].short,
    Meta: Math.round((income * CATS[cat].target) / 100),
    Gasto: totals[cat].total,
    fill: CATS[cat].color,
  }));

  const last6Months = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const m = shiftMonth(month, -(5 - i));
      const vis = getVisibleExpenses(expenses, m);
      const total = vis.reduce((s, { expense }) => s + expense.amount, 0);
      return { month: m, total };
    });
  }, [expenses, month]);

  return (
    <div
      className="flex min-h-screen bg-background text-foreground"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Sidebar */}
      <div className="hidden md:block sticky top-0 h-screen overflow-y-auto shrink-0">
        <Sidebar
          month={month}
          onMonthChange={setMonth}
          income={income}
          editingIncome={editingIncome}
          incomeInput={incomeInput}
          onEditIncome={() => {
            setEditingIncome(true);
            setIncomeInput(String(income));
          }}
          onIncomeChange={setIncomeInput}
          onIncomeSubmit={() => {
            setIncome(Number(incomeInput) || income);
            setEditingIncome(false);
          }}
          totals={totals}
          grandTotal={grandTotal}
        />
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 border-b border-border px-4 py-3 flex items-center justify-between" style={{ background: "var(--sidebar)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #5b7fff, #26de81)" }}>
            <DollarSign size={13} className="text-white" />
          </div>
          <span className="font-semibold text-sm">FinControl</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-medium min-w-[90px] text-center">{fmtMonthShort(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 pt-20 md:pt-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-6 hidden md:block">
            <h1 className="text-2xl font-semibold">{fmtMonthLong(month)}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {grandTotal === 0
                ? "Nenhuma despesa cadastrada ainda"
                : grandPaid === 0
                ? `${fmt(grandTotal)} a pagar este mês`
                : `${fmt(grandPaid)} pagos · ${fmt(grandTotal - grandPaid)} pendente`}
            </p>
          </div>

          {/* Mobile summary */}
          <div className="md:hidden mb-5">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xl font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>
                {fmt(grandTotal)}
              </span>
              <span className="text-xs text-muted-foreground">este mês</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {grandPaid > 0 ? `${fmt(grandPaid)} pagos` : "Nenhum pago ainda"}
            </p>
          </div>

          {/* Budget cards */}
          <BudgetCards income={income} totals={totals} />

          {/* Expense sections */}
          {CATS_ORDER.map((cat) => (
            <ExpenseSection
              key={cat}
              category={cat}
              items={visible.filter((v) => v.expense.category === cat)}
              isPaid={isPaid}
              onToggle={togglePaid}
              onDelete={deleteExpense}
              onAdd={() => {
                setModalCategory(cat);
                setShowModal(true);
              }}
              currentMonth={month}
            />
          ))}

          {/* Chart */}
          <SpendingChart chartData={chartData} last6Months={last6Months} />

          <div className="h-12" />
        </div>
      </main>

      {/* Add Modal */}
      {showModal && (
        <AddModal
          defaultCategory={modalCategory}
          currentMonth={month}
          onClose={() => setShowModal(false)}
          onAdd={(exp) => {
            setExpenses((prev) => [...prev, exp]);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
