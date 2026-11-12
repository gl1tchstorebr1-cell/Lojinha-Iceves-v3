import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { 
  DollarSign, 
  UserCheck, 
  BarChart3, 
  ShoppingCart, 
  TrendingUp, 
  Search, 
  Download, 
  CreditCard, 
  ArrowUpDown, 
  ChevronRight, 
  Package, 
  Utensils,
  BookOpen,
  Sparkles,
  Droplets,
  Filter,
  Receipt
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { 
  Sale, 
  Invoice, 
  Product, 
  ProductCategory,
  PixPayment, 
  Student, 
  SystemSettings 
} from '../../types';

const OFFICIAL_CATEGORIES: ProductCategory[] = [
  'Alimentícios',
  'Papelaria',
  'Produtos de Limpeza',
  'Cosméticos'
];

// ==========================================
// ANIMATED COUNTER COMPONENT
// ==========================================
const AnimatedCounter = ({ value, prefix = '', suffix = '', decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const start = 0;
    const end = value || 0;
    if (end === 0) {
      setDisplayValue(0);
      return;
    }
    const duration = 700;
    const startTime = performance.now();

    const updateCount = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - (1 - progress) * (1 - progress);
      const current = start + (end - start) * easeProgress;
      
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(updateCount);
      }
    };

    requestAnimationFrame(updateCount);
  }, [value]);

  const formatted = displayValue.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span>{prefix}{formatted}{suffix}</span>;
};

