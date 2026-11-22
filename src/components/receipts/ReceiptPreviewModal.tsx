import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X, FileCheck2, RotateCcw, AlertCircle } from 'lucide-react';
import { ReceiptPrintFormat, SalesReceipt, SystemSettings } from '../../types';
import { ReceiptDocumentView } from './ReceiptDocumentView';
import { downloadReceiptPdf, resolveEffectiveReceiptSettings } from '../../utils/receiptPdf';
import { api } from '../../services/api';

interface ReceiptPreviewModalProps {
  receipt: SalesReceipt;
  settings?: SystemSettings | null;
  initialFormat?: ReceiptPrintFormat;
  initialMode?: 'SALE' | 'REVERSAL';
  isSecondCopy?: boolean;
  onReceiptUpdated?: (updated: SalesReceipt) => void;
  onClose: () => void;
}

function ensurePrintRoot(): HTMLElement {
  let root = document.getElementById('iceves-print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'iceves-print-root';
    document.body.appendChild(root);
  }
  return root;
}

export function triggerScopedReceiptPrint(
  format: ReceiptPrintFormat,
  afterPrintCallback?: () => void
) {
  const styleId = 'iceves-dynamic-page-style';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent =
    format === '58mm'
      ? '@page { size: 58mm auto; margin: 2mm; }'
      : format === '80mm'
      ? '@page { size: 80mm auto; margin: 3mm; }'
      : '@page { size: A4 portrait; margin: 10mm; }';

  document.body.classList.add('printing-receipt');

  const cleanup = () => {
    document.body.classList.remove('printing-receipt');
    window.removeEventListener('afterprint', cleanup);
    if (afterPrintCallback) afterPrintCallback();
  };

  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 1200);
  }, 60);
}

export function ReceiptPreviewModal({
  receipt,
  settings,
  initialFormat,
  initialMode = 'SALE',
  isSecondCopy = false,
  onReceiptUpdated,
  onClose,
}: ReceiptPreviewModalProps) {
  const effectiveSettings = resolveEffectiveReceiptSettings(settings);
  const [format, setFormat] = useState<ReceiptPrintFormat>(
    initialFormat || effectiveSettings.defaultPrintFormat || '80mm'
  );
  const [mode, setMode] = useState<'SALE' | 'REVERSAL'>(initialMode);
  const [currentReceipt, setCurrentReceipt] = useState<SalesReceipt>(receipt);
  const [isExporting, setIsExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [printRootEl, setPrintRootEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setCurrentReceipt(receipt);
  }, [receipt]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPrintRootEl(ensurePrintRoot());
    }
  }, []);

  const showSecondCopy = isSecondCopy || currentReceipt.reprintCount > 0;

  const handlePrint = async () => {
    setActionError(null);
    try {
      const updated = await api.recordReceiptAction(
        currentReceipt.id,
        showSecondCopy ? 'REPRINT' : 'PRINT'
      );
      setCurrentReceipt(updated);
      if (onReceiptUpdated) onReceiptUpdated(updated);
    } catch (err: any) {
      // Allow immediate audit error blocking if role disallowed 2nd copy
      if (/permissão|negado/i.test(err?.message || '')) {
        setActionError(err.message);
        return;
      }
    }
    triggerScopedReceiptPrint(format);
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      try {
        const updated = await api.recordReceiptAction(currentReceipt.id, 'PDF');
        setCurrentReceipt(updated);
        if (onReceiptUpdated) onReceiptUpdated(updated);
      } catch {
        // non-blocking for offline download unless role disallowed
      }
      const { filename } = await downloadReceiptPdf(currentReceipt, settings, {
        isSecondCopy: showSecondCopy,
        mode,
      });
      setActionSuccess(`PDF exportado: ${filename}`);
    } catch (err: any) {
      setActionError(err?.message || 'Não foi possível gerar o PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const hasReversals = currentReceipt.reversals.length > 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
        <div className="bg-[#141414] rounded-2xl border border-white/[0.12] shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-modal-blur-in">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FileCheck2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  Comprovante {currentReceipt.receiptCode} • Venda {currentReceipt.saleId}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  {currentReceipt.studentSnapshot.name} • Impressões registradas: {currentReceipt.reprintCount}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasReversals && (
                <div className="flex bg-[#1C1C20] p-0.5 rounded-lg border border-white/[0.08] text-[11px]">
                  <button
                    type="button"
                    onClick={() => setMode('SALE')}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                      mode === 'SALE' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Recibo Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('REVERSAL')}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer flex items-center gap-1 ${
                      mode === 'REVERSAL' ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Estorno
                  </button>
                </div>
              )}

              <div className="flex bg-[#1C1C20] p-0.5 rounded-lg border border-white/[0.08] text-[11px]">
                {(['58mm', '80mm', 'A4'] as ReceiptPrintFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={`px-2.5 py-1 rounded-md font-mono font-semibold cursor-pointer transition ${
                      format === fmt ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Alerts */}
          {(actionError || actionSuccess) && (
            <div className="px-5 pt-3">
              {actionError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs">
                  {actionSuccess}
                </div>
              )}
            </div>
          )}

          {/* Document Preview Stage */}
          <div className="flex-1 overflow-y-auto p-5 bg-[#0D0D0F]">
            <ReceiptDocumentView
              receipt={currentReceipt}
              settings={settings}
              format={format}
              isSecondCopy={showSecondCopy}
              mode={mode}
            />
          </div>

          {/* Footer Controls */}
          <div className="px-5 py-3.5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#141414]">
            <span className="text-[11px] text-zinc-500">
              Layout otimizado em preto e branco ({format}) • Fuso America/Sao_Paulo
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting}
                className="px-4 py-2 rounded-xl bg-[#1F1F24] hover:bg-[#28282F] border border-white/[0.12] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                {isExporting ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                {showSecondCopy ? 'Imprimir 2ª Via' : 'Imprimir Recibo'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Portal dedicated solely for clean window.print() */}
      {printRootEl &&
        createPortal(
          <ReceiptDocumentView
            receipt={currentReceipt}
            settings={settings}
            format={format}
            isSecondCopy={showSecondCopy}
            mode={mode}
          />,
          printRootEl
        )}
    </>
  );
}
