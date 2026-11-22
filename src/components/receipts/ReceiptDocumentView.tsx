import React from 'react';
import { ReceiptPrintFormat, SalesReceipt, SystemSettings } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { resolveEffectiveReceiptSettings } from '../../utils/receiptPdf';

interface ReceiptDocumentViewProps {
  receipt: SalesReceipt;
  settings?: SystemSettings | null;
  format?: ReceiptPrintFormat;
  isSecondCopy?: boolean;
  mode?: 'SALE' | 'REVERSAL';
}

function formatSaoPauloDateBr(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatTimestampSp(iso?: string): string {
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

export function ReceiptDocumentView({
  receipt,
  settings,
  format = '80mm',
  isSecondCopy = false,
  mode = 'SALE',
}: ReceiptDocumentViewProps) {
  const rs = resolveEffectiveReceiptSettings(settings);
  const showSecondCopyBanner = isSecondCopy || receipt.reprintCount > 0;
  const isThermal = format === '58mm' || format === '80mm';
  const isNarrow = format === '58mm';

  const statusLabel: Record<SalesReceipt['status'], string> = {
    ATIVO: 'CONCLUÍDA',
    PARCIALMENTE_ESTORNADO: 'PARCIALMENTE ESTORNADA',
    ESTORNADO: 'ESTORNADA',
    CANCELADO: 'CANCELADA',
  };

  const containerStyle =
    format === '58mm'
      ? 'max-w-[230px] text-[10px] leading-snug p-3 font-mono'
      : format === '80mm'
      ? 'max-w-[320px] text-[11px] leading-snug p-4 font-mono'
      : 'max-w-[740px] text-xs leading-relaxed p-8 font-sans';

  const customHeader = rs.customHeader || receipt.customHeaderSnapshot;
  const customFooter = rs.customFooter || receipt.customFooterSnapshot;

  return (
    <div
      className={`mx-auto bg-white text-black border border-zinc-300 shadow-sm print:border-0 print:shadow-none ${containerStyle}`}
    >
      {/* Header Institucional */}
      <div
        className={`border-b border-dashed border-zinc-400 pb-3 ${
          format === 'A4' ? 'flex items-center justify-between gap-4' : 'text-center space-y-1'
        }`}
      >
        <div className={format === 'A4' ? 'flex items-center gap-3' : 'space-y-1'}>
          <img
            src={receipt.institution.logoUrl || '/assets/aistudio/image_e4461e45.png'}
            alt="Logo ICEVES"
            className={`${
              format === 'A4' ? 'w-14 h-14' : 'w-10 h-10 mx-auto'
            } rounded-full object-cover border border-zinc-400 grayscale print:grayscale`}
          />
          <div>
            <h4 className={`font-extrabold uppercase tracking-tight text-black ${isNarrow ? 'text-xs' : 'text-sm'}`}>
              {receipt.institution.storeName || 'Lojinha ICEVES'}
            </h4>
            <p className="text-[10px] font-semibold text-zinc-800">
              {receipt.institution.institutionName || 'Escola de Cristo — ICEVES'}
            </p>
            {(receipt.institution.unitName || receipt.institution.cnpj) && (
              <p className="text-[9px] text-zinc-700">
                {[receipt.institution.unitName, receipt.institution.cnpj ? `CNPJ ${receipt.institution.cnpj}` : '']
                  .filter(Boolean)
                  .join(' • ')}
              </p>
            )}
          </div>
        </div>

        <div className={format === 'A4' ? 'text-right' : 'pt-1'}>
          <div className="font-mono font-extrabold text-black text-xs">
            {mode === 'REVERSAL' ? 'COMPROVANTE DE ESTORNO' : 'RECIBO DE VENDA'}
          </div>
          <div className="font-mono font-bold text-black">Nº {receipt.receiptCode}</div>
          <div className="text-[10px] text-zinc-700">Venda: {receipt.saleId}</div>
        </div>
      </div>

      {customHeader && (
        <div className="py-1.5 text-center text-[10px] text-zinc-700 border-b border-dashed border-zinc-300">
          {customHeader}
        </div>
      )}

      {/* Tarjas de Segunda Via / Cancelamento / Estorno */}
      {(showSecondCopyBanner || receipt.status !== 'ATIVO' || mode === 'REVERSAL') && (
        <div className="my-2 p-2 border border-black bg-zinc-100 text-center font-bold uppercase text-[10px] space-y-0.5">
          {showSecondCopyBanner && (
            <div>SEGUNDA VIA • REIMPRESSÃO #{Math.max(1, receipt.reprintCount)}</div>
          )}
          {mode === 'REVERSAL' && <div>COMPROVANTE DE CANCELAMENTO / ESTORNO</div>}
          {(receipt.status === 'ESTORNADO' || receipt.status === 'CANCELADO') && (
            <div>
              {receipt.status === 'CANCELADO' ? 'VENDA CANCELADA' : 'VENDA ESTORNADA INTEGRALMENTE'} — NÃO VÁLIDO COMO QUITAÇÃO
            </div>
          )}
          {receipt.status === 'PARCIALMENTE_ESTORNADO' && (
            <div>VENDA COM ESTORNO PARCIAL REGISTRADO</div>
          )}
        </div>
      )}

      {/* Identificação da Venda e do Aluno */}
      <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1">
        <div className={format === 'A4' ? 'grid grid-cols-2 gap-x-6 gap-y-1' : 'space-y-0.5'}>
          <p>
            <strong>Venda:</strong> {receipt.saleId}
          </p>
          <p>
            <strong>Data/Hora:</strong> {formatSaoPauloDateBr(receipt.saleSnapshot.saoPauloDate)}{' '}
            {receipt.saleSnapshot.saoPauloTime} (BRT)
          </p>
          <p>
            <strong>Status:</strong> {statusLabel[receipt.status]}
          </p>
          {receipt.saleSnapshot.transactionId && (
            <p>
              <strong>Transação:</strong> {receipt.saleSnapshot.transactionId}
            </p>
          )}
          <p>
            <strong>Aluno:</strong> {receipt.studentSnapshot.name}
          </p>
          <p>
            <strong>Matrícula / ID:</strong> {receipt.studentSnapshot.registrationNumber}
          </p>
          {rs.showClassGroup && receipt.studentSnapshot.classGroup && (
            <p>
              <strong>Turma:</strong> {receipt.studentSnapshot.classGroup}
            </p>
          )}
          {rs.showGuardian && receipt.studentSnapshot.guardianName && (
            <p>
              <strong>Responsável:</strong> {receipt.studentSnapshot.guardianName}
              {receipt.studentSnapshot.guardianRelationship
                ? ` (${receipt.studentSnapshot.guardianRelationship})`
                : ''}
            </p>
          )}
        </div>
      </div>

      {/* Itens da Compra */}
      {mode === 'SALE' && (
        <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1.5">
          <div className="font-bold uppercase text-[10px] tracking-wider">Produtos Adquiridos</div>

          {isThermal ? (
            <div className="space-y-1.5">
              {receipt.items.map((item) => (
                <div key={`${item.itemIndex}-${item.productId}`} className="border-b border-dotted border-zinc-300 pb-1 last:border-b-0">
                  <div className="font-semibold text-black">
                    {item.name}
                    {rs.showUnitCodeSku && item.internalCode ? ` (${item.internalCode})` : ''}
                  </div>
                  <div className="flex justify-between text-zinc-800">
                    <span>
                      {item.quantity} {rs.showUnitCodeSku ? item.unit : 'x'} x {formatCurrency(item.unitPrice)}
                    </span>
                    <span className="font-bold text-black">{formatCurrency(item.total)}</span>
                  </div>
                  {item.individualDiscount > 0 && (
                    <div className="text-[9px] text-zinc-700">
                      Desconto item: -{formatCurrency(item.individualDiscount)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-400 text-[10px] uppercase">
                  <th className="py-1.5 pr-2">Produto</th>
                  {rs.showUnitCodeSku && <th className="py-1.5 px-2">SKU / Un.</th>}
                  <th className="py-1.5 px-2 text-right">Qtd</th>
                  <th className="py-1.5 px-2 text-right">Unit.</th>
                  <th className="py-1.5 px-2 text-right">Desc.</th>
                  <th className="py-1.5 pl-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {receipt.items.map((item) => (
                  <tr key={`${item.itemIndex}-${item.productId}`}>
                    <td className="py-1.5 pr-2 font-medium">{item.name}</td>
                    {rs.showUnitCodeSku && (
                      <td className="py-1.5 px-2 text-zinc-700 font-mono text-[11px]">
                        {item.internalCode || '—'} / {item.unit}
                      </td>
                    )}
                    <td className="py-1.5 px-2 text-right font-mono">{item.quantity}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {item.individualDiscount > 0 ? `-${formatCurrency(item.individualDiscount)}` : '—'}
                    </td>
                    <td className="py-1.5 pl-2 text-right font-mono font-bold">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Resumo Financeiro e Formas de Pagamento */}
      {mode === 'SALE' && (
        <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1">
          <div className="flex justify-between">
            <span>Subtotal dos produtos:</span>
            <span className="font-mono">{formatCurrency(receipt.financialSummary.productsSubtotal)}</span>
          </div>
          {receipt.financialSummary.discountTotal > 0 && (
            <div className="flex justify-between">
              <span>Descontos aplicados:</span>
              <span className="font-mono">- {formatCurrency(receipt.financialSummary.discountTotal)}</span>
            </div>
          )}
          {receipt.financialSummary.creditUsed > 0 && (
            <div className="flex justify-between">
              <span>Crédito do aluno utilizado:</span>
              <span className="font-mono">- {formatCurrency(receipt.financialSummary.creditUsed)}</span>
            </div>
          )}
          <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-zinc-300">
            <span>TOTAL DA VENDA:</span>
            <span className="font-mono">{formatCurrency(receipt.financialSummary.saleTotal)}</span>
          </div>
          {receipt.financialSummary.amountPaid > 0 && (
            <div className="flex justify-between">
              <span>Valor pago no ato:</span>
              <span className="font-mono">{formatCurrency(receipt.financialSummary.amountPaid)}</span>
            </div>
          )}
          {receipt.financialSummary.changeAmount > 0 && (
            <div className="flex justify-between font-semibold">
              <span>Troco devolvido:</span>
              <span className="font-mono">{formatCurrency(receipt.financialSummary.changeAmount)}</span>
            </div>
          )}

          <div className="pt-2 space-y-1">
            <div className="font-bold uppercase text-[10px]">Forma(s) de Pagamento:</div>
            {receipt.payments.map((p, idx) => (
              <div key={idx} className="p-1.5 border border-zinc-300 bg-zinc-50 text-[10px]">
                <div className="flex justify-between font-bold">
                  <span>{p.label}</span>
                  <span className="font-mono">{formatCurrency(p.amount)}</span>
                </div>
                <div className="text-zinc-700">
                  {p.method === 'CONTA_ALUNO'
                    ? 'Consumo lançado em conta para faturamento posterior'
                    : p.status === 'ESTORNADO'
                    ? 'Pagamento estornado'
                    : 'Pagamento confirmado no ato'}
                  {p.transactionId ? ` • ID: ${p.transactionId}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelamentos / Estornos */}
      {receipt.reversals.length > 0 && (
        <div className="py-2.5 border-b border-dashed border-zinc-400 space-y-1.5">
          <div className="font-bold uppercase text-[10px]">Histórico de Cancelamentos e Estornos</div>
          {receipt.reversals.map((rev) => (
            <div key={rev.id} className="p-2 border border-black bg-zinc-100 text-[10px] space-y-0.5">
              <div className="font-bold flex justify-between">
                <span>
                  {rev.type === 'ESTORNO_PARCIAL'
                    ? 'Estorno Parcial'
                    : rev.type === 'CANCELAMENTO'
                    ? 'Cancelamento'
                    : 'Estorno Total'}
                </span>
                <span className="font-mono">-{formatCurrency(rev.reversedAmount)}</span>
              </div>
              <div>Venda original: {rev.originalSaleId}</div>
              <div>Motivo: {rev.reason}</div>
              <div>Responsável: {rev.operatorUserName}</div>
              <div>Data/Hora: {formatTimestampSp(rev.timestamp)} (BRT)</div>
              {rev.transactionId && <div>Transação: {rev.transactionId}</div>}
              {rev.items && rev.items.length > 0 && (
                <div className="pt-1 border-t border-zinc-300">
                  {rev.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>
                        {it.quantity}x {it.name}
                      </span>
                      <span className="font-mono">{formatCurrency(it.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dados Operacionais */}
      <div className="pt-2.5 space-y-0.5 text-[10px] text-zinc-700">
        {rs.showOperator && (
          <p>
            <strong>Operador:</strong> {receipt.operational.operatorUserName}
          </p>
        )}
        {rs.showTerminalInfo && (
          <>
            <p>
              <strong>Caixa / Terminal:</strong> {receipt.operational.cashRegisterLabel || 'Lançamento Direto'} •{' '}
              {receipt.operational.terminalId || 'PDV'}
            </p>
            <p>
              <strong>Timestamp da operação:</strong> {formatTimestampSp(receipt.operational.operationTimestamp)} (America/Sao_Paulo)
            </p>
          </>
        )}
        {customFooter && (
          <p className="pt-2 text-center border-t border-dotted border-zinc-300 text-zinc-600">{customFooter}</p>
        )}
      </div>
    </div>
  );
}
