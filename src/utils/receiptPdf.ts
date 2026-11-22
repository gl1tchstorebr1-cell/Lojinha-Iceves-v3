import { jsPDF } from 'jspdf';
import type { ReceiptSettings, SalesReceipt } from '../types';

export interface ReceiptPdfOptions {
  isSecondCopy?: boolean;
  mode?: 'SALE' | 'REVERSAL';
  logoDataUrl?: string | null;
}

function formatMoney(value: number): string {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

function formatSaoPauloDateBr(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatTimestampSaoPaulo(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt);
}

export function slugifyStudentName(name: string): string {
  const clean = (name || 'ALUNO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'ALUNO';
}

export function buildReceiptPdfFilename(
  receipt: SalesReceipt,
  mode: 'SALE' | 'REVERSAL' = 'SALE'
): string {
  const studentSlug = slugifyStudentName(receipt.studentSnapshot.name);
  const datePart = receipt.saleSnapshot.saoPauloDate || new Date().toISOString().slice(0, 10);
  const prefix = mode === 'REVERSAL' ? 'ESTORNO_ICEVES' : 'RECIBO_ICEVES';
  return `${prefix}_${receipt.receiptCode}_${studentSlug}_${datePart}.pdf`;
}

export function resolveEffectiveReceiptSettings(settings?: SystemSettingsLike | null): ReceiptSettings {
  const rs = settings?.receiptSettings;
  return {
    autoPrintOnSale: rs?.autoPrintOnSale ?? false,
    defaultPrintFormat: rs?.defaultPrintFormat ?? '80mm',
    customHeader: rs?.customHeader ?? 'Escola de Cristo — ICEVES • Comprovante Oficial da Lojinha',
    customFooter:
      rs?.customFooter ??
      'Documento interno emitido para conferência de consumo e pagamento. Dúvidas? Procure a coordenação.',
    showOperator: rs?.showOperator ?? true,
    showClassGroup: rs?.showClassGroup ?? true,
    showGuardian: rs?.showGuardian ?? true,
    showUnitCodeSku: rs?.showUnitCodeSku ?? true,
    showTerminalInfo: rs?.showTerminalInfo ?? true,
    secondCopyAllowedRoles: rs?.secondCopyAllowedRoles ?? [
      'ADMIN',
      'MANAGER',
      'CASHIER',
      'VIEWER',
      'STUDENT',
      'GUARDIAN',
    ],
  };
}

interface SystemSettingsLike {
  receiptSettings?: Partial<ReceiptSettings>;
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return null;
  }
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function createReceiptPdfDocument(
  receipt: SalesReceipt,
  settings?: SystemSettingsLike | null,
  options?: ReceiptPdfOptions
): jsPDF {
  const rs = resolveEffectiveReceiptSettings(settings);
  const isSecondCopy = Boolean(options?.isSecondCopy || receipt.reprintCount > 0);
  const mode = options?.mode || 'SALE';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 14) {
      doc.addPage();
      y = 14;
    }
  };

  const drawHorizontalRule = (dashed = false) => {
    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.25);
    if (dashed && typeof (doc as any).setLineDashPattern === 'function') {
      (doc as any).setLineDashPattern([1.5, 1.5], 0);
    }
    doc.line(margin, y, pageWidth - margin, y);
    if (dashed && typeof (doc as any).setLineDashPattern === 'function') {
      (doc as any).setLineDashPattern([], 0);
    }
    y += 3.5;
  };

  const writeWrappedLine = (text: string, fontSize = 9, bold = false, colorRgb: [number, number, number] = [20, 20, 20]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = fontSize * 0.42;
    ensureSpace(lines.length * lineHeight + 2);
    doc.text(lines, margin, y);
    y += lines.length * lineHeight + 1.2;
  };

  // 1. Institution Header
  const logoDataUrl = options?.logoDataUrl;
  let textStartX = margin;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, y, 16, 16);
      textStartX = margin + 20;
    } catch {
      textStartX = margin;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(receipt.institution.storeName || 'Lojinha ICEVES', textStartX, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(55, 65, 81);
  doc.text(receipt.institution.institutionName || 'Escola de Cristo — ICEVES', textStartX, y + 10);

  const unitCnpjLine = [
    receipt.institution.unitName,
    receipt.institution.cnpj ? `CNPJ: ${receipt.institution.cnpj}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  if (unitCnpjLine) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(unitCnpjLine, textStartX, y + 14.5);
  }

  // Right aligned receipt code badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`RECIBO ${receipt.receiptCode}`, pageWidth - margin, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Venda ${receipt.saleId}`, pageWidth - margin, y + 9.5, { align: 'right' });

  y += 20;

  const customHeader = rs.customHeader || receipt.customHeaderSnapshot;
  if (customHeader) {
    writeWrappedLine(customHeader, 8.5, false, [75, 85, 99]);
  }

  // Status / 2nd copy / Reversal banner
  if (mode === 'REVERSAL' || receipt.status !== 'ATIVO' || isSecondCopy) {
    const badges: string[] = [];
    if (mode === 'REVERSAL') badges.push('COMPROVANTE DE CANCELAMENTO / ESTORNO');
    if (isSecondCopy) badges.push(`SEGUNDA VIA (REIMPRESSÃO #${Math.max(1, receipt.reprintCount)})`);
    if (receipt.status === 'ESTORNADO') badges.push('VENDA ESTORNADA INTEGRALMENTE — DOCUMENTO SEM VALOR DE QUITAÇÃO');
    if (receipt.status === 'CANCELADO') badges.push('VENDA CANCELADA — DOCUMENTO SEM VALOR DE QUITAÇÃO');
    if (receipt.status === 'PARCIALMENTE_ESTORNADO') badges.push('VENDA PARCIALMENTE ESTORNADA');

    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(156, 163, 175);
    const bannerLines = doc.splitTextToSize(badges.join(' • '), contentWidth - 6);
    const bannerHeight = bannerLines.length * 4 + 4;
    ensureSpace(bannerHeight + 3);
    doc.rect(margin, y, contentWidth, bannerHeight, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(bannerLines, margin + 3, y + 4.5);
    y += bannerHeight + 4;
  }

  drawHorizontalRule();

  // 2. Identificação da Venda e do Aluno
  const statusHuman: Record<SalesReceipt['status'], string> = {
    ATIVO: 'CONCLUÍDA',
    PARCIALMENTE_ESTORNADO: 'PARCIALMENTE ESTORNADA',
    ESTORNADO: 'ESTORNADA',
    CANCELADO: 'CANCELADA',
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DADOS DA VENDA E DO ALUNO', margin, y);
  y += 5;

  const colMid = margin + contentWidth / 2 + 2;
  const infoPairs: Array<[string, string]> = [
    [`Código da Venda: ${receipt.saleId}`, `Aluno: ${receipt.studentSnapshot.name}`],
    [
      `Data/Hora: ${formatSaoPauloDateBr(receipt.saleSnapshot.saoPauloDate)} ${receipt.saleSnapshot.saoPauloTime} (${receipt.saleSnapshot.timezone})`,
      `Matrícula / ID: ${receipt.studentSnapshot.registrationNumber}`,
    ],
    [
      `Status da Venda: ${statusHuman[receipt.status]}`,
      rs.showClassGroup && receipt.studentSnapshot.classGroup
        ? `Turma: ${receipt.studentSnapshot.classGroup}`
        : `Origem: ${receipt.saleSnapshot.origin === 'PDV_PASSEIOS' ? 'PDV de Passeios' : 'Balcão PDV'}`,
    ],
  ];

  if (receipt.saleSnapshot.transactionId || (rs.showGuardian && receipt.studentSnapshot.guardianName)) {
    infoPairs.push([
      receipt.saleSnapshot.transactionId ? `Transação: ${receipt.saleSnapshot.transactionId}` : '',
      rs.showGuardian && receipt.studentSnapshot.guardianName
        ? `Responsável: ${receipt.studentSnapshot.guardianName}${receipt.studentSnapshot.guardianRelationship ? ` (${receipt.studentSnapshot.guardianRelationship})` : ''}`
        : '',
    ]);
  }

  for (const [left, right] of infoPairs) {
    ensureSpace(6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(31, 41, 55);
    if (left) {
      const lLines = doc.splitTextToSize(left, contentWidth / 2 - 4);
      doc.text(lLines, margin, y);
    }
    if (right) {
      const rLines = doc.splitTextToSize(right, contentWidth / 2 - 4);
      doc.text(rLines, colMid, y);
    }
    y += 4.5;
  }

  y += 2;
  drawHorizontalRule();

  // 3. Produtos Adquiridos (ou itens originais quando modo SALE)
  if (mode === 'SALE') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PRODUTOS ADQUIRIDOS', margin, y);
    y += 5;

    // Table header
    ensureSpace(8);
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, y - 3.5, contentWidth, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 24, 39);
    doc.text('ITEM / CÓDIGO', margin + 1.5, y);
    doc.text('QTD', margin + 106, y, { align: 'right' });
    doc.text('UNIT.', margin + 130, y, { align: 'right' });
    doc.text('DESC.', margin + 152, y, { align: 'right' });
    doc.text('TOTAL', pageWidth - margin - 1.5, y, { align: 'right' });
    y += 5;

    for (const item of receipt.items) {
      const skuPart = rs.showUnitCodeSku && item.internalCode ? ` [${item.internalCode}]` : '';
      const unitLabel = rs.showUnitCodeSku && item.unit ? ` ${item.unit}` : '';
      const itemTitle = `${item.name}${skuPart}`;
      const titleLines = doc.splitTextToSize(itemTitle, 92);
      const rowHeight = Math.max(5.5, titleLines.length * 3.8 + 1.5);
      ensureSpace(rowHeight + 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(17, 24, 39);
      doc.text(titleLines, margin + 1.5, y);
      doc.text(`${item.quantity}${unitLabel}`, margin + 106, y, { align: 'right' });
      doc.text(formatMoney(item.unitPrice), margin + 130, y, { align: 'right' });
      doc.text(item.individualDiscount > 0 ? `-${formatMoney(item.individualDiscount)}` : '—', margin + 152, y, {
        align: 'right',
      });
      doc.setFont('helvetica', 'bold');
      doc.text(formatMoney(item.total), pageWidth - margin - 1.5, y, { align: 'right' });
      y += rowHeight;
    }

    y += 1.5;
    drawHorizontalRule(true);

    // 4. Resumo Financeiro
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('RESUMO FINANCEIRO & PAGAMENTO', margin, y);
    y += 5;

    const finRows: Array<[string, string, boolean?]> = [
      ['Subtotal dos Produtos:', formatMoney(receipt.financialSummary.productsSubtotal)],
    ];
    if (receipt.financialSummary.discountTotal > 0) {
      finRows.push(['Descontos Aplicados:', `- ${formatMoney(receipt.financialSummary.discountTotal)}`]);
    }
    if (receipt.financialSummary.creditUsed > 0) {
      finRows.push(['Crédito do Aluno Utilizado:', `- ${formatMoney(receipt.financialSummary.creditUsed)}`]);
    }
    finRows.push(['Total Líquido da Venda:', formatMoney(receipt.financialSummary.saleTotal), true]);

    if (receipt.financialSummary.amountPaid > 0) {
      finRows.push(['Valor Recebido no Ato:', formatMoney(receipt.financialSummary.amountPaid)]);
    }
    if (receipt.financialSummary.changeAmount > 0) {
      finRows.push(['Troco Devolvido:', formatMoney(receipt.financialSummary.changeAmount)]);
    }

    for (const [label, val, bold] of finRows) {
      ensureSpace(5);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 9.5 : 8.5);
      doc.setTextColor(17, 24, 39);
      doc.text(label, margin, y);
      doc.text(val, pageWidth - margin, y, { align: 'right' });
      y += bold ? 5 : 4.2;
    }

    y += 2;
    for (const pay of receipt.payments) {
      const desc =
        pay.method === 'CONTA_ALUNO'
          ? `${pay.label}: ${formatMoney(pay.amount)} — Consumo lançado em conta para faturamento posterior`
          : `${pay.label}: ${formatMoney(pay.amount)} — ${
              pay.status === 'ESTORNADO' ? 'Estornado' : 'Pagamento confirmado no ato'
            }${pay.transactionId ? ` (${pay.transactionId})` : ''}`;
      writeWrappedLine(desc, 8.2, false, [55, 65, 81]);
    }
  }

  // 5. Cancelamentos e Estornos (sempre presente quando existir ou no modo REVERSAL)
  if (receipt.reversals.length > 0) {
    y += 2;
    drawHorizontalRule();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(17, 24, 39);
    doc.text('REGISTRO DE CANCELAMENTO / ESTORNO', margin, y);
    y += 5;

    for (const rev of receipt.reversals) {
      const revTypeLabel =
        rev.type === 'ESTORNO_PARCIAL'
          ? 'Estorno Parcial'
          : rev.type === 'CANCELAMENTO'
          ? 'Cancelamento'
          : 'Estorno Total';
      writeWrappedLine(
        `${revTypeLabel} • Venda Original: ${rev.originalSaleId} • Valor Estornado: ${formatMoney(rev.reversedAmount)}`,
        8.5,
        true
      );
      writeWrappedLine(
        `Motivo: ${rev.reason} | Responsável: ${rev.operatorUserName} | Data/Hora: ${formatTimestampSaoPaulo(rev.timestamp)}`,
        8.2,
        false,
        [55, 65, 81]
      );
      if (rev.transactionId) {
        writeWrappedLine(`Transação Estornada: ${rev.transactionId}`, 8, false, [75, 85, 99]);
      }
      if (rev.items && rev.items.length > 0) {
        for (const ri of rev.items) {
          writeWrappedLine(`  • ${ri.quantity}x ${ri.name}: ${formatMoney(ri.amount)}`, 8, false, [55, 65, 81]);
        }
      }
    }
  }

  // 6. Dados Operacionais
  y += 2;
  drawHorizontalRule(true);
  const opParts: string[] = [];
  if (rs.showOperator) {
    opParts.push(`Operador: ${receipt.operational.operatorUserName}`);
  }
  if (rs.showTerminalInfo) {
    if (receipt.operational.cashRegisterLabel) opParts.push(`Caixa: ${receipt.operational.cashRegisterLabel}`);
    if (receipt.operational.terminalId) opParts.push(`Terminal: ${receipt.operational.terminalId}`);
    opParts.push(`Operação: ${formatTimestampSaoPaulo(receipt.operational.operationTimestamp)}`);
  }
  if (opParts.length > 0) {
    writeWrappedLine(opParts.join(' | '), 8, false, [75, 85, 99]);
  }

  const customFooter = rs.customFooter || receipt.customFooterSnapshot;
  if (customFooter) {
    y += 1.5;
    writeWrappedLine(customFooter, 8, false, [100, 116, 139]);
  }

  return doc;
}

export async function downloadReceiptPdf(
  receipt: SalesReceipt,
  settings?: SystemSettingsLike | null,
  options?: ReceiptPdfOptions
): Promise<{ filename: string }> {
  const logoDataUrl = options?.logoDataUrl !== undefined
    ? options.logoDataUrl
    : await loadImageAsDataUrl(receipt.institution.logoUrl || '/assets/aistudio/image_e4461e45.png');

  const doc = createReceiptPdfDocument(receipt, settings, {
    ...options,
    logoDataUrl,
  });
  const filename = buildReceiptPdfFilename(receipt, options?.mode || 'SALE');
  doc.save(filename);
  return { filename };
}
