import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  FileDown,
  Printer,
  Calendar,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  CreditCard,
  Wallet,
  ShoppingBag,
  Boxes,
  PieChart as PieChartIcon
} from 'lucide-react';
import {
  CashMovement,
  Invoice,
  PaymentMethod,
  PixPayment,
  Product,
  Sale,
  StockMovement,
  Student
} from '../../types';
import { api } from '../../services/api';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

interface ReportsCenterProps {
  sales: Sale[];
  products: Product[];
  students: Student[];
  invoices: Invoice[];
  pixPayments: PixPayment[];
  stockMovements: StockMovement[];
}

type ReportTab =
  | 'VENDAS'
  | 'PRODUTOS'
  | 'ESTOQUE'
  | 'CONSUMO_INDIVIDUAL'
  | 'CLIENTES'
  | 'FINANCEIRO'
  | 'PAGAMENTOS'
  | 'LUCRO_ESTIMADO'
  | 'CAIXA';

const REPORT_TABS: Array<{ id: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'VENDAS', label: 'Vendas', icon: ShoppingBag },
  { id: 'PRODUTOS', label: 'Produtos', icon: Package },
  { id: 'ESTOQUE', label: 'Estoque', icon: Boxes },
  { id: 'CONSUMO_INDIVIDUAL', label: 'Consumo Individual', icon: Users },
  { id: 'CLIENTES', label: 'Clientes / Alunos', icon: Users },
  { id: 'FINANCEIRO', label: 'Financeiro', icon: DollarSign },
  { id: 'PAGAMENTOS', label: 'Pagamentos', icon: CreditCard },
  { id: 'LUCRO_ESTIMADO', label: 'Lucro Estimado', icon: TrendingUp },
  { id: 'CAIXA', label: 'Movimentações de Caixa', icon: Wallet },
];

