import { Invoice, Sale, Student } from '../types';
import { formatDate, formatDateTime, formatPeriod } from './formatters';

function sanitizeCsvValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw);
  // Prevent CSV formula injection in spreadsheet tools while keeping negative numbers intact
  if (/^[=+\t\r@]/.test(str) || (/^-/.test(str) && !/^-\d+([.,]\d+)?$/.test(str))) {
    str = `'${str}`;
  }
  return str;
}

export function escapeCsvCell(value: unknown): string {
  const str = sanitizeCsvValue(value);
  if (/[",\r\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeCsvRows(rows: unknown[][]): string {
  return rows
    .map(row => row.map(cell => escapeCsvCell(cell)).join(','))
    .join('\r\n');
}

export function downloadCsvFile(filename: string, rows: unknown[][]): void {
  const csvContent = '\uFEFF' + serializeCsvRows(rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function formatMoneyNumber(value: number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

function translateInvoiceStatus(status: string): string {
  switch (status) {
    case 'PAGA':
      return 'Quitada / Paga';
    case 'PARCIALMENTE_PAGA':
      return 'Parcialmente Paga';
    case 'PUBLICADA':
      return 'Publicada (Em Aberto)';
    case 'VENCIDA':
      return 'Vencida';
    case 'AGUARDANDO_APROVACAO':
      return 'Aguardando Aprovação';
    case 'RASCUNHO':
      return 'Rascunho';
    case 'CANCELADA':
      return 'Cancelada';
    default:
      return status;
  }
}

function translateSaleOrigin(origin?: string): string {
  if (origin === 'PDV_PASSEIOS') return 'PDV Passeios';
  return 'Lojinha';
}

function translateSaleStatus(status: string): string {
  return status === 'REVERSED' ? 'Estornada' : 'Concluída';
}

export function getExportDateSlug(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const INVOICE_CSV_HEADERS = [
  'ID Fatura',
  'Aluno',
  'Matrícula',
  'Turma',
  'Competência',
  'Situação',
  'Mensalidade (R$)',
  'Consumo Lojinha (R$)',
  'Saldo Anterior (R$)',
  'Descontos/Ajustes (R$)',
  'Total Faturado (R$)',
  'Total Pago (R$)',
  'Saldo Pendente (R$)',
  'Data Fechamento',
  'Data Vencimento',
  'Qtd Vendas Vinculadas',
  'Itens Consumidos',
  'Pagamentos Alocados',
  'Observações',
  'Criado Em',
  'Atualizado Em'
];

export function buildInvoiceDataRows(invoices: Invoice[], students: Student[]): unknown[][] {
  const studentMap = new Map(students.map(s => [s.id, s]));

  return invoices.map(inv => {
    const student = studentMap.get(inv.studentId);
    const itemsSummary = (inv.consumptionItems || [])
      .map(
        item =>
          `${item.quantity}x ${item.productName} (${formatMoneyNumber(item.totalAmount)})`
      )
      .join(' | ');

    const paymentsSummary = (inv.paymentAllocations || [])
      .map(
        alloc =>
          `${alloc.paymentId}: R$ ${formatMoneyNumber(alloc.amount)} (${alloc.payerName} - ${alloc.payerType} em ${formatDate(alloc.date)})`
      )
      .join(' | ');

    return [
      inv.id,
      inv.studentName,
      inv.registrationNumber,
      student?.classGroup || '-',
      formatPeriod(inv.billingPeriod),
      translateInvoiceStatus(inv.status),
      formatMoneyNumber(inv.tuitionAmount),
      formatMoneyNumber(inv.canteenConsumptionTotal),
      formatMoneyNumber(inv.previousBalance),
      formatMoneyNumber(inv.adjustmentsTotal),
      formatMoneyNumber(inv.grossTotal),
      formatMoneyNumber(inv.paidTotal),
      formatMoneyNumber(inv.remainingBalance),
      formatDate(inv.closingDate),
      formatDate(inv.dueDate),
      (inv.salesIds || []).length,
      itemsSummary || 'Sem itens de consumo',
      paymentsSummary || 'Nenhum pagamento alocado',
      inv.notes || '',
      formatDateTime(inv.createdAt),
      formatDateTime(inv.updatedAt)
    ];
  });
}

export const SALE_CSV_HEADERS = [
  'ID Venda',
  'Origem',
  'Data/Hora',
  'Aluno',
  'Matrícula',
  'Turma',
  'Competência',
  'ID Fatura Vinculada',
  'Status',
  'Valor Total (R$)',
  'Qtd Itens',
  'Itens Detalhados',
  'Operador',
  'Passeio / Destino',
  'Motivo Estorno',
  'Estornado Por',
  'Estornado Em'
];

export function buildSaleDataRows(sales: Sale[], students: Student[]): unknown[][] {
  const studentMap = new Map(students.map(s => [s.id, s]));

  return sales.map(sale => {
    const student = studentMap.get(sale.studentId);
    const totalQty = (sale.items || []).reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
    const itemsDetail = (sale.items || [])
      .map(
        item =>
          `${item.quantity}x ${item.name} (${item.category} - Unit: ${formatMoneyNumber(item.unitPrice)} | Sub: ${formatMoneyNumber(item.subtotal)})`
      )
      .join(' | ');

    const tripLabel = sale.tripName
      ? [sale.tripName, sale.tripDestination, sale.tripDate ? formatDate(sale.tripDate) : '']
          .filter(Boolean)
          .join(' — ')
      : '';

    return [
      sale.id,
      translateSaleOrigin(sale.origin),
      formatDateTime(sale.createdAt),
      sale.studentName,
      sale.registrationNumber,
      student?.classGroup || '-',
      formatPeriod(sale.billingPeriod),
      sale.invoiceId || 'Não faturada (Em aberto)',
      translateSaleStatus(sale.status),
      formatMoneyNumber(sale.total),
      totalQty,
      itemsDetail || '-',
      sale.operatorUserName,
      tripLabel,
      sale.reversedReason || '',
      sale.reversedByUserName || '',
      sale.reversedAt ? formatDateTime(sale.reversedAt) : ''
    ];
  });
}

export function buildInvoicesOnlyCsvRows(invoices: Invoice[], students: Student[]): unknown[][] {
  return [INVOICE_CSV_HEADERS, ...buildInvoiceDataRows(invoices, students)];
}

export function buildSalesOnlyCsvRows(sales: Sale[], students: Student[]): unknown[][] {
  return [SALE_CSV_HEADERS, ...buildSaleDataRows(sales, students)];
}

export function buildCombinedFinancialBackupCsvRows(params: {
  invoices: Invoice[];
  sales: Sale[];
  students: Student[];
  exportedBy?: string;
}): unknown[][] {
  const { invoices, sales, students, exportedBy } = params;

  const activeInvoices = invoices.filter(i => i.status !== 'CANCELADA');
  const totalTuitions = activeInvoices.reduce((acc, i) => acc + (Number(i.tuitionAmount) || 0), 0);
  const totalCanteen = activeInvoices.reduce((acc, i) => acc + (Number(i.canteenConsumptionTotal) || 0), 0);
  const totalGross = activeInvoices.reduce((acc, i) => acc + (Number(i.grossTotal) || 0), 0);
  const totalPaid = activeInvoices.reduce((acc, i) => acc + (Number(i.paidTotal) || 0), 0);
  const totalRemaining = activeInvoices.reduce((acc, i) => acc + (Number(i.remainingBalance) || 0), 0);

  const completedSales = sales.filter(s => s.status === 'COMPLETED');
  const reversedSales = sales.filter(s => s.status === 'REVERSED');
  const totalCompletedSales = completedSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const totalReversedSales = reversedSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);

  const rows: unknown[][] = [
    ['RELATÓRIO OFFLINE DE BACKUP FINANCEIRO — FATURAS E VENDAS (LOJINHA ICEVES)'],
    ['Gerado Em', formatDateTime(new Date().toISOString()), 'Responsável', exportedBy || 'Administrador'],
    [
      'Resumo Faturas',
      `Qtd: ${invoices.length}`,
      `Total Faturado (R$): ${formatMoneyNumber(totalGross)}`,
      `Total Recebido (R$): ${formatMoneyNumber(totalPaid)}`,
      `Saldo Pendente (R$): ${formatMoneyNumber(totalRemaining)}`
    ],
    [
      'Resumo Vendas',
      `Qtd Total: ${sales.length}`,
      `Concluídas (${completedSales.length}): R$ ${formatMoneyNumber(totalCompletedSales)}`,
      `Estornadas (${reversedSales.length}): R$ ${formatMoneyNumber(totalReversedSales)}`
    ],
    [],
    ['SEÇÃO 1 — FATURAS EMITIDAS'],
    INVOICE_CSV_HEADERS,
    ...buildInvoiceDataRows(invoices, students),
    [
      'TOTAL FATURAS ATIVAS',
      `${activeInvoices.length} faturas`,
      '',
      '',
      '',
      '',
      formatMoneyNumber(totalTuitions),
      formatMoneyNumber(totalCanteen),
      '',
      '',
      formatMoneyNumber(totalGross),
      formatMoneyNumber(totalPaid),
      formatMoneyNumber(totalRemaining)
    ],
    [],
    ['SEÇÃO 2 — VENDAS REGISTRADAS (PDV LOJINHA & PDV PASSEIOS)'],
    SALE_CSV_HEADERS,
    ...buildSaleDataRows(sales, students),
    [
      'TOTAL VENDAS CONCLUÍDAS',
      `${completedSales.length} vendas válidas`,
      '',
      '',
      '',
      '',
      '',
      '',
      'Concluída',
      formatMoneyNumber(totalCompletedSales)
    ]
  ];

  return rows;
}