// ==========================================
// SPOTLIGHT CARD COMPONENT (Cursor Glow Effect)
// ==========================================
const SpotlightCard = ({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: -200, y: -200 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative overflow-hidden rounded-xl bg-[#111111] border border-white/[0.08] p-5 shadow-sm transition-colors hover:border-white/[0.18] ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.08), transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
};

interface DashboardProps {
  sales: Sale[];
  invoices: Invoice[];
  products: Product[];
  pixPayments: PixPayment[];
  students: Student[];
  settings: SystemSettings | null;
  onNavigate: (tab: string) => void;
}

export function Dashboard({ 
  sales, 
  invoices, 
  products, 
  pixPayments, 
  students, 
  onNavigate 
}: DashboardProps) {
  const { user, isStudent, isGuardian } = useAuth();

  const [timeRange, setTimeRange] = useState<'7 days' | '30 days' | '3 months'>('30 days');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string>('ALL');

  // Interactive chart visibility
  const [visibleSeries, setVisibleSeries] = useState({
    gastoTotal: true,
    pagamentosPix: true,
    categoriaSelecionada: true,
  });

  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortAsc, setSortAsc] = useState(true);

  // Map productId -> ProductCategory
  const productCategoryMap = useMemo(() => {
    const map = new Map<string, ProductCategory>();
    for (const p of products) {
      map.set(p.id, p.category);
    }
    return map;
  }, [products]);

  const resolveItemCategory = (productId: string, itemName: string): ProductCategory => {
    const fromMap = productCategoryMap.get(productId);
    if (fromMap) return fromMap;
    const lower = itemName.toLowerCase();
    if (lower.includes('caderno') || lower.includes('caneta') || lower.includes('marca-texto') || lower.includes('papel')) {
      return 'Papelaria';
    }
    if (lower.includes('detergente') || lower.includes('álcool') || lower.includes('alcool') || lower.includes('pano') || lower.includes('limpeza')) {
      return 'Produtos de Limpeza';
    }
    if (lower.includes('sabonete') || lower.includes('hidratante') || lower.includes('creme') || lower.includes('labial')) {
      return 'Cosméticos';
    }
    return 'Alimentícios';
  };

  // Determine if we are viewing a single student's dashboard:
  // - Always true when logged in as STUDENT
  // - True when Admin/Cashier/Guardian selects a specific student in the filter
  const loggedInStudent = useMemo(() => {
    if (!isStudent) return null;
    return (
      students.find(
        s =>
          s.id === user?.studentId ||
          s.email.toLowerCase() === (user?.email || '').toLowerCase() ||
          s.name.toLowerCase() === (user?.name || '').toLowerCase()
      ) || students[0] || null
    );
  }, [isStudent, students, user]);

  const activeTargetStudent = useMemo(() => {
    if (isStudent) return loggedInStudent;
    if (selectedStudentFilter !== 'ALL') {
      return students.find(s => s.id === selectedStudentFilter) || null;
    }
    return null;
  }, [isStudent, loggedInStudent, selectedStudentFilter, students]);

  // Filter sales, invoices, and pix payments strictly to the target student (if active)
  const scopedCompletedSales = useMemo(() => {
    return sales.filter(s => {
      if (s.status !== 'COMPLETED') return false;
      if (activeTargetStudent && s.studentId !== activeTargetStudent.id) return false;
      return true;
    });
  }, [sales, activeTargetStudent]);

  const scopedInvoices = useMemo(() => {
    return invoices.filter(i => {
      if (i.status === 'CANCELADA') return false;
      if (activeTargetStudent && i.studentId !== activeTargetStudent.id) return false;
      return true;
    });
  }, [invoices, activeTargetStudent]);

  const scopedConfirmedPix = useMemo(() => {
    return pixPayments.filter(p => {
      if (p.status !== 'CONFIRMADO') return false;
      if (activeTargetStudent && p.studentId !== activeTargetStudent.id) return false;
      return true;
    });
  }, [pixPayments, activeTargetStudent]);

  // Real Category Breakdown (100% calculated from actual items purchased)
  const categoryStats = useMemo(() => {
    const totals: Record<ProductCategory, { totalSpent: number; itemsCount: number; salesCount: number }> = {
      'Alimentícios': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Papelaria': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Produtos de Limpeza': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Cosméticos': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
    };

    for (const sale of scopedCompletedSales) {
      const seenCatsInSale = new Set<ProductCategory>();
      for (const item of sale.items) {
        const cat = resolveItemCategory(item.productId, item.name);
        totals[cat].totalSpent += item.subtotal;
        totals[cat].itemsCount += item.quantity;
        seenCatsInSale.add(cat);
      }
      seenCatsInSale.forEach(cat => {
        totals[cat].salesCount += 1;
      });
    }

    return totals;
  }, [scopedCompletedSales, productCategoryMap]);

  // Total spent across all categories (or filtered category)
  const totalSalesSpentAllCategories = useMemo(
    () => scopedCompletedSales.reduce((acc, s) => acc + s.total, 0),
    [scopedCompletedSales]
  );

  const selectedCategorySpent = useMemo(() => {
    if (selectedCategory === 'ALL') return totalSalesSpentAllCategories;
    return categoryStats[selectedCategory as ProductCategory]?.totalSpent || 0;
  }, [selectedCategory, totalSalesSpentAllCategories, categoryStats]);

  const totalPixPaid = useMemo(
    () => scopedConfirmedPix.reduce((acc, p) => acc + p.amount, 0),
    [scopedConfirmedPix]
  );

  const totalOpenConsumption = useMemo(() => {
    if (activeTargetStudent) {
      return activeTargetStudent.currentConsumptionBalance;
    }
    return students.reduce((acc, s) => acc + s.currentConsumptionBalance, 0);
  }, [activeTargetStudent, students]);

  const totalOpenDebt = useMemo(() => {
    if (activeTargetStudent) {
      return activeTargetStudent.totalOpenDebt;
    }
    return students.reduce((acc, s) => acc + s.totalOpenDebt, 0);
  }, [activeTargetStudent, students]);

  const totalInvoicesGross = useMemo(
    () => scopedInvoices.reduce((acc, i) => acc + i.grossTotal, 0),
    [scopedInvoices]
  );
  const totalInvoicesPaid = useMemo(
    () => scopedInvoices.reduce((acc, i) => acc + i.paidTotal, 0),
    [scopedInvoices]
  );

  // Real payment rate: if invoices exist, % of invoice gross paid; otherwise if no open debt, 100%, else 0%
  const paymentRate = useMemo(() => {
    if (totalInvoicesGross > 0) {
      return (totalInvoicesPaid / totalInvoicesGross) * 100;
    }
    if (totalOpenDebt === 0 && totalOpenConsumption === 0) {
      return 100;
    }
    const totalObligation = totalOpenDebt + totalOpenConsumption + totalPixPaid;
    if (totalObligation > 0) {
      return (totalPixPaid / totalObligation) * 100;
    }
    return 100;
  }, [totalInvoicesGross, totalInvoicesPaid, totalOpenDebt, totalOpenConsumption, totalPixPaid]);

  // Real Chart Data: NO fake baseline! Plots only real transactions by date.
  const chartData = useMemo(() => {
    const days = timeRange === '7 days' ? 7 : timeRange === '30 days' ? 30 : 90;
    const result = [];

    // Find latest transaction date or use current date
    let referenceDate = new Date();
    const allDates = [
      ...scopedCompletedSales.map(s => new Date(s.createdAt).getTime()),
      ...scopedConfirmedPix.map(p => new Date(p.registeredAt).getTime())
    ].filter(t => !Number.isNaN(t));

    if (allDates.length > 0) {
      const maxTxDate = new Date(Math.max(...allDates));
      if (maxTxDate > referenceDate) {
        referenceDate = maxTxDate;
      }
    }

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      const isoDate = d.toISOString().split('T')[0];

      const daySales = scopedCompletedSales.filter(s => s.createdAt.startsWith(isoDate));
      const dayTotalSpent = daySales.reduce((acc, s) => acc + s.total, 0);

      let dayCategorySpent = dayTotalSpent;
      if (selectedCategory !== 'ALL') {
        dayCategorySpent = daySales.reduce((acc, sale) => {
          const catSum = sale.items
            .filter(it => resolveItemCategory(it.productId, it.name) === selectedCategory)
            .reduce((sum, it) => sum + it.subtotal, 0);
          return acc + catSum;
        }, 0);
      }

      const dayPix = scopedConfirmedPix.filter(p => p.registeredAt.startsWith(isoDate));
      const pixTotal = dayPix.reduce((acc, p) => acc + p.amount, 0);

      result.push({
        date: dateStr,
        gastoTotal: Number(dayTotalSpent.toFixed(2)),
        categoriaSelecionada: Number(dayCategorySpent.toFixed(2)),
        pagamentosPix: Number(pixTotal.toFixed(2)),
      });
    }
    return result;
  }, [timeRange, scopedCompletedSales, scopedConfirmedPix, selectedCategory, productCategoryMap]);

  // Per-student spending in each category for the table
  const studentCategoryTotals = useMemo(() => {
    const map = new Map<string, { total: number; byCategory: Record<ProductCategory, number>; itemsCount: number }>();
    for (const st of students) {
      map.set(st.id, {
        total: 0,
        itemsCount: 0,
        byCategory: {
          'Alimentícios': 0,
          'Papelaria': 0,
          'Produtos de Limpeza': 0,
          'Cosméticos': 0
        }
      });
    }

    for (const sale of sales) {
      if (sale.status !== 'COMPLETED') continue;
      const entry = map.get(sale.studentId);
      if (!entry) continue;
      for (const item of sale.items) {
        const cat = resolveItemCategory(item.productId, item.name);
        entry.total += item.subtotal;
        entry.byCategory[cat] += item.subtotal;
        entry.itemsCount += item.quantity;
      }
    }
    return map;
  }, [students, sales, productCategoryMap]);

  // Filtered students list
  const filteredStudents = useMemo(() => {
    const baseList = activeTargetStudent ? [activeTargetStudent] : students;
    return baseList
      .filter((st) => {
        const matchesSearch =
          st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          st.registrationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          st.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus =
          statusFilter === 'All' ||
          (statusFilter === 'Active' && st.status === 'ACTIVE') ||
          (statusFilter === 'Pending' && (st.totalOpenDebt > 0 || st.currentConsumptionBalance > 0)) ||
          (statusFilter === 'Inactive' && st.status === 'INACTIVE');
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortAsc) return a.name.localeCompare(b.name);
        return b.name.localeCompare(a.name);
      });
  }, [students, activeTargetStudent, searchQuery, statusFilter, sortAsc]);

  // Filtered sales items when viewing a specific student
  const filteredStudentSales = useMemo(() => {
    if (!activeTargetStudent) return [];
    return scopedCompletedSales
      .map(sale => {
        const matchingItems =
          selectedCategory === 'ALL'
            ? sale.items
            : sale.items.filter(it => resolveItemCategory(it.productId, it.name) === selectedCategory);
        const filteredSubtotal = matchingItems.reduce((acc, it) => acc + it.subtotal, 0);
        return {
          ...sale,
          matchingItems,
          filteredSubtotal
        };
      })
      .filter(s => s.matchingItems.length > 0);
  }, [activeTargetStudent, scopedCompletedSales, selectedCategory, productCategoryMap]);

  const getCategoryMeta = (cat: ProductCategory) => {
    switch (cat) {
      case 'Alimentícios':
        return {
          icon: Utensils,
          badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          bar: 'bg-gradient-to-r from-emerald-500 to-teal-500'
        };
      case 'Papelaria':
        return {
          icon: BookOpen,
          badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
          bar: 'bg-gradient-to-r from-teal-500 to-cyan-500'
        };
      case 'Produtos de Limpeza':
        return {
          icon: Droplets,
          badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
          bar: 'bg-gradient-to-r from-cyan-500 to-emerald-500'
        };
      case 'Cosméticos':
        return {
          icon: Sparkles,
          badge: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
          bar: 'bg-gradient-to-r from-lime-500 to-emerald-500'
        };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Banner Institucional / Contexto do Aluno ou Geral */}
      <div className="rounded-xl bg-gradient-to-r from-[#0d1f18] via-[#111815] to-[#111111] border border-emerald-500/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/40 shadow-md shadow-emerald-950/60 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={activeTargetStudent?.avatar || '/assets/aistudio/image_e4461e45.png'}
              alt="Logo ICEVES"
              className="w-full h-full rounded-full object-cover"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                {activeTargetStudent
                  ? `Dashboard Individual — ${activeTargetStudent.name}`
                  : 'Escola de Cristo no ICEVES — 10ª Turma'}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                {activeTargetStudent
                  ? `Matrícula: ${activeTargetStudent.registrationNumber}`
                  : 'Formatura: Dia 27 ao Dia 30'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {activeTargetStudent
                ? 'Todos os indicadores e gráficos abaixo refletem exclusivamente os seus gastos reais por categoria na Lojinha Iceves.'
                : `Dados 100% reais calculados do consumo de cada aluno e categoria • ${students.length} alunos na 10ª Turma`}
            </p>
          </div>
        </div>

        {/* Se não for aluno logado, permite filtrar o dashboard por qualquer aluno específico */}
        {!isStudent && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <select
              value={selectedStudentFilter}
              onChange={(e) => setSelectedStudentFilter(e.target.value)}
              className="bg-[#18181b] border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="ALL">Visão Consolidada (Todos os Alunos)</option>
              {students.map(st => (
                <option key={st.id} value={st.id}>
                  Aluno: {st.name} ({st.registrationNumber})
                </option>
              ))}
            </select>
          </div>
        )}

        {isStudent && (
          <button
            onClick={() => onNavigate('student_portal')}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-xs text-white font-semibold transition cursor-pointer self-start sm:self-auto shadow-sm"
          >
            Ver Meu Extrato & Passeios &gt;
          </button>
        )}
      </div>

      {/* ========================================== */}
      {/* 1. REAL METRICS CARDS GRID                 */}
      {/* ========================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Gasto / Consumo Real */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-2">
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Meu Gasto Total (Lojinha)' : 'Consumo Total Registrado'}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-3">
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              <AnimatedCounter value={selectedCategorySpent} prefix="R$ " decimals={2} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {scopedCompletedSales.length} compra(s)
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            {selectedCategory === 'ALL'
              ? activeTargetStudent
                ? 'Soma real de todas as suas compras no balcão'
                : 'Soma real das compras de todos os alunos'
              : `Gasto real apenas na categoria ${selectedCategory}`}
          </p>
        </SpotlightCard>

        {/* Card 2: Consumo em Aberto */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Meu Consumo em Aberto' : 'Consumo Aberto (Mês)'}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-3">
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              <AnimatedCounter value={totalOpenConsumption} prefix="R$ " decimals={2} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
              Mês vigente
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            {activeTargetStudent
              ? 'Saldo atual na sua conta da lojinha'
              : 'Saldo em aberto nas contas dos alunos'}
          </p>
        </SpotlightCard>

        {/* Card 3: Pagamentos Confirmados / Saldo Devedor */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Meus Pagamentos (Pix)' : 'Pagamentos Confirmados'}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-3">
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              <AnimatedCounter value={totalPixPaid} prefix="R$ " decimals={2} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {scopedConfirmedPix.length} pago(s)
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            {activeTargetStudent
              ? `Saldo devedor em faturas: ${formatCurrency(totalOpenDebt)}`
              : `Faturas em aberto: ${formatCurrency(totalOpenDebt)}`}
          </p>
        </SpotlightCard>

        {/* Card 4: Situação / Adimplência Real */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Situação Financeira' : 'Índice de Quitação Real'}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-3">
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              <AnimatedCounter value={paymentRate} suffix="%" decimals={1} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <TrendingUp className="w-3 h-3" /> {totalOpenDebt === 0 ? 'Em dia' : 'Pendente'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            {activeTargetStudent
              ? totalOpenDebt === 0 && totalOpenConsumption === 0
                ? 'Você não possui pendências financeiras'
                : `Total pendente: ${formatCurrency(totalOpenDebt + totalOpenConsumption)}`
              : `${students.filter(s => s.totalOpenDebt === 0).length} de ${students.length} alunos sem faturas vencidas`}
          </p>
        </SpotlightCard>

      </div>

      {/* ================================================================= */}
      {/* 2. DASHBOARD POR CATEGORIA (Gasto Real em cada uma das 4 categorias) */}
      {/* ================================================================= */}
      <div className="rounded-xl bg-[#111111] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-semibold tracking-tight text-white">
                {activeTargetStudent
                  ? `Gastos por Categoria — ${activeTargetStudent.name}`
                  : 'Dashboard de Consumo Real por Categoria'}
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Clique em uma categoria para filtrar os indicadores, o gráfico e o extrato detalhado abaixo.
            </p>
          </div>

          {selectedCategory !== 'ALL' && (
            <button
              onClick={() => setSelectedCategory('ALL')}
              className="self-start sm:self-auto text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Mostrar Todas as Categorias</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {OFFICIAL_CATEGORIES.map((cat) => {
            const stat = categoryStats[cat];
            const pct =
              totalSalesSpentAllCategories > 0
                ? (stat.totalSpent / totalSalesSpentAllCategories) * 100
                : 0;
            const meta = getCategoryMeta(cat);
            const Icon = meta.icon;
            const isSelected = selectedCategory === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat)}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-500/40 shadow-lg'
                    : 'bg-[#161618] border-white/[0.07] hover:border-emerald-500/30 hover:bg-white/[0.03]'
                }`}
              >
                <div className="space-y-2 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${meta.badge}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {cat}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {pct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="pt-1">
                    <div className="text-xl font-bold text-white font-mono">
                      {formatCurrency(stat.totalSpent)}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {stat.itemsCount} item(ns) • {stat.salesCount} compra(s)
                    </div>
                  </div>
                </div>

                <div className="w-full space-y-1">
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${meta.bar}`}
                      style={{ width: `${Math.min(100, Math.max(pct, stat.totalSpent > 0 ? 6 : 0))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span>{stat.totalSpent === 0 ? 'Sem gastos registrados' : 'Consumo confirmado'}</span>
                    {isSelected && <span className="text-emerald-400 font-semibold">Filtro ativo</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================== */}
      {/* 3. REAL ACTIVITY CHART                     */}
      {/* ========================================== */}
      <div className="rounded-xl bg-[#111111] border border-white/[0.08] p-5">
        
        {/* Header controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              {activeTargetStudent
                ? `Evolução Real de Gastos — ${activeTargetStudent.name}`
                : 'Movimentação Real da Lojinha & Pagamentos'}
            </h2>
            <p className="text-xs text-zinc-400">
              {selectedCategory === 'ALL'
                ? 'Histórico diário fiel às compras e pagamentos reais registrados (sem valores simulados)'
                : `Exibindo evolução real para a categoria: ${selectedCategory}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Time range selector */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="bg-[#18181b] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="7 days">Últimos 7 dias</option>
              <option value="30 days">Últimos 30 dias</option>
              <option value="3 months">Últimos 3 meses</option>
            </select>

            {/* Category Selector */}
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#18181b] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="ALL">Todas as Categorias (4)</option>
              {OFFICIAL_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <button 
              onClick={() => onNavigate(isStudent ? 'student_portal' : isGuardian ? 'guardian_portal' : 'closing')}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition-all shadow-sm cursor-pointer"
            >
              {isStudent ? 'Minhas Faturas' : 'Ver Faturas'}
            </button>
          </div>
        </div>

        {/* Interactive Legend Items */}
        <div className="flex flex-wrap items-center justify-end gap-6 mb-4 text-xs">
          <button
            onClick={() => setVisibleSeries(prev => ({ ...prev, categoriaSelecionada: !prev.categoriaSelecionada }))}
            className={`flex items-center gap-2 transition-opacity cursor-pointer ${visibleSeries.categoriaSelecionada ? 'opacity-100' : 'opacity-40'}`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
            <span className="text-zinc-300">
              {selectedCategory === 'ALL' ? 'Gasto no Balcão (R$)' : `Gasto em ${selectedCategory} (R$)`}
            </span>
          </button>
          <button
            onClick={() => setVisibleSeries(prev => ({ ...prev, pagamentosPix: !prev.pagamentosPix }))}
            className={`flex items-center gap-2 transition-opacity cursor-pointer ${visibleSeries.pagamentosPix ? 'opacity-100' : 'opacity-40'}`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-500" />
            <span className="text-zinc-300">Pagamentos Pix (R$)</span>
          </button>
        </div>

        {/* Area Chart with Real Data */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradEmerald" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gradTeal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg bg-[#18181b] border border-emerald-500/25 p-3 shadow-xl text-xs space-y-1">
                        <div className="text-zinc-400 font-medium mb-1">{label}</div>
                        {payload.map((entry, index) => (
                          <div key={index} className="flex items-center justify-between gap-4">
                            <span style={{ color: entry.color }}>{entry.name}:</span>
                            <span className="font-semibold text-white">R$ {Number(entry.value).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {visibleSeries.pagamentosPix && (
                <Area
                  type="monotone"
                  dataKey="pagamentosPix"
                  name="Pagamentos Pix"
                  stroke="#14B8A6"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#gradTeal)"
                />
              )}
              {visibleSeries.categoriaSelecionada && (
                <Area
                  type="monotone"
                  dataKey="categoriaSelecionada"
                  name={selectedCategory === 'ALL' ? 'Gasto no Balcão' : `Gasto (${selectedCategory})`}
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gradEmerald)"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* =============================================================== */}
      {/* 4. INDIVIDUAL STUDENT PURCHASES OR ALL STUDENTS SPENDING TABLE  */}
      {/* =============================================================== */}
      {activeTargetStudent ? (
        <div className="rounded-xl bg-[#111111] border border-white/[0.08] overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08]">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">
                Histórico de Compras de {activeTargetStudent.name}
                {selectedCategory !== 'ALL' ? ` — ${selectedCategory}` : ''}
              </h2>
              <p className="text-xs text-zinc-400">
                Extrato real itemizado de acordo com o consumo próprio do aluno na Lojinha Iceves.
              </p>
            </div>
            <button
              onClick={() => onNavigate('student_portal')}
              className="self-start sm:self-auto flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <span>Abrir Portal do Aluno Completo</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredStudentSales.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-zinc-300">
                {selectedCategory === 'ALL'
                  ? 'Nenhuma compra registrada para este aluno até o momento (R$ 0,00).'
                  : `Nenhum gasto registrado na categoria "${selectedCategory}" para este aluno (R$ 0,00).`}
              </p>
              <p className="text-xs text-zinc-500">
                Assim que uma compra for lançada no PDV da Lojinha Iceves, os valores reais aparecerão automaticamente aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filteredStudentSales.map(sale => (
                <div key={sale.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-emerald-400">{sale.id}</span>
                      <span className="text-[11px] text-zinc-400">• {formatDateTime(sale.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {sale.matchingItems.map((it, idx) => {
                        const cat = resolveItemCategory(it.productId, it.name);
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#18181b] border border-white/[0.08] text-xs text-zinc-200"
                          >
                            <strong className="text-emerald-400">{it.quantity}x</strong> {it.name}
                            <span className="text-[10px] text-zinc-400 font-mono">({formatCurrency(it.subtotal)})</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {cat}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white font-mono">
                      {formatCurrency(sale.filteredSubtotal)}
                    </div>
                    <div className="text-[10px] text-zinc-500">Atendido por {sale.operatorUserName}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-[#111111] border border-white/[0.08] overflow-hidden">
          
          {/* Table Header */}
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08]">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">
                Gasto Real por Aluno {selectedCategory !== 'ALL' ? `(${selectedCategory})` : '(Todas as Categorias)'}
              </h2>
              <p className="text-xs text-zinc-400">
                Clique em qualquer aluno para inspecionar o dashboard individual com os gastos reais dele próprio.
              </p>
            </div>
            <button 
              onClick={() => onNavigate('students')}
              className="self-start sm:self-auto flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Gerenciar Alunos</span>
            </button>
          </div>

          {/* Filters Toolbar */}
          <div className="p-3 bg-white/[0.01] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar aluno ou matrícula..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 w-48 sm:w-64"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#18181b] border border-white/[0.1] rounded-lg px-3 py-1.5 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
              >
                <option value="All">Status: Todos</option>
                <option value="Active">Ativos</option>
                <option value="Pending">Com Consumo / Saldo Devedor</option>
                <option value="Inactive">Inativos</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="flex items-center gap-1.5 bg-[#18181b] border border-white/[0.1] px-3 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.04] cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar {sortAsc ? 'A-Z' : 'Z-A'}
              </button>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] border-b border-white/[0.08] text-zinc-400 font-medium">
                <tr>
                  <th className="p-3.5">Aluno (10ª Turma)</th>
                  <th className="p-3.5">Matrícula</th>
                  <th className="p-3.5">Alimentícios</th>
                  <th className="p-3.5">Papelaria</th>
                  <th className="p-3.5">Limpeza</th>
                  <th className="p-3.5">Cosméticos</th>
                  <th className="p-3.5">Consumo Aberto</th>
                  <th className="p-3.5">Saldo Devedor</th>
                  <th className="p-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredStudents.map((st) => {
                  const stCat = studentCategoryTotals.get(st.id);
                  return (
                    <tr
                      key={st.id}
                      onClick={() => setSelectedStudentFilter(st.id)}
                      className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                      title="Clique para filtrar o dashboard pelos gastos deste aluno"
                    >
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={st.avatar}
                            alt={st.name}
                            className="w-8 h-8 rounded-full object-cover border border-white/10"
                          />
                          <div>
                            <div className="font-semibold text-white group-hover:text-emerald-300 transition-colors">{st.name}</div>
                            <div className="text-[11px] text-zinc-500">{st.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-md border border-white/[0.1] bg-white/[0.04] text-zinc-300 font-mono text-[11px]">
                          {st.registrationNumber}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Alimentícios'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Papelaria'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Produtos de Limpeza'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Cosméticos'] || 0)}
                      </td>
                      <td className="p-3.5 text-emerald-400 font-semibold font-mono">
                        {formatCurrency(st.currentConsumptionBalance)}
                      </td>
                      <td className="p-3.5 text-zinc-300 font-medium font-mono">
                        {formatCurrency(st.totalOpenDebt)}
                      </td>
                      <td className="p-3.5 text-right">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStudentFilter(st.id);
                          }}
                          className="text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium cursor-pointer"
                        >
                          Ver Gasto
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-zinc-400">
            <div>Exibindo {filteredStudents.length} de {students.length} alunos cadastrados</div>
          </div>

        </div>
      )}

    </div>
  );
}