function escapeCsvCell(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsCenter({
  sales,
  products,
  students,
  invoices,
  pixPayments,
  stockMovements,
}: ReportsCenterProps) {
  const [activeReport, setActiveReport] = useState<ReportTab>('VENDAS');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);

  useEffect(() => {
    api
      .getCashState()
      .then(data => setCashMovements(data.movements || []))
      .catch(() => setCashMovements([]));
  }, []);

  const inPeriod = (iso?: string) => {
    if (!iso) return true;
    const ymd = iso.substring(0, 10);
    return (!startDate || ymd >= startDate) && (!endDate || ymd <= endDate);
  };

  const filteredSales = useMemo(
    () => sales.filter(s => inPeriod(s.createdAt)),
    [sales, startDate, endDate]
  );

  const completedSales = useMemo(
    () => filteredSales.filter(s => s.status === 'COMPLETED'),
    [filteredSales]
  );

  const activeProducts = useMemo(
    () => products.filter(p => !p.archived && p.status === 'ACTIVE'),
    [products]
  );

  // Build tabular { headers, rows, summary } for the active report
  const reportTable = useMemo(() => {
    if (activeReport === 'VENDAS') {
      const headers = ['Cupom', 'Data', 'Aluno', 'Matrícula', 'Pagamento', 'Desconto (R$)', 'Total (R$)', 'Status', 'Operador'];
      const rows = filteredSales.map(s => [
        s.id,
        formatDateTime(s.createdAt),
        s.studentName,
        s.registrationNumber,
        s.paymentMethod || 'CONTA_ALUNO',
        (s.discountAmount || 0).toFixed(2),
        s.total.toFixed(2),
        s.status === 'COMPLETED' ? 'Concluída' : 'Estornada',
        s.operatorUserName,
      ]);
      const totalVendido = completedSales.reduce((acc, s) => acc + s.total, 0);
      return {
        title: 'Relatório de Vendas no Período',
        summary: `${completedSales.length} venda(s) concluída(s) • Total: ${formatCurrency(totalVendido)}`,
        headers,
        rows,
      };
    }

    if (activeReport === 'PRODUTOS') {
      const soldMap = new Map<string, { qty: number; revenue: number }>();
      for (const s of completedSales) {
        for (const it of s.items) {
          const cur = soldMap.get(it.productId) || { qty: 0, revenue: 0 };
          cur.qty += it.quantity;
          cur.revenue += it.subtotal;
          soldMap.set(it.productId, cur);
        }
      }
      const headers = ['Código', 'Produto', 'Categoria', 'Preço Venda (R$)', 'Custo (R$)', 'Qtd Vendida', 'Receita no Período (R$)', 'Estoque Atual'];
      const rows = activeProducts.map(p => {
        const stat = soldMap.get(p.id) || { qty: 0, revenue: 0 };
        return [
          p.internalCode,
          p.name,
          p.category,
          p.price !== null ? p.price.toFixed(2) : 'Pendente',
          p.costPrice !== undefined ? p.costPrice.toFixed(2) : '0.00',
          stat.qty,
          stat.revenue.toFixed(2),
          p.currentStock,
        ];
      });
      return {
        title: 'Relatório de Desempenho de Produtos',
        summary: `${activeProducts.length} produtos ativos no catálogo`,
        headers,
        rows,
      };
    }

    if (activeReport === 'ESTOQUE') {
      const headers = ['Código', 'Produto', 'Categoria', 'Estoque Atual', 'Estoque Mínimo', 'Situação', 'Valor Estoque (R$)'];
      const rows = activeProducts.map(p => {
        const sit = p.currentStock === 0 ? 'SEM ESTOQUE' : p.currentStock <= p.minStock ? 'ESTOQUE BAIXO' : 'NORMAL';
        const val = p.price !== null ? p.price * p.currentStock : 0;
        return [p.internalCode, p.name, p.category, p.currentStock, p.minStock, sit, val.toFixed(2)];
      });
      const movsPeriod = stockMovements.filter(m => inPeriod(m.timestamp)).length;
      return {
        title: 'Relatório de Posição de Estoque',
        summary: `${activeProducts.filter(p => p.currentStock <= p.minStock).length} itens em alerta • ${movsPeriod} movimentações no período`,
        headers,
        rows,
      };
    }

    if (activeReport === 'CONSUMO_INDIVIDUAL') {
      const headers = ['Matrícula', 'Estudante', 'Compras no Período', 'Total Consumido (R$)', 'Consumo Aberto (R$)', 'Crédito (R$)', 'Limite (R$)', 'Status Consumo'];
      const rows = students.map(st => {
        const stSales = completedSales.filter(s => s.studentId === st.id);
        const totalSt = stSales.reduce((a, b) => a + b.total, 0);
        return [
          st.registrationNumber,
          st.name,
          stSales.length,
          totalSt.toFixed(2),
          st.currentConsumptionBalance.toFixed(2),
          (st.creditBalance || 0).toFixed(2),
          st.consumptionLimit ? st.consumptionLimit.toFixed(2) : 'Sem limite',
          st.consumptionBlocked ? 'BLOQUEADO' : 'LIBERADO',
        ];
      });
      return {
        title: 'Relatório de Consumo Individual por Estudante',
        summary: `${students.length} alunos monitorados`,
        headers,
        rows,
      };
    }

    if (activeReport === 'CLIENTES') {
      const headers = ['Matrícula', 'Nome', 'CPF', 'E-mail', 'Telefone', 'Consumo Aberto (R$)', 'Dívida Total (R$)', 'Status'];
      const rows = students.map(st => [
        st.registrationNumber,
        st.name,
        st.cpf || '—',
        st.email,
        st.phone,
        st.currentConsumptionBalance.toFixed(2),
        st.totalOpenDebt.toFixed(2),
        st.status,
      ]);
      return {
        title: 'Relatório Cadastral de Clientes / Alunos',
        summary: `${students.length} cadastros ativos na 10ª Turma`,
        headers,
        rows,
      };
    }

    if (activeReport === 'FINANCEIRO') {
      const filteredInv = invoices.filter(i => i.status !== 'CANCELADA' && inPeriod(i.createdAt));
      const headers = ['Fatura', 'Competência', 'Aluno', 'Vencimento', 'Bruto (R$)', 'Pago (R$)', 'Saldo Restante (R$)', 'Status'];
      const rows = filteredInv.map(inv => [
        inv.id,
        inv.billingPeriod,
        inv.studentName,
        inv.dueDate,
        inv.grossTotal.toFixed(2),
        inv.paidTotal.toFixed(2),
        inv.remainingBalance.toFixed(2),
        inv.status,
      ]);
      const gross = filteredInv.reduce((a, i) => a + i.grossTotal, 0);
      const paid = filteredInv.reduce((a, i) => a + i.paidTotal, 0);
      return {
        title: 'Relatório Financeiro de Faturas & Recebimentos',
        summary: `Faturado: ${formatCurrency(gross)} • Recebido: ${formatCurrency(paid)}`,
        headers,
        rows,
      };
    }

    if (activeReport === 'PAGAMENTOS') {
      const filteredPix = pixPayments.filter(p => inPeriod(p.registeredAt));
      const byMethod: Record<PaymentMethod, { count: number; total: number }> = {
        CONTA_ALUNO: { count: 0, total: 0 },
        DINHEIRO: { count: 0, total: 0 },
        PIX: { count: 0, total: 0 },
        CARTAO_CREDITO: { count: 0, total: 0 },
        CARTAO_DEBITO: { count: 0, total: 0 },
        MERCADO_PAGO: { count: 0, total: 0 },
      };
      for (const s of completedSales) {
        const pm = s.paymentMethod || 'CONTA_ALUNO';
        byMethod[pm].count += 1;
        byMethod[pm].total += s.total;
      }
      const headers = ['Forma / Canal', 'Quantidade de Operações', 'Valor Total (R$)', 'Observação'];
      const rows: Array<Array<string | number>> = (Object.keys(byMethod) as PaymentMethod[]).map(pm => [
        pm,
        byMethod[pm].count,
        byMethod[pm].total.toFixed(2),
        'Vendas PDV no período',
      ]);
      rows.push([
        'COMPROVANTES PIX / FATURAS',
        filteredPix.filter(p => p.status === 'CONFIRMADO').length,
        filteredPix
          .filter(p => p.status === 'CONFIRMADO')
          .reduce((a, p) => a + p.amount, 0)
          .toFixed(2),
        'Baixas de faturas confirmadas',
      ]);
      return {
        title: 'Relatório Consolidado por Forma de Pagamento',
        summary: `${completedSales.length} vendas + ${filteredPix.length} pagamentos de fatura no período`,
        headers,
        rows,
      };
    }

    if (activeReport === 'LUCRO_ESTIMADO') {
      const costMap = new Map<string, number>();
      for (const p of products) {
        if (typeof p.costPrice === 'number' && p.costPrice >= 0) {
          costMap.set(p.id, p.costPrice);
        }
      }
      const headers = ['Cupom', 'Data', 'Aluno', 'Receita Líquida (R$)', 'Custo Estimado (R$)', 'Lucro Estimado (R$)', 'Margem (%)'];
      let sumRev = 0;
      let sumCost = 0;
      const rows = completedSales.map(s => {
        let estCost = 0;
        for (const it of s.items) {
          const unitCost = costMap.get(it.productId) ?? it.unitPrice * 0.65;
          estCost += unitCost * it.quantity;
        }
        const profit = Math.max(0, s.total - estCost);
        const margin = s.total > 0 ? (profit / s.total) * 100 : 0;
        sumRev += s.total;
        sumCost += estCost;
        return [
          s.id,
          formatDateTime(s.createdAt),
          s.studentName,
          s.total.toFixed(2),
          estCost.toFixed(2),
          profit.toFixed(2),
          `${margin.toFixed(1)}%`,
        ];
      });
      return {
        title: 'Relatório de Lucro Estimado',
        summary: `Receita: ${formatCurrency(sumRev)} • Custo Est.: ${formatCurrency(sumCost)} • Lucro Est.: ${formatCurrency(Math.max(0, sumRev - sumCost))}`,
        headers,
        rows,
      };
    }

    // CAIXA
    const filteredCash = cashMovements.filter(m => inPeriod(m.timestamp));
    const headers = ['Data / Hora', 'Sessão', 'Tipo', 'Meio', 'Descrição', 'Responsável', 'Valor (R$)'];
    const rows = filteredCash.map(m => [
      formatDateTime(m.timestamp),
      m.sessionId,
      m.type,
      m.paymentMethod,
      m.description,
      m.performedByUserName,
      m.amount.toFixed(2),
    ]);
    return {
      title: 'Relatório de Movimentações de Caixa',
      summary: `${filteredCash.length} movimentação(ões) no período`,
      headers,
      rows,
    };
  }, [activeReport, filteredSales, completedSales, activeProducts, stockMovements, students, invoices, pixPayments, cashMovements, products, startDate, endDate]);

  const handleExportCsv = () => {
    const lines = [
      reportTable.headers.map(escapeCsvCell).join(';'),
      ...reportTable.rows.map(row => row.map(escapeCsvCell).join(';')),
    ];
    const bom = '\uFEFF';
    downloadBlob(
      bom + lines.join('\r\n'),
      `relatorio-iceves-${activeReport.toLowerCase()}-${startDate}-a-${endDate}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleExportExcel = () => {
    const headerHtml = `<tr>${reportTable.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const bodyHtml = reportTable.rows
      .map(row => `<tr>${row.map(c => `<td>${String(c ?? '')}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><h3>${reportTable.title}</h3><p>${reportTable.summary}</p><table border="1">${headerHtml}${bodyHtml}</table></body></html>`;
    downloadBlob(
      '\uFEFF' + html,
      `relatorio-iceves-${activeReport.toLowerCase()}-${startDate}-a-${endDate}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <PieChartIcon className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
              Central de Relatórios Gerenciais (9 Módulos)
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Filtre por período e exporte em <strong>PDF (Impressão)</strong>, <strong>Excel (.xls)</strong> ou <strong>CSV</strong>.
          </p>
        </div>

        {/* Period & Export Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs no-print">
          <div className="flex items-center gap-1.5 bg-[#141414] border border-[#2C2C2C] rounded-xl px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-white font-mono focus:outline-none"
            />
            <span className="text-zinc-500">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-white font-mono focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl bg-[#222222] hover:bg-[#2C2C2C] border border-[#323232] text-white font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-400" />
            CSV
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl bg-white text-black hover:bg-zinc-200 font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <Printer className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* 9 Report Selector Pills */}
      <div className="flex flex-wrap gap-2 no-print">
        {REPORT_TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReport(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                active
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-[#181818] border-[#282828] text-[#A1A1AA] hover:text-white hover:border-[#383838]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Report Table */}
      <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] overflow-hidden">
        <div className="p-4 border-b border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-sm text-white">{reportTable.title}</h3>
            <p className="text-xs text-emerald-400 font-medium mt-0.5">{reportTable.summary}</p>
          </div>
          <span className="text-[11px] font-mono text-[#71717A]">
            Período: {startDate} a {endDate} • {reportTable.rows.length} linha(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
              <tr>
                {reportTable.headers.map(h => (
                  <th key={h} className="py-3 px-4 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242424]">
              {reportTable.rows.length === 0 ? (
                <tr>
                  <td colSpan={reportTable.headers.length} className="py-10 text-center text-[#71717A]">
                    Nenhum registro localizado neste período para o relatório selecionado.
                  </td>
                </tr>
              ) : (
                reportTable.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#202020] transition">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2.5 px-4 text-[#E4E4E7] whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
