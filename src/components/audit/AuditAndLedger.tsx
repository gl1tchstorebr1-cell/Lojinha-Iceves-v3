import React, { useMemo, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  BookOpen,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  FinancialTransaction,
  AuditLog,
  Student,
  Sale,
  SalesReceipt,
  Product,
  StockMovement,
  Invoice,
} from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  buildIntegrityReport,
  getInconsistentSales,
  type IntegrityReport,
} from '../../utils/dataIntegrity';
import { inspectPrincipalSnapshot } from '../../utils/offlineSnapshotCache';
import { api } from '../../services/api';

interface AuditAndLedgerProps {
  ledger: FinancialTransaction[];
  auditLogs: AuditLog[];
  students: Student[];
  sales?: Sale[];
  receipts?: SalesReceipt[];
  products?: Product[];
  stockMovements?: StockMovement[];
  invoices?: Invoice[];
  onRecoverInconsistentSale?: (saleId: string, strategy: 'CANCEL_INVALID' | 'RECOVER_RECEIPT') => Promise<void>;
  onReconcileAllInconsistent?: (strategy: 'CANCEL_INVALID' | 'RECOVER_RECEIPT') => Promise<void>;
  onRestoreBackup?: () => Promise<void>;
}

export function AuditAndLedger({
  ledger,
  auditLogs,
  students,
  sales = [],
  receipts = [],
  products = [],
  stockMovements = [],
  invoices = [],
  onRecoverInconsistentSale,
  onReconcileAllInconsistent,
  onRestoreBackup,
}: AuditAndLedgerProps) {
  const [activeTab, setActiveTab] = useState<'ledger' | 'audit' | 'integrity'>('ledger');
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('TODOS');
  const [serverReport, setServerReport] = useState<IntegrityReport | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [integrityCheckError, setIntegrityCheckError] = useState<string | null>(null);
  const [reconcilingKey, setReconcilingKey] = useState<string | null>(null);
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null);

  const inconsistentSales = useMemo(
    () => getInconsistentSales(sales, receipts),
    [sales, receipts]
  );

  const backupInfo = useMemo(() => inspectPrincipalSnapshot(), [sales, receipts]);

  const localIntegrityReport = useMemo(
    () =>
      buildIntegrityReport({
        sales,
        receipts,
        products,
        students,
        stockMovements,
        financialLedger: ledger,
        invoices,
      }),
    [sales, receipts, products, students, stockMovements, ledger, invoices]
  );

  const activeIntegrityReport = serverReport || localIntegrityReport;

  const handleRunServerIntegrityCheck = async () => {
    setIsCheckingServer(true);
    setIntegrityCheckError(null);
    try {
      const report = await api.getIntegrityReport();
      setServerReport(report);
    } catch (err: any) {
      setIntegrityCheckError(err?.message || 'Não foi possível executar o diagnóstico no servidor.');
    } finally {
      setIsCheckingServer(false);
    }
  };

  // Filter ledger
  const filteredLedger = ledger.filter(entry => {
    const q = searchTerm.toLowerCase();
    const student = students.find(s => s.id === entry.studentId);
    const studentName = student?.name.toLowerCase() || '';
    return (
      !q ||
      entry.id.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      studentName.includes(q) ||
      (entry.documentRef && entry.documentRef.toLowerCase().includes(q)) ||
      (entry.saleId && entry.saleId.toLowerCase().includes(q))
    );
  });

  // Filter audit logs
  const filteredAudit = auditLogs.filter(log => {
    const matchesModule = moduleFilter === 'TODOS' || log.module === moduleFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.userName.toLowerCase().includes(q) ||
      (log.referenceId && log.referenceId.toLowerCase().includes(q));
    return matchesModule && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#1B1B1B] rounded-2xl p-6 border border-[#282828] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-[#F5F5F5] tracking-tight">
              Motor Financeiro, Auditoria & Integridade
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Todos os saldos são calculados a partir de lançamentos imutáveis no livro-razão, com verificação contínua de integridade entre vendas, recibos e estoque.
          </p>
        </div>

        <div className="flex bg-[#151515] p-1 rounded-xl border border-[#282828] flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              activeTab === 'ledger'
                ? 'bg-[#222222] text-[#F5F5F5] border-[#303030]'
                : 'text-[#A1A1AA] border-transparent hover:text-[#F5F5F5]'
            }`}
          >
            Livro-Razão ({ledger.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              activeTab === 'audit'
                ? 'bg-[#222222] text-[#F5F5F5] border-[#303030]'
                : 'text-[#A1A1AA] border-transparent hover:text-[#F5F5F5]'
            }`}
          >
            Trilha de Auditoria ({auditLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('integrity')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
              activeTab === 'integrity'
                ? 'bg-[#222222] text-[#F5F5F5] border-[#303030]'
                : 'text-[#A1A1AA] border-transparent hover:text-[#F5F5F5]'
            }`}
          >
            {activeIntegrityReport.healthy ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>
              Integridade ({activeIntegrityReport.errorCount})
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'ledger' ? (
        /* Financial Ledger Table */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#A1A1AA] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por lançamento, aluno ou cupom..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-[#282828] rounded-xl bg-[#151515]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1E1E1E] text-[#A1A1AA] font-semibold uppercase tracking-wider text-[11px] border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Lançamento / Data</th>
                  <th className="py-3 px-4">Aluno</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Valor</th>
                  <th className="py-3 px-4">Documento Ref.</th>
                  <th className="py-3 px-4">Usuário Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#A1A1AA]">
                      Nenhum registro encontrado no livro-razão.
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map(entry => {
                    const student = students.find(s => s.id === entry.studentId);
                    const isCredit = entry.type === 'CREDITO';

                    return (
                      <tr key={entry.id} className="hover:bg-[#1A1A1A] transition">
                        <td className="py-3 px-4">
                          <span className="font-mono font-semibold text-emerald-400 block">{entry.id}</span>
                          <span className="text-[10px] text-[#A1A1AA]">{formatDateTime(entry.timestamp)}</span>
                        </td>

                        <td className="py-3 px-4 font-medium text-[#F5F5F5]">
                          {student ? student.name : entry.studentId}
                        </td>

                        <td className="py-3 px-4">
                          {isCredit ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                              <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                              CRÉDITO (-)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/60 text-red-400 border border-red-800/40">
                              <ArrowUpRight className="w-3 h-3 text-red-400" />
                              DÉBITO (+)
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#222222] text-[#D4D4D8] border border-[#303030]">
                            {entry.category.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-bold">
                          <span className={isCredit ? 'text-emerald-400' : 'text-[#F5F5F5]'}>
                            {isCredit ? `- ${formatCurrency(entry.amount)}` : `+ ${formatCurrency(entry.amount)}`}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono text-[#A1A1AA]">
                          {entry.saleId || entry.documentRef || '-'}
                        </td>

                        <td className="py-3 px-4 text-[#A1A1AA]">{entry.performedByUserName}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'audit' ? (
        /* Audit Trail Table */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#A1A1AA] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar ação, referência ou usuário..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
              {[
                'TODOS',
                'VENDAS',
                'PDV_PASSEIOS',
                'ESTOQUE',
                'PASSEIOS',
                'FATURAS',
                'PAGAMENTOS',
                'FECHAMENTO',
                'CONFIGURACOES',
                'SISTEMA',
                'AUTH',
              ].map(mod => (
                <button
                  type="button"
                  key={mod}
                  onClick={() => setModuleFilter(mod)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap border ${
                    moduleFilter === mod
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-500'
                      : 'bg-[#151515] text-[#A1A1AA] border-[#282828] hover:text-[#F5F5F5]'
                  }`}
                >
                  {mod === 'TODOS' ? 'Todos os Módulos' : mod === 'PDV_PASSEIOS' ? 'PDV DE PASSEIOS' : mod}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border border-[#282828] rounded-xl bg-[#151515]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1E1E1E] text-[#A1A1AA] font-semibold uppercase tracking-wider text-[11px] border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">Módulo</th>
                  <th className="py-3 px-4">Ação</th>
                  <th className="py-3 px-4">Detalhes da Operação</th>
                  <th className="py-3 px-4">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#A1A1AA]">
                      Nenhum registro de auditoria encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredAudit.map(log => (
                    <tr key={log.id} className="hover:bg-[#1A1A1A] transition">
                      <td className="py-3 px-4 font-mono text-[#A1A1AA]">{formatDateTime(log.timestamp)}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-[#F5F5F5] block">{log.userName}</span>
                        <span className="text-[10px] text-[#A1A1AA] uppercase font-semibold">{log.userRole}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#222222] text-[#D4D4D8] border border-[#303030]">
                          {log.module}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#F5F5F5]">
                        <span className="block">{log.action}</span>
                        {log.referenceId && (
                          <span className="text-[10px] font-mono text-emerald-400">Ref: {log.referenceId}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#D4D4D8] max-w-sm">
                        <p className="line-clamp-2" title={log.details}>
                          {log.details}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            log.status === 'SUCESSO'
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                              : 'bg-rose-950/60 text-rose-400 border-rose-800/40'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Data Integrity Diagnostics */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#F5F5F5] flex items-center gap-2">
                {activeIntegrityReport.healthy ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                )}
                <span>Diagnóstico de Integridade Transacional</span>
              </h3>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                Verifica vendas x recibos ativos, estoque negativo, movimentações, livro-razão, totais e chaves de idempotência.
              </p>
            </div>

            <button
              type="button"
              disabled={isCheckingServer}
              onClick={handleRunServerIntegrityCheck}
              className="px-4 py-2 rounded-xl bg-[#222222] hover:bg-[#2A2A2A] border border-[#333333] text-xs font-semibold text-[#F5F5F5] flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingServer ? 'animate-spin' : ''}`} />
              <span>{isCheckingServer ? 'Validando Servidor...' : 'Revalidar Base no Servidor'}</span>
            </button>
          </div>

          {integrityCheckError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              {integrityCheckError}
            </div>
          )}

          {reconcileFeedback && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
              {reconcileFeedback}
            </div>
          )}

          {inconsistentSales.length > 0 && (onRecoverInconsistentSale || onReconcileAllInconsistent) && (
            <div className="p-4 rounded-xl bg-rose-950/25 border border-rose-700/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-rose-200">
                    Vendas Inconsistentes / Órfãs Detectadas ({inconsistentSales.length})
                  </h4>
                  <p className="text-[11px] text-rose-200/80 mt-0.5">
                    Estas vendas não possuem recibo ATIVO consistente, foram removidas dos indicadores e não podem ser estornadas normalmente. Escolha uma ação auditada:
                  </p>
                </div>
                {onReconcileAllInconsistent && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={Boolean(reconcilingKey)}
                      onClick={async () => {
                        setReconcilingKey('ALL-CANCEL');
                        setIntegrityCheckError(null);
                        setReconcileFeedback(null);
                        try {
                          await onReconcileAllInconsistent('CANCEL_INVALID');
                          setServerReport(null);
                          setReconcileFeedback('Todas as vendas inconsistentes foram canceladas (CANCELLED) com registro em auditoria.');
                        } catch (e: any) {
                          setIntegrityCheckError(e?.message || 'Erro ao cancelar vendas inconsistentes.');
                        } finally {
                          setReconcilingKey(null);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {reconcilingKey === 'ALL-CANCEL' ? 'Cancelando...' : 'Cancelar Todas Inválidas'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(reconcilingKey)}
                      onClick={async () => {
                        setReconcilingKey('ALL-RECOVER');
                        setIntegrityCheckError(null);
                        setReconcileFeedback(null);
                        try {
                          await onReconcileAllInconsistent('RECOVER_RECEIPT');
                          setServerReport(null);
                          setReconcileFeedback('Recibos consistentes emitidos retroativamente para todas as vendas recuperáveis.');
                        } catch (e: any) {
                          setIntegrityCheckError(e?.message || 'Erro ao recuperar recibos.');
                        } finally {
                          setReconcilingKey(null);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {reconcilingKey === 'ALL-RECOVER' ? 'Recuperando...' : 'Recuperar Recibos'}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {inconsistentSales.map(({ sale, reason }) => (
                  <div
                    key={sale.id}
                    className="p-3 rounded-lg bg-[#151515] border border-rose-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-rose-300">{sale.id}</span>
                      <span className="text-zinc-400 mx-2">•</span>
                      <span className="text-zinc-200 font-semibold">{sale.studentName}</span>
                      <span className="text-zinc-400 mx-2">•</span>
                      <span className="font-mono text-zinc-200">{formatCurrency(sale.total)}</span>
                      <p className="text-[11px] text-rose-300/80 mt-0.5">{reason}</p>
                    </div>
                    {onRecoverInconsistentSale && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(reconcilingKey)}
                          onClick={async () => {
                            setReconcilingKey(`${sale.id}-CANCEL`);
                            setIntegrityCheckError(null);
                            setReconcileFeedback(null);
                            try {
                              await onRecoverInconsistentSale(sale.id, 'CANCEL_INVALID');
                              setServerReport(null);
                              setReconcileFeedback(`Venda ${sale.id} marcada como CANCELLED com sucesso.`);
                            } catch (e: any) {
                              setIntegrityCheckError(e?.message || 'Erro ao cancelar venda.');
                            } finally {
                              setReconcilingKey(null);
                            }
                          }}
                          className="px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Cancelar Inválida
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(reconcilingKey)}
                          onClick={async () => {
                            setReconcilingKey(`${sale.id}-RECOVER`);
                            setIntegrityCheckError(null);
                            setReconcileFeedback(null);
                            try {
                              await onRecoverInconsistentSale(sale.id, 'RECOVER_RECEIPT');
                              setServerReport(null);
                              setReconcileFeedback(`Recibo consistente recuperado para a venda ${sale.id}.`);
                            } catch (e: any) {
                              setIntegrityCheckError(e?.message || 'Erro ao recuperar recibo.');
                            } finally {
                              setReconcilingKey(null);
                            }
                          }}
                          className="px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Recuperar Recibo
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {backupInfo.hasValidBackup && onRestoreBackup && (
            <div className="p-3.5 rounded-xl bg-[#151515] border border-[#282828] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-semibold text-zinc-200 block">
                  Cópia de Segurança Local Disponível (iceves_offline_snapshot_v1_backup)
                </span>
                <span className="text-[11px] text-zinc-400">
                  Último ponto salvo antes de transação: {backupInfo.backupSyncedAt ? formatDateTime(backupInfo.backupSyncedAt) : 'disponível'}. Nunca é misturado automaticamente ao snapshot principal.
                </span>
              </div>
              <button
                type="button"
                disabled={Boolean(reconcilingKey)}
                onClick={async () => {
                  setReconcilingKey('RESTORE-BACKUP');
                  setIntegrityCheckError(null);
                  setReconcileFeedback(null);
                  try {
                    await onRestoreBackup();
                    setServerReport(null);
                    setReconcileFeedback('Snapshot principal restaurado a partir do backup seguro com registro em auditoria.');
                  } catch (e: any) {
                    setIntegrityCheckError(e?.message || 'Erro ao restaurar backup.');
                  } finally {
                    setReconcilingKey(null);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] border border-[#333333] text-zinc-200 text-[11px] font-semibold cursor-pointer shrink-0 disabled:opacity-50"
              >
                {reconcilingKey === 'RESTORE-BACKUP' ? 'Restaurando...' : 'Restaurar Backup Seguro'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#151515] border border-[#282828]">
              <span className="text-[11px] text-[#A1A1AA] block">Vendas Válidas</span>
              <span className="text-lg font-bold text-[#F5F5F5] font-mono">
                {activeIntegrityReport.summary.validCompletedSales}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#151515] border border-[#282828]">
              <span className="text-[11px] text-[#A1A1AA] block">Recibos Ativos</span>
              <span className="text-lg font-bold text-[#F5F5F5] font-mono">
                {activeIntegrityReport.summary.activeReceipts}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#151515] border border-[#282828]">
              <span className="text-[11px] text-[#A1A1AA] block">Vendas Estornadas</span>
              <span className="text-lg font-bold text-[#F5F5F5] font-mono">
                {activeIntegrityReport.summary.reversedSales}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#151515] border border-[#282828]">
              <span className="text-[11px] text-[#A1A1AA] block">Inconsistências Críticas</span>
              <span
                className={`text-lg font-bold font-mono ${
                  activeIntegrityReport.errorCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {activeIntegrityReport.errorCount}
              </span>
            </div>
          </div>

          {activeIntegrityReport.issues.length === 0 ? (
            <div className="p-5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-bold">Base 100% íntegra e consistente.</p>
                <p className="text-emerald-300/80 mt-0.5">
                  Todos os recibos ativos correspondem a vendas concluídas, nenhuma venda está duplicada, não há estoque negativo e os totais conferem.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {activeIntegrityReport.issues.map((issue, idx) => (
                <div
                  key={`${issue.code}-${issue.entityId}-${idx}`}
                  className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                    issue.severity === 'ERROR'
                      ? 'bg-rose-950/30 border-rose-800/40 text-rose-200'
                      : 'bg-amber-950/30 border-amber-800/40 text-amber-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-black/30">
                        {issue.code}
                      </span>
                      <span className="font-mono text-[10px] opacity-80">
                        {issue.entityType}: {issue.entityId}
                      </span>
                    </div>
                    <p>{issue.message}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase shrink-0">{issue.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
