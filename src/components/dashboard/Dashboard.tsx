import React, { useState, useMemo, useRef, useEffect, useCallback, useDeferredValue } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { attachTilt3D } from '../../utils/tilt3d';
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
  Receipt,
  HeartPulse,
  PenTool
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { OFFICIAL_PRODUCT_CATEGORIES, normalizeProductCategory } from '../../utils/productImages';
import { useAuth } from '../../context/AuthContext';
import { 
  Sale, 
  SalesReceipt,
  Invoice, 
  Product, 
  ProductCategory,
  PixPayment, 
  Student, 
  SystemSettings 
} from '../../types';
import { getValidCompletedSales } from '../../utils/dataIntegrity';

const OFFICIAL_CATEGORIES: ProductCategory[] = OFFICIAL_PRODUCT_CATEGORIES;

// ==========================================
// ANIMATED COUNTER COMPONENT
// ==========================================
const AnimatedCounter = React.memo(({ value, prefix = '', suffix = '', decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const currentValRef = useRef(0);

  useEffect(() => {
    const end = value || 0;
    const start = currentValRef.current;

    if (
      Math.abs(end - start) < 0.0001 ||
      (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      currentValRef.current = end;
      setDisplayValue(end);
      return;
    }

    const duration = start === 0 ? 580 : 360;
    const startTime = performance.now();
    let rafId = 0;

    const updateCount = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * easeProgress;

      currentValRef.current = current;
      setDisplayValue(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(updateCount);
      } else {
        currentValRef.current = end;
      }
    };

    rafId = requestAnimationFrame(updateCount);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  const formatted = displayValue.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span>{prefix}{formatted}{suffix}</span>;
});

// ==========================================
// SPOTLIGHT CARD COMPONENT (3D Tilt + Background Fade Glow on Hover)
// ==========================================
const SpotlightCard = React.memo(({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const detach = attachTilt3D(cardRef.current, 6);
    return () => {
      detach();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || !glowRef.current) return;
    if (!rectRef.current) {
      rectRef.current = card.getBoundingClientRect();
    }
    pointerPosRef.current.x = e.clientX - rectRef.current.left;
    pointerPosRef.current.y = e.clientY - rectRef.current.top;

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!glowRef.current) return;
        const { x, y } = pointerPosRef.current;
        glowRef.current.style.background = `radial-gradient(520px circle at ${x}px ${y}px, rgba(16, 185, 129, 0.12), rgba(20, 184, 166, 0.04) 40%, transparent 70%)`;
      });
    }
  }, []);

  const handlePointerEnter = useCallback(() => {
    if (cardRef.current) {
      rectRef.current = cardRef.current.getBoundingClientRect();
    }
    if (glowRef.current) glowRef.current.style.opacity = '1';
  }, []);

  const handlePointerLeave = useCallback(() => {
    rectRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (glowRef.current) glowRef.current.style.opacity = '0';
  }, []);

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={onClick}
      className={`card-borda-conica shadow-[0_14px_34px_-18px_rgba(0,0,0,0.8)] will-change-transform ${className}`}
    >
      <div className="conteudo relative overflow-hidden border border-white/[0.06] p-5 transition-colors duration-200 hover:border-white/[0.14]">
        <div
          ref={glowRef}
          className="pointer-events-none absolute -inset-px transition-opacity duration-300 ease-out"
          style={{ opacity: 0 }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
});

interface DashboardProps {
  sales: Sale[];
  receipts?: SalesReceipt[];
  invoices: Invoice[];
  products: Product[];
  pixPayments: PixPayment[];
  students: Student[];
  settings: SystemSettings | null;
  onNavigate: (tab: string) => void;
}

