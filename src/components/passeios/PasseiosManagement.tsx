import React, { useState } from 'react';
import {
  Bus,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  CheckCircle2,
  XCircle,
  Search,
  Power,
  Users,
  Sparkles,
  FileText,
  DollarSign,
  AlertTriangle,
  Database,
  Check,
  MapPin
} from 'lucide-react';
import { Passeio, Student } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface PasseiosManagementProps {
  passeios: Passeio[];
  students: Student[];
  onPasseioSaved: (passeio: Passeio) => void;
  onPasseioDeleted: (deletedId: string) => void;
}

export function PasseiosManagement({
  passeios,
  students,
  onPasseioSaved,
  onPasseioDeleted
}: PasseiosManagementProps) {
  const { isAdmin } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal state for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPasseio, setEditingPasseio] = useState<Passeio | null>(null);
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState<string>('');
  const [descricao, setDescricao] = useState('');
  const [dataPasseio, setDataPasseio] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Safe Delete Confirmation Modal state
  const [deletingPasseio, setDeletingPasseio] = useState<Passeio | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Loading state for quick status toggle
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const activeStudentsCount = students.filter(s => s.status === 'ACTIVE').length;
  const activePasseios = passeios.filter(p => p.ativo);
  const totalActiveValue = activePasseios.reduce((acc, p) => acc + Number(p.valor || 0), 0);

  const filteredPasseios = passeios.filter(p => {
    const matchesSearch =
      !searchTerm.trim() ||
      p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.descricao && p.descricao.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && p.ativo) ||
      (statusFilter === 'INACTIVE' && !p.ativo);

    return matchesSearch && matchesStatus;
  });

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast(null);
    }, 3500);
  };

  const openCreateModal = () => {
    setEditingPasseio(null);
    setNome('');
    setValor('');
    setDescricao('');
    setDataPasseio('');
    setAtivo(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (passeio: Passeio) => {
    setEditingPasseio(passeio);
    setNome(passeio.nome);
    setValor(String(passeio.valor));
    setDescricao(passeio.descricao || '');
    setDataPasseio(passeio.dataPasseio || '');
    setAtivo(passeio.ativo);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSavePasseio = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedNome = nome.trim();
    if (!trimmedNome) {
      setFormError('Informe o nome do passeio.');
      return;
    }

    const numericValor = parseFloat(String(valor).replace(',', '.'));
    if (isNaN(numericValor) || numericValor < 0) {
      setFormError('Informe um valor válido em reais (R$).');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingPasseio) {
        const updated = await api.updatePasseio(editingPasseio.id, {
          nome: trimmedNome,
          valor: numericValor,
          descricao: descricao.trim() || null,
          dataPasseio: dataPasseio || null,
          ativo
        });
        onPasseioSaved(updated);
        showToast(`Passeio "${updated.nome}" atualizado e sincronizado para todos os alunos!`);
      } else {
        const created = await api.createPasseio({
          nome: trimmedNome,
          valor: numericValor,
          descricao: descricao.trim() || null,
          dataPasseio: dataPasseio || null,
          ativo
        });
        onPasseioSaved(created);
        showToast(`Passeio "${created.nome}" cadastrado e disponibilizado para todos os ${activeStudentsCount} alunos!`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar passeio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (passeio: Passeio) => {
    setTogglingId(passeio.id);
    try {
      const updated = await api.updatePasseio(passeio.id, {
        ativo: !passeio.ativo
      });
      onPasseioSaved(updated);
      showToast(
        updated.ativo
          ? `"${updated.nome}" ativado e visível para todos os alunos.`
          : `"${updated.nome}" desativado e ocultado da área dos alunos.`
      );
    } catch (err: any) {
      setFormError(err.message || 'Erro ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingPasseio) return;
    setIsDeleting(true);
    try {
      await api.deletePasseio(deletingPasseio.id);
      const removedName = deletingPasseio.nome;
      onPasseioDeleted(deletingPasseio.id);
      setDeletingPasseio(null);
      showToast(`Passeio "${removedName}" excluído com segurança.`);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao excluir passeio.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-[#1B1B1B] rounded-2xl p-8 border border-[#282828] text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Acesso Restrito à Administração</h3>
        <p className="text-xs text-[#A1A1AA]">
          Apenas administradores autorizados do ICEVES podem gerenciar o cadastro de passeios.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feedback Toast Banner */}
      {feedbackToast && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="text-emerald-400 hover:text-white text-sm font-bold cursor-pointer px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 sm:p-6 border border-[#282828] shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Bus className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-[#F5F5F5] tracking-tight">
                    Gerenciamento de Passeios — ICEVES
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Distribuição Automática
                  </span>
                </div>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  Cadastre passeios e defina seus valores. Todos os passeios ativos são disponibilizados automaticamente na área individual dos <strong>{activeStudentsCount} alunos</strong> da 10ª Turma.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-emerald-950/50"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Passeio</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#262626] text-xs">
          <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">
                Passeios Ativos para os Alunos
              </span>
              <span className="text-lg font-extrabold text-emerald-400 mt-0.5 block">
                {activePasseios.length} de {passeios.length} cadastrado(s)
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Bus className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">
                Soma dos Passeios Ativos
              </span>
              <span className="text-lg font-extrabold text-[#F5F5F5] mt-0.5 block font-mono">
                {formatCurrency(totalActiveValue)}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">
                Alcance & Sincronização
              </span>
              <span className="text-sm font-bold text-[#F5F5F5] mt-0.5 block">
                {activeStudentsCount} Alunos Ativos • Fonte Única
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">
                Tabela Supabase: public.passeios
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar passeio por nome ou descrição..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-[#151515] p-1 rounded-xl border border-[#282828] text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#262626] text-white'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            Todos ({passeios.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            Ativos ({activePasseios.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              statusFilter === 'INACTIVE'
                ? 'bg-zinc-800 text-zinc-300'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            Inativos ({passeios.length - activePasseios.length})
          </button>
        </div>
      </div>

      {/* Passeios Table & Responsive List */}
      <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs overflow-hidden">
        {filteredPasseios.length === 0 ? (
          <div className="py-16 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#141414] border border-[#282828] flex items-center justify-center mx-auto text-[#71717A]">
              <Bus className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#F5F5F5]">
                Nenhum passeio encontrado
              </p>
              <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
                Clique em <strong>"Novo Passeio"</strong> para cadastrar excursões ou saídas da turma e disponibilizá-las automaticamente para todos os alunos.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Primeiro Passeio</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3.5 px-4">Passeio & Descrição</th>
                  <th className="py-3.5 px-4">Valor (R$)</th>
                  <th className="py-3.5 px-4">Data do Passeio</th>
                  <th className="py-3.5 px-4">Disponibilidade</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações Administrativas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredPasseios.map((passeio) => {
                  const isToggling = togglingId === passeio.id;
                  return (
                    <tr
                      key={passeio.id}
                      className={`hover:bg-[#202020] transition ${
                        !passeio.ativo ? 'opacity-70' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                              passeio.ativo
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-zinc-800/60 border-zinc-700 text-zinc-500'
                            }`}
                          >
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-[#F5F5F5] text-xs sm:text-sm block">
                              {passeio.nome}
                            </span>
                            {passeio.descricao ? (
                              <span className="text-[11px] text-[#A1A1AA] block mt-0.5 max-w-md">
                                {passeio.descricao}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#71717A] italic block mt-0.5">
                                Sem descrição adicional
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono font-extrabold text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg inline-block">
                          {formatCurrency(passeio.valor)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {passeio.dataPasseio ? (
                          <div className="inline-flex items-center gap-1.5 text-[#D4D4D8] font-mono bg-[#151515] border border-[#2C2C2C] px-2.5 py-1 rounded-lg text-[11px]">
                            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{formatDate(passeio.dataPasseio)}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#71717A]">
                            Data a definir
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {passeio.ativo ? (
                          <span className="text-[11px] text-[#D4D4D8] flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Visível p/ todos os {activeStudentsCount} alunos</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#71717A] flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span>Oculto no portal dos alunos</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {passeio.ativo ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                            <XCircle className="w-3 h-3" />
                            Inativo
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isToggling}
                            onClick={() => handleToggleStatus(passeio)}
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                              passeio.ativo
                                ? 'bg-[#222222] hover:bg-amber-950/40 text-zinc-300 hover:text-amber-300 border-[#323232] hover:border-amber-500/30'
                                : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-500/30'
                            }`}
                            title={passeio.ativo ? 'Desativar passeio' : 'Ativar passeio'}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{passeio.ativo ? 'Desativar' : 'Ativar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(passeio)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#222222] hover:bg-[#2C2C2C] text-[#D4D4D8] hover:text-emerald-400 border border-[#323232] transition cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold"
                            title="Editar nome, valor ou data do passeio"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingPasseio(passeio)}
                            className="p-1.5 rounded-lg bg-[#222222] hover:bg-red-950/50 text-[#A1A1AA] hover:text-red-400 border border-[#323232] hover:border-red-500/30 transition cursor-pointer"
                            title="Excluir passeio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Passeio Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#282828]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Bus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-[#F5F5F5] text-base">
                    {editingPasseio ? 'Editar Passeio' : 'Novo Passeio — ICEVES'}
                  </h3>
                  <p className="text-[11px] text-[#A1A1AA]">
                    Disponibilizado automaticamente para todos os alunos ativos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSavePasseio} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#F5F5F5] mb-1">
                  Nome do Passeio <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Passeio para a Cachoeira"
                  className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:border-emerald-500 focus:outline-none font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#F5F5F5] mb-1">
                    Valor em Reais (R$) <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="Ex: 35.00"
                    className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-emerald-400 font-mono font-bold placeholder-[#71717A] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#F5F5F5] mb-1">
                    Data do Passeio <span className="text-[#71717A] font-normal">(opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={dataPasseio}
                    onChange={(e) => setDataPasseio(e.target.value)}
                    className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#F5F5F5] mb-1">
                  Descrição <span className="text-[#71717A] font-normal">(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Transporte incluso, saída às 08h00 da Escola de Cristo ICEVES..."
                  className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="bg-[#141414] p-3.5 rounded-xl border border-[#282828] flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#F5F5F5] block">Status do Passeio</span>
                  <span className="text-[11px] text-[#A1A1AA]">
                    {ativo
                      ? 'Ativo — Visível imediatamente na área de todos os alunos'
                      : 'Inativo — Oculto na área dos alunos'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAtivo(!ativo)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition cursor-pointer ${
                    ativo
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}
                >
                  {ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold transition disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {isSubmitting
                    ? 'Salvando...'
                    : editingPasseio
                    ? 'Salvar Alterações'
                    : 'Cadastrar Passeio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Delete Confirmation Modal */}
      {deletingPasseio && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-[#F5F5F5] text-base">
                  Confirmar Exclusão de Passeio
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  Esta ação removerá o passeio da visualização de todos os alunos.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141414] border border-[#282828] text-xs space-y-1">
              <p className="text-[#A1A1AA]">
                Passeio: <strong className="text-white">{deletingPasseio.nome}</strong>
              </p>
              <p className="text-[#A1A1AA]">
                Valor: <strong className="text-emerald-400 font-mono">{formatCurrency(deletingPasseio.valor)}</strong>
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingPasseio(null)}
                className="flex-1 py-2.5 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl text-xs font-semibold hover:bg-[#222222] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
