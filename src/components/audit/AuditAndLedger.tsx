import React, { useState } from 'react';
import { 
  ShieldAlert, 
  BookOpen, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  User, 
  FileText,
  Filter
} from 'lucide-react';
import { FinancialTransaction, AuditLog, Student } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

interface AuditAndLedgerProps {
  ledger: FinancialTransaction[];
  auditLogs: AuditLog[];
  students: Student[];
}

export function AuditAndLedger({ ledger, auditLogs, students }: AuditAndLedgerProps) {
  const [activeTab, setActiveTab] = useState<'ledger' | 'audit'>('ledger');
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('TODOS');

  // Filter ledger
  const filteredLedger = ledger.filter(entry => {
    const q = searchTerm.toLowerCase();
    const student = students.find(s => s.id === entry.studentId);
    const studentName = student?.name.toLowerCase() || '';
    return !q || (
      entry.id.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      studentName.includes(q) ||
      (entry.documentRef && entry.documentRef.toLowerCase().includes(q))
    );
  });

  // Filter audit logs
  const filteredAudit = auditLogs.filter(log => {
    const matchesModule = moduleFilter === 'TODOS' || log.module === moduleFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q || (
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.userName.toLowerCase().includes(q)
    );
    return matchesModule && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-[#1B1B1B] rounded-2xl p-6 border border-[#282828] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[#8B7CFF]" />
            <h2 className="text-xl font-bold text-[#F5F5F5] tracking-tight">
              Motor Financeiro & Auditoria (LGPD)
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Todos os saldos são calculados a partir de lançamentos imutáveis no livro-razão. Nenhuma alteração ocorre sem rastreabilidade do autor.
          </p>
        </div>

        <div className="flex bg-[#151515] p-1 rounded-xl border border-[#282828]">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              activeTab === 'ledger' ? 'bg-[#222222] text-[#F5F5F5] border-[#303030]' : 'text-[#A1A1AA] border-transparent hover:text-[#F5F5F5]'
            }`}
          >
            Livro-Razão ({ledger.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              activeTab === 'audit' ? 'bg-[#222222] text-[#F5F5F5] border-[#303030]' : 'text-[#A1A1AA] border-transparent hover:text-[#F5F5F5]'
            }`}
          >
            Trilha de Auditoria ({auditLogs.length})
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
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por lançamento, aluno ou cupom..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:border-[#8B7CFF] focus:outline-none"
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
                          <span className="font-mono font-semibold text-[#8B7CFF] block">{entry.id}</span>
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
                          {entry.documentRef || '-'}
                        </td>

                        <td className="py-3 px-4 text-[#A1A1AA]">
                          {entry.performedByUserName}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Audit Trail Table */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#A1A1AA] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar ação ou usuário..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:border-[#8B7CFF] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
              {['TODOS', 'VENDAS', 'ESTOQUE', 'FATURAS', 'PAGAMENTOS', 'FECHAMENTO', 'CONFIGURACOES', 'AUTH'].map(mod => (
                <button
                  key={mod}
                  onClick={() => setModuleFilter(mod)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap border ${
                    moduleFilter === mod ? 'bg-[#8B7CFF] text-white border-[#8B7CFF]' : 'bg-[#151515] text-[#A1A1AA] border-[#282828] hover:text-[#F5F5F5]'
                  }`}
                >
                  {mod === 'TODOS' ? 'Todos os Módulos' : mod}
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
                      <td className="py-3 px-4 font-mono text-[#A1A1AA]">
                        {formatDateTime(log.timestamp)}
                      </td>
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
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-[#D4D4D8] max-w-sm">
                        <p className="line-clamp-2" title={log.details}>{log.details}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
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
      )}

    </div>
  );
}