export function Dashboard({ 
  sales, 
  receipts,
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
  const deferredSearchQuery = useDeferredValue(searchQuery);
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

  const resolveItemCategory = useCallback((productId: string, itemName: string): ProductCategory => {
    const fromMap = productCategoryMap.get(productId);
    if (fromMap) return normalizeProductCategory(fromMap);
    const lower = (itemName || '').toLowerCase();
    if (lower.includes('livro') || lower.includes('bíblia') || lower.includes('biblia') || lower.includes('crist') || lower.includes('sair') || lower.includes('espírito')) {
      return 'Livros e Literatura Cristã';
    }
    if (lower.includes('própolis') || lower.includes('propolis') || lower.includes('levedura') || lower.includes('carvão') || lower.includes('chlorella') || lower.includes('argila')) {
      return 'Produtos Naturais e Saúde';
    }
    if (lower.includes('caderno') || lower.includes('caneta') || lower.includes('marca-texto') || lower.includes('papel') || lower.includes('post-it')) {
      return 'Papelaria';
    }
    if (lower.includes('detergente') || lower.includes('álcool') || lower.includes('alcool') || lower.includes('pano') || lower.includes('limpeza') || lower.includes('desinfet')) {
      return 'Limpeza';
    }
    if (lower.includes('sabonete') || lower.includes('hidratante') || lower.includes('creme') || lower.includes('labial') || lower.includes('shampoo') || lower.includes('desodorante') || lower.includes('absorvente')) {
      return 'Higiene e Cuidados Pessoais';
    }
    return 'Alimentos e Snacks';
  }, [productCategoryMap]);

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

  // Filter sales, invoices, and pix payments strictly to valid completed sales (with consistent active receipt)
  const scopedCompletedSales = useMemo(() => {
    const validSales = Array.isArray(receipts)
      ? getValidCompletedSales(sales, receipts)
      : sales.filter(s => s.status === 'COMPLETED');
    return validSales.filter(s => {
      if (activeTargetStudent && s.studentId !== activeTargetStudent.id) return false;
      return true;
    });
  }, [sales, receipts, activeTargetStudent]);

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
      'Livros e Literatura Cristã': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Alimentos e Snacks': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Produtos Naturais e Saúde': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Papelaria': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Higiene e Cuidados Pessoais': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
      'Limpeza': { totalSpent: 0, itemsCount: 0, salesCount: 0 },
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

  // Last 7 days daily sales BarChart dataset (always reflects the trailing 7 days of real completed sales)
  const { last7DaysSalesData, last7DaysSummary } = useMemo(() => {
    const toLocalYmd = (dateObj: Date) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    let referenceDate = new Date();
    const saleTimestamps = scopedCompletedSales
      .map(s => new Date(s.createdAt).getTime())
      .filter(t => !Number.isNaN(t));

    if (saleTimestamps.length > 0) {
      const maxTxDate = new Date(Math.max(...saleTimestamps));
      if (maxTxDate > referenceDate) {
        referenceDate = maxTxDate;
      }
    }

    const daysList: Array<{
      date: string;
      fullDate: string;
      weekday: string;
      isoDate: string;
      totalVendas: number;
      quantidadeVendas: number;
      itensVendidos: number;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() - i);
      const ymd = toLocalYmd(d);
      const shortDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const fullDate = d.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit'
      });

      const daySales = scopedCompletedSales.filter(s => {
        const parsed = new Date(s.createdAt);
        if (Number.isNaN(parsed.getTime())) return false;
        return toLocalYmd(parsed) === ymd || s.createdAt.startsWith(ymd);
      });

      let dayTotal = 0;
      let dayItems = 0;

      for (const sale of daySales) {
        if (selectedCategory === 'ALL') {
          dayTotal += Number(sale.total) || 0;
          dayItems += (sale.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
        } else {
          const matching = (sale.items || []).filter(
            it => resolveItemCategory(it.productId, it.name) === selectedCategory
          );
          dayTotal += matching.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
          dayItems += matching.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
        }
      }

      daysList.push({
        date: shortDate,
        fullDate: fullDate.charAt(0).toUpperCase() + fullDate.slice(1),
        weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
        isoDate: ymd,
        totalVendas: Number(dayTotal.toFixed(2)),
        quantidadeVendas: daySales.length,
        itensVendidos: dayItems
      });
    }

    const total7Days = daysList.reduce((acc, d) => acc + d.totalVendas, 0);
    const totalOrders7Days = daysList.reduce((acc, d) => acc + d.quantidadeVendas, 0);
    const maxDayValue = Math.max(...daysList.map(d => d.totalVendas), 0);
    const peakDay = maxDayValue > 0 ? daysList.find(d => d.totalVendas === maxDayValue) || null : null;

    return {
      last7DaysSalesData: daysList,
      last7DaysSummary: {
        total: total7Days,
        dailyAverage: total7Days / 7,
        ordersCount: totalOrders7Days,
        maxDayValue,
        peakDay
      }
    };
  }, [scopedCompletedSales, selectedCategory, resolveItemCategory]);

  // Operational & Profit KPIs (Today, Month, Avg Ticket, Estimated Profit, Inventory status)
  const operationalMetrics = useMemo(() => {
    const now = new Date();
    const todayPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthPrefix = todayPrefix.slice(0, 7);

    const productCostMap = new Map<string, number>();
    for (const p of products) {
      if (typeof p.costPrice === 'number' && p.costPrice > 0) {
        productCostMap.set(p.id, p.costPrice);
      }
    }

    let todayRevenue = 0;
    let monthRevenue = 0;
    let estimatedProfit = 0;
    const methodTotals: Record<string, number> = {};
    const productRanking = new Map<string, { name: string; qty: number; revenue: number }>();

    for (const s of scopedCompletedSales) {
      const total = Number(s.total) || 0;
      if (s.createdAt.startsWith(todayPrefix)) todayRevenue += total;
      if (s.createdAt.startsWith(monthPrefix)) monthRevenue += total;

      const pm = s.paymentMethod || 'CONTA_ALUNO';
      methodTotals[pm] = (methodTotals[pm] || 0) + total;

      for (const it of s.items || []) {
        const unitCost = productCostMap.get(it.productId);
        const itemProfit = typeof unitCost === 'number'
          ? Math.max(0, (Number(it.unitPrice) - unitCost) * it.quantity)
          : (Number(it.subtotal) || 0) * 0.25;
        estimatedProfit += itemProfit;

        const prev = productRanking.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
        prev.qty += Number(it.quantity) || 0;
        prev.revenue += Number(it.subtotal) || 0;
        productRanking.set(it.name, prev);
      }
    }

    const activeCatalog = products.filter(p => p.status === 'ACTIVE' && !p.archived);
    const lowStock = activeCatalog.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock).length;
    const outOfStock = activeCatalog.filter(p => p.currentStock === 0).length;
    const avgTicket = scopedCompletedSales.length > 0 ? totalSalesSpentAllCategories / scopedCompletedSales.length : 0;

    const pmLabels: Record<string, string> = {
      CONTA_ALUNO: 'Conta do Aluno',
      DINHEIRO: 'Dinheiro',
      PIX: 'PIX',
      CARTAO_CREDITO: 'Cartão Crédito',
      CARTAO_DEBITO: 'Cartão Débito',
      MERCADO_PAGO: 'Mercado Pago',
    };

    const paymentDistribution = Object.entries(methodTotals).map(([key, value]) => ({
      key,
      name: pmLabels[key] || key,
      value: Number(value.toFixed(2)),
    }));

    const topProducts = Array.from(productRanking.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map(p => ({
        ...p,
        shortName: p.name.length > 18 ? `${p.name.slice(0, 18)}…` : p.name,
        revenue: Number(p.revenue.toFixed(2)),
      }));

    return {
      todayRevenue,
      monthRevenue,
      avgTicket,
      estimatedProfit,
      activeProductsCount: activeCatalog.length,
      lowStock,
      outOfStock,
      paymentDistribution,
      topProducts,
    };
  }, [scopedCompletedSales, products, totalSalesSpentAllCategories]);

  // Per-student spending in each category for the table
  const studentCategoryTotals = useMemo(() => {
    const map = new Map<string, { total: number; byCategory: Record<ProductCategory, number>; itemsCount: number }>();
    for (const st of students) {
      map.set(st.id, {
        total: 0,
        itemsCount: 0,
        byCategory: {
          'Livros e Literatura Cristã': 0,
          'Alimentos e Snacks': 0,
          'Produtos Naturais e Saúde': 0,
          'Papelaria': 0,
          'Higiene e Cuidados Pessoais': 0,
          'Limpeza': 0
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
    const q = deferredSearchQuery.trim().toLowerCase();
    return baseList
      .filter((st) => {
        const matchesSearch =
          !q ||
          st.name.toLowerCase().includes(q) ||
          st.registrationNumber.toLowerCase().includes(q) ||
          st.email.toLowerCase().includes(q);
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
  }, [students, activeTargetStudent, deferredSearchQuery, statusFilter, sortAsc]);

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

  const getCategoryMeta = useCallback((cat: ProductCategory) => {
    switch (cat) {
      case 'Livros e Literatura Cristã':
        return {
          icon: BookOpen,
          badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
          bar: 'bg-gradient-to-r from-indigo-500 to-teal-500'
        };
      case 'Alimentos e Snacks':
        return {
          icon: Utensils,
          badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          bar: 'bg-gradient-to-r from-emerald-500 to-teal-500'
        };
      case 'Produtos Naturais e Saúde':
        return {
          icon: HeartPulse,
          badge: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
          bar: 'bg-gradient-to-r from-lime-500 to-emerald-500'
        };
      case 'Papelaria':
        return {
          icon: PenTool,
          badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
          bar: 'bg-gradient-to-r from-teal-500 to-cyan-500'
        };
      case 'Higiene e Cuidados Pessoais':
        return {
          icon: Sparkles,
          badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          bar: 'bg-gradient-to-r from-amber-500 to-emerald-500'
        };
      case 'Limpeza':
      default:
        return {
          icon: Droplets,
          badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
          bar: 'bg-gradient-to-r from-cyan-500 to-emerald-500'
        };
    }
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Banner Institucional / Contexto do Aluno ou Geral */}
      <div className="executive-surface rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -left-12 w-64 h-40 rounded-full bg-emerald-500/[0.08] blur-3xl"
        />
        <div className="flex items-center gap-3.5 relative z-10 min-w-0">
          <div className="w-12 h-12 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/35 shadow-lg shadow-emerald-950/60 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={activeTargetStudent?.avatar || '/assets/aistudio/image_e4461e45.png'}
              alt="Logo ICEVES"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full rounded-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <h2 className="text-base font-bold text-white tracking-tight truncate">
                {activeTargetStudent
                  ? `Dashboard Individual — ${activeTargetStudent.name}`
                  : 'Escola de Cristo no ICEVES — 10ª Turma'}
              </h2>
              <span className="text-zinc-600 hidden sm:inline" aria-hidden="true">·</span>
              <span className="text-xs font-medium text-emerald-400 font-mono tabular-nums">
                {activeTargetStudent
                  ? `Matrícula ${activeTargetStudent.registrationNumber}`
                  : 'Formatura 27 a 30'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {activeTargetStudent
                ? 'Indicadores e gráficos refletindo exclusivamente o consumo real por categoria na Lojinha Iceves.'
                : `Dados reais consolidados de consumo e recebimentos · ${students.length} alunos cadastrados`}
            </p>
          </div>
        </div>

        {/* Se não for aluno logado, permite filtrar o dashboard por qualquer aluno específico */}
        {!isStudent && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto relative z-10">
            <select
              value={selectedStudentFilter}
              onChange={(e) => setSelectedStudentFilter(e.target.value)}
              className="bg-[#141419] border border-white/[0.1] hover:border-emerald-500/35 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer"
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
            type="button"
            onClick={() => onNavigate('student_portal')}
            className="relative z-10 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-xs text-white font-semibold transition-all cursor-pointer self-start sm:self-auto shadow-md shadow-emerald-950/50 whitespace-nowrap shrink-0"
          >
            Ver Meu Extrato & Passeios
          </button>
        )}
      </div>

      {/* ========================================== */}
      {/* 1. REAL METRICS CARDS GRID                 */}
      {/* ========================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Gasto / Consumo Real */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Meu Gasto Total' : 'Consumo Total Registrado'}
            </span>
            <ShoppingCart className="w-4 h-4 text-emerald-400/90" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[26px] font-bold tracking-tight text-white tabular-nums">
              <AnimatedCounter value={selectedCategorySpent} prefix="R$ " decimals={2} />
            </div>
            <span className="text-[11px] font-medium text-emerald-400 tabular-nums shrink-0">
              {scopedCompletedSales.length} venda(s)
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2.5 leading-relaxed">
            {selectedCategory === 'ALL'
              ? activeTargetStudent
                ? 'Soma real de todas as suas compras no balcão'
                : 'Soma real das compras de todos os alunos'
              : `Gasto real na categoria ${selectedCategory}`}
          </p>
        </SpotlightCard>

        {/* Card 2: Consumo em Aberto */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Consumo em Aberto' : 'Consumo Aberto (Mês)'}
            </span>
            <Receipt className="w-4 h-4 text-emerald-400/90" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[26px] font-bold tracking-tight text-white tabular-nums">
              <AnimatedCounter value={totalOpenConsumption} prefix="R$ " decimals={2} />
            </div>
            <span className="text-[11px] font-medium text-teal-300 shrink-0">
              Mês vigente
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2.5 leading-relaxed">
            {activeTargetStudent
              ? 'Saldo atual na sua conta da lojinha'
              : 'Saldo em aberto nas contas dos alunos'}
          </p>
        </SpotlightCard>

        {/* Card 3: Pagamentos Confirmados / Saldo Devedor */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Pagamentos (Pix)' : 'Pagamentos Confirmados'}
            </span>
            <DollarSign className="w-4 h-4 text-emerald-400/90" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[26px] font-bold tracking-tight text-white tabular-nums">
              <AnimatedCounter value={totalPixPaid} prefix="R$ " decimals={2} />
            </div>
            <span className="text-[11px] font-medium text-emerald-400 tabular-nums shrink-0">
              {scopedConfirmedPix.length} pago(s)
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2.5 leading-relaxed tabular-nums">
            {activeTargetStudent
              ? `Saldo devedor em faturas: ${formatCurrency(totalOpenDebt)}`
              : `Faturas em aberto: ${formatCurrency(totalOpenDebt)}`}
          </p>
        </SpotlightCard>

        {/* Card 4: Situação / Adimplência Real */}
        <SpotlightCard>
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-xs font-medium">
              {activeTargetStudent ? 'Situação Financeira' : 'Índice de Quitação Real'}
            </span>
            <BarChart3 className="w-4 h-4 text-emerald-400/90" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl sm:text-[26px] font-bold tracking-tight text-white tabular-nums">
              <AnimatedCounter value={paymentRate} suffix="%" decimals={1} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 shrink-0">
              <TrendingUp className="w-3 h-3" /> {totalOpenDebt === 0 ? 'Em dia' : 'Pendente'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2.5 leading-relaxed tabular-nums">
            {activeTargetStudent
              ? totalOpenDebt === 0 && totalOpenConsumption === 0
                ? 'Sem pendências financeiras registradas'
                : `Total pendente: ${formatCurrency(totalOpenDebt + totalOpenConsumption)}`
              : `${students.filter(s => s.totalOpenDebt === 0).length} de ${students.length} alunos sem faturas vencidas`}
          </p>
        </SpotlightCard>

      </div>

      {/* Compact Real-Time Store & Margin KPI Strip */}
      {!isStudent && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="executive-surface rounded-xl px-4 py-3">
            <span className="text-[11px] text-zinc-400 font-medium block">Faturamento hoje</span>
            <span className="text-base font-bold text-white font-mono tabular-nums mt-0.5 block">{formatCurrency(operationalMetrics.todayRevenue)}</span>
          </div>
          <div className="executive-surface rounded-xl px-4 py-3">
            <span className="text-[11px] text-zinc-400 font-medium block">Faturamento do mês</span>
            <span className="text-base font-bold text-emerald-400 font-mono tabular-nums mt-0.5 block">{formatCurrency(operationalMetrics.monthRevenue)}</span>
          </div>
          <div className="executive-surface rounded-xl px-4 py-3">
            <span className="text-[11px] text-zinc-400 font-medium block">Ticket médio</span>
            <span className="text-base font-bold text-white font-mono tabular-nums mt-0.5 block">{formatCurrency(operationalMetrics.avgTicket)}</span>
          </div>
          <div className="executive-surface rounded-xl px-4 py-3">
            <span className="text-[11px] text-zinc-400 font-medium block">Lucro estimado</span>
            <span className="text-base font-bold text-teal-300 font-mono tabular-nums mt-0.5 block">{formatCurrency(operationalMetrics.estimatedProfit)}</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="executive-surface-interactive rounded-xl px-4 py-3 text-left cursor-pointer hover:border-amber-500/35"
          >
            <span className="text-[11px] text-amber-400/90 font-medium block">Estoque baixo</span>
            <span className="text-base font-bold text-amber-300 font-mono tabular-nums mt-0.5 block">
              {operationalMetrics.lowStock} / {operationalMetrics.activeProductsCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="executive-surface-interactive rounded-xl px-4 py-3 text-left cursor-pointer hover:border-rose-500/35"
          >
            <span className="text-[11px] text-rose-400/90 font-medium block">Sem estoque</span>
            <span className="text-base font-bold text-rose-300 font-mono tabular-nums mt-0.5 block">
              {operationalMetrics.outOfStock} itens
            </span>
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. DASHBOARD POR CATEGORIA (Gasto Real em cada uma das 4 categorias) */}
      {/* ================================================================= */}
      <div className="executive-surface rounded-2xl p-5 space-y-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
                className={`text-left rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500/40 shadow-lg'
                    : 'bg-[#161618] border-white/[0.07] hover:border-emerald-500/30 hover:bg-[#1a1a1f]'
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
      {/* 3. REAL ACTIVITY CHARTS                    */}
      {/* ========================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 executive-surface rounded-2xl p-5">
          
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
                <option value="ALL">Todas as Categorias ({OFFICIAL_CATEGORIES.length})</option>
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
                        <div className="rounded-xl bg-[#111116]/95 backdrop-blur-md border border-white/[0.12] p-3 shadow-2xl text-xs space-y-1.5">
                          <div className="text-zinc-400 font-medium mb-1">{label}</div>
                          {payload.map((entry, index) => (
                            <div key={index} className="flex items-center justify-between gap-5">
                              <span style={{ color: entry.color }}>{entry.name}:</span>
                              <span className="font-semibold text-white font-mono tabular-nums">R$ {Number(entry.value).toFixed(2)}</span>
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
                    strokeWidth={1.75}
                    fillOpacity={1}
                    fill="url(#gradTeal)"
                    animationDuration={420}
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
                    animationDuration={420}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 7-Day Daily Sales BarChart */}
        <div className="xl:col-span-5 executive-surface rounded-2xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-base font-semibold tracking-tight text-white">
                    Vendas Totais Diárias (7 Dias)
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {selectedCategory === 'ALL'
                    ? 'Desempenho diário de vendas concluídas na última semana'
                    : `Vendas diárias em: ${selectedCategory}`}
                </p>
              </div>
              <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Últimos 7 dias
              </span>
            </div>

            {/* 7-Day KPI Strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-[#161618] border border-white/[0.06] px-3 py-2">
                <span className="text-[10px] text-zinc-400 block">Total 7d</span>
                <span className="text-sm font-bold text-white font-mono">
                  {formatCurrency(last7DaysSummary.total)}
                </span>
              </div>
              <div className="rounded-lg bg-[#161618] border border-white/[0.06] px-3 py-2">
                <span className="text-[10px] text-zinc-400 block">Média/dia</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  {formatCurrency(last7DaysSummary.dailyAverage)}
                </span>
              </div>
              <div className="rounded-lg bg-[#161618] border border-white/[0.06] px-3 py-2">
                <span className="text-[10px] text-zinc-400 block">Dia Pico</span>
                <span className="text-xs font-bold text-teal-300 font-mono truncate block">
                  {last7DaysSummary.peakDay
                    ? `${last7DaysSummary.peakDay.date} (${formatCurrency(last7DaysSummary.peakDay.totalVendas)})`
                    : 'Sem vendas'}
                </span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7DaysSalesData} margin={{ top: 10, right: 6, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="barEmeraldPeak" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34D399" stopOpacity={1} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                  </linearGradient>
                  <linearGradient id="barEmeraldBase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#047857" stopOpacity={0.65} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(value) => `R$ ${Number(value).toFixed(0)}`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as (typeof last7DaysSalesData)[number];
                      return (
                        <div className="rounded-lg bg-[#18181b] border border-emerald-500/25 p-3 shadow-xl text-xs space-y-1.5">
                          <div className="text-zinc-300 font-semibold border-b border-white/[0.08] pb-1">
                            {item.fullDate}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-emerald-400">Vendas Totais:</span>
                            <span className="font-bold text-white font-mono">
                              {formatCurrency(item.totalVendas)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-[11px] text-zinc-400">
                            <span>Registros:</span>
                            <span className="text-zinc-200 font-medium">
                              {item.quantidadeVendas} venda(s) • {item.itensVendidos} item(ns)
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="totalVendas"
                  name="Vendas Totais"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={38}
                >
                  {last7DaysSalesData.map((entry, idx) => {
                    const isPeak = last7DaysSummary.maxDayValue > 0 && entry.totalVendas === last7DaysSummary.maxDayValue;
                    return (
                      <Cell
                        key={`cell-${entry.isoDate}-${idx}`}
                        fill={isPeak ? 'url(#barEmeraldPeak)' : 'url(#barEmeraldBase)'}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ======================================================= */}
      {/* 3.B TOP PRODUTOS & VENDAS POR FORMA DE PAGAMENTO         */}
      {/* ======================================================= */}
      {!isStudent && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 executive-surface rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-white">
                  Produtos Mais Vendidos (Receita Real)
                </h3>
                <p className="text-xs text-zinc-400">Ranking automático dos itens de maior saída no PDV</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer whitespace-nowrap"
              >
                Ver Relatório →
              </button>
            </div>
            {operationalMetrics.topProducts.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-zinc-500">
                Sem vendas suficientes para gerar ranking.
              </div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={operationalMetrics.topProducts} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="shortName" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload;
                        return (
                          <div className="rounded-xl bg-[#111116]/95 backdrop-blur-md border border-white/[0.12] p-2.5 shadow-2xl text-xs space-y-1">
                            <div className="font-bold text-white">{row.name}</div>
                            <div className="text-emerald-400 font-mono tabular-nums">{formatCurrency(row.revenue)}</div>
                            <div className="text-zinc-400 tabular-nums">{row.qty} unidade(s)</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="revenue" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={420} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 executive-surface rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-white">
                  Vendas por Forma de Pagamento
                </h3>
                <p className="text-xs text-zinc-400">Distribuição por meio de recebimento</p>
              </div>
              <CreditCard className="w-4 h-4 text-emerald-400" />
            </div>
            {operationalMetrics.paymentDistribution.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-zinc-500">
                Sem vendas registradas ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={operationalMetrics.paymentDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={66}
                        paddingAngle={3}
                      >
                        {operationalMetrics.paymentDistribution.map((entry, idx) => {
                          const colors = ['#10B981', '#14B8A6', '#38BDF8', '#F59E0B', '#A855F7', '#EC4899'];
                          return <Cell key={entry.key} fill={colors[idx % colors.length]} />;
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => formatCurrency(Number(val))}
                        contentStyle={{ backgroundColor: '#18181b', borderColor: 'rgba(16,185,129,0.25)', borderRadius: '0.5rem', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 text-xs">
                  {operationalMetrics.paymentDistribution.map((entry, idx) => {
                    const colors = ['bg-emerald-500', 'bg-teal-500', 'bg-sky-400', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500'];
                    return (
                      <div key={entry.key} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[#161618] border border-white/[0.05]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors[idx % colors.length]}`} />
                          <span className="text-zinc-300 truncate">{entry.name}</span>
                        </div>
                        <span className="font-mono font-bold text-white shrink-0">{formatCurrency(entry.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* 4. INDIVIDUAL STUDENT PURCHASES OR ALL STUDENTS SPENDING TABLE  */}
      {/* =============================================================== */}
      {activeTargetStudent ? (
        <div className="executive-surface rounded-2xl overflow-hidden">
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
        <div className="executive-surface rounded-2xl overflow-hidden">
          
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
                  <th className="p-3.5">Livros</th>
                  <th className="p-3.5">Alimentos</th>
                  <th className="p-3.5">Naturais</th>
                  <th className="p-3.5">Papelaria</th>
                  <th className="p-3.5">Higiene</th>
                  <th className="p-3.5">Limpeza</th>
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
                            loading="lazy"
                            decoding="async"
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
                        {formatCurrency(stCat?.byCategory['Livros e Literatura Cristã'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Alimentos e Snacks'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Produtos Naturais e Saúde'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Papelaria'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Higiene e Cuidados Pessoais'] || 0)}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        {formatCurrency(stCat?.byCategory['Limpeza'] || 0)}
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
