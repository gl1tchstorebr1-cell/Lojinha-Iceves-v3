import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  Settings2, 
  Search, 
  Phone, 
  Mail, 
  CreditCard, 
  Bell, 
  ShieldCheck, 
  MessageSquare,
  Check,
  ChevronRight,
  Plus
} from 'lucide-react';
import { Student, Guardian, PayerOption, RecipientOption } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface StudentsAndGuardiansProps {
  students: Student[];
  guardians: Guardian[];
  onStudentUpdated: (student: Student) => void;
}

export function StudentsAndGuardians({ 
  students, 
  guardians, 
  onStudentUpdated 
}: StudentsAndGuardiansProps) {
  const { isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'students' | 'guardians'>('students');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Settings modal for Student
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [payerRule, setPayerRule] = useState<PayerOption>('BOTH');
  const [reportRule, setReportRule] = useState<RecipientOption>('BOTH');
  const [reminderRule, setReminderRule] = useState<RecipientOption>('BOTH');
  const [confirmationRule, setConfirmationRule] = useState<RecipientOption>('BOTH');
  const [selectedChannels, setSelectedChannels] = useState<('WHATSAPP' | 'EMAIL')[]>(['WHATSAPP', 'EMAIL']);
  const [studentNotes, setStudentNotes] = useState('');
  const [tuitionAmount, setTuitionAmount] = useState<number>(0);
  const [isTuitionExempt, setIsTuitionExempt] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Filter students
  const filteredStudents = students.filter(s => {
    const q = searchTerm.toLowerCase();
    return !q || (
      s.name.toLowerCase().includes(q) ||
      s.registrationNumber.toLowerCase().includes(q) ||
      s.classGroup.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  // Filter guardians
  const filteredGuardians = guardians.filter(g => {
    const q = searchTerm.toLowerCase();
    return !q || (
      g.name.toLowerCase().includes(q) ||
      g.cpf.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q) ||
      g.phone.includes(q)
    );
  });

  const openSettingsModal = (student: Student) => {
    setEditingStudent(student);
    setPayerRule(student.payerRule);
    setReportRule(student.reportRecipientRule);
    setReminderRule(student.dueReminderRecipientRule);
    setConfirmationRule(student.paymentConfirmationRecipientRule);
    setSelectedChannels([...student.allowedChannels]);
    setStudentNotes(student.notes || '');
    const currentTuition = student.defaultTuition !== undefined ? student.defaultTuition : 0;
    setTuitionAmount(currentTuition);
    setIsTuitionExempt(currentTuition === 0);
    setSaveSuccess(false);
  };

  const handleSaveStudentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setIsSaving(true);
    try {
      const finalTuition = isTuitionExempt ? 0 : Math.max(0, Number(tuitionAmount) || 0);
      const updated = await api.updateStudent(editingStudent.id, {
        payerRule,
        reportRecipientRule: reportRule,
        dueReminderRecipientRule: reminderRule,
        paymentConfirmationRecipientRule: confirmationRule,
        allowedChannels: selectedChannels,
        defaultTuition: finalTuition,
        notes: studentNotes
      });
      onStudentUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => {
        setEditingStudent(null);
        setSaveSuccess(false);
      }, 900);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleChannel = (channel: 'WHATSAPP' | 'EMAIL') => {
    setSelectedChannels(prev => {
      if (prev.includes(channel)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter(c => c !== channel);
      }
      return [...prev, channel];
    });
  };

  return (
    <div className="space-y-5">
      
      {/* Top Banner */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#8B7CFF]" />
            <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
              Alunos, Responsáveis & Regras Individuais
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Cadastros independentes com vínculos autorizados e regras individuais de cobrança.
          </p>
        </div>

        <div className="flex bg-[#151515] p-1 rounded-xl border border-[#282828] text-xs">
          <button
            onClick={() => setActiveTab('students')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              activeTab === 'students' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
            }`}
          >
            Alunos ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('guardians')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              activeTab === 'guardians' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
            }`}
          >
            Responsáveis ({guardians.length})
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={activeTab === 'students' ? "Buscar por aluno, matrícula ou turma..." : "Buscar por responsável, CPF ou telefone..."}
          className="w-full pl-9 pr-4 py-2 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-[#8B7CFF]"
        />
      </div>

      {activeTab === 'students' ? (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Aluno</th>
                  <th className="py-3 px-4">Matrícula / Turma</th>
                  <th className="py-3 px-4">Consumo Atual (Mês)</th>
                  <th className="py-3 px-4">Mensalidade Base</th>
                  <th className="py-3 px-4">Quem Paga as Faturas</th>
                  <th className="py-3 px-4">Destinatário Relatórios</th>
                  <th className="py-3 px-4">Responsáveis Vinculados</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredStudents.map(student => {
                  const linkedGuardians = student.guardians
                    .map(link => {
                      const g = guardians.find(grd => grd.id === link.guardianId);
                      return g ? `${g.name} (${link.relationship})` : null;
                    })
                    .filter(Boolean);

                  return (
                    <tr key={student.id} className="hover:bg-[#202020] transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <img 
                            src={student.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                            alt={student.name}
                            className="w-8 h-8 rounded-full object-cover border border-[#303030]" 
                          />
                          <div>
                            <span className="font-bold text-[#F5F5F5] block">{student.name}</span>
                            <span className="text-[10px] text-[#71717A]">{student.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-[#D4D4D8] block">{student.registrationNumber}</span>
                        <span className="text-[11px] text-[#A1A1AA]">{student.classGroup}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-extrabold text-[#8B7CFF] block">
                          {formatCurrency(student.currentConsumptionBalance)}
                        </span>
                        <span className="text-[10px] text-[#71717A]">Em aberto no PDV</span>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-[#F5F5F5]">
                        {student.defaultTuition === 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md text-[10px]">
                            Isento (R$ 0,00)
                          </span>
                        ) : (
                          formatCurrency(student.defaultTuition)
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          student.payerRule === 'BOTH' ? 'bg-[#8B7CFF]/10 text-[#8B7CFF] border border-[#8B7CFF]/20' :
                          student.payerRule === 'STUDENT' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}>
                          {student.payerRule === 'BOTH' ? 'Aluno & Responsável' :
                           student.payerRule === 'STUDENT' ? 'Somente Aluno' : 'Somente Responsável'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[#A1A1AA]">
                        {student.reportRecipientRule === 'BOTH' ? 'Aluno e Responsável' :
                         student.reportRecipientRule === 'STUDENT' ? 'Somente Aluno' : 'Somente Responsável'}
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        {linkedGuardians.length > 0 ? (
                          <div className="space-y-0.5">
                            {linkedGuardians.map((lg, i) => (
                              <span key={i} className="block text-[#D4D4D8] truncate text-[11px]">
                                • {lg}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-400 text-[11px]">Nenhum vinculado</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isAdmin && (
                          <button
                            onClick={() => openSettingsModal(student)}
                            className="p-1.5 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-[#A1A1AA] hover:text-[#8B7CFF] border border-[#303030] transition cursor-pointer"
                            title="Configurar regras individuais"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Guardians Tab */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Responsável Financeiro</th>
                  <th className="py-3 px-4">CPF</th>
                  <th className="py-3 px-4">Contato (E-mail & WhatsApp)</th>
                  <th className="py-3 px-4">Alunos Vinculados Autorizados</th>
                  <th className="py-3 px-4">Acesso ao Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredGuardians.map(guardian => {
                  const authorizedStudents = students.filter(s => guardian.studentIds.includes(s.id));

                  return (
                    <tr key={guardian.id} className="hover:bg-[#202020] transition">
                      <td className="py-3 px-4 font-bold text-[#F5F5F5]">
                        {guardian.name}
                        <span className="block text-[10px] text-[#71717A] font-normal">
                          Relação: {guardian.relationshipDefault}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-[#A1A1AA]">
                        {guardian.cpf}
                      </td>

                      <td className="py-3 px-4 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[#A1A1AA]">
                          <Mail className="w-3 h-3 text-[#71717A]" />
                          <span>{guardian.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                          <Phone className="w-3 h-3 text-emerald-500" />
                          <span>{guardian.phone}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {authorizedStudents.map(st => (
                            <span key={st.id} className="inline-block bg-[#222222] text-[#F5F5F5] border border-[#333333] text-[11px] font-bold px-2 py-0.5 rounded-md">
                              {st.name} ({st.registrationNumber})
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[10px]">
                          <ShieldCheck className="w-3 h-3" />
                          Portal Autorizado
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Individual Rules Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-lg w-full p-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <div>
                <h3 className="font-extrabold text-[#F5F5F5] text-base">
                  Regras Individuais de Cobrança e Notificação
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  Aluno: <strong className="text-white">{editingStudent.name}</strong> ({editingStudent.registrationNumber})
                </p>
              </div>
              <button 
                onClick={() => setEditingStudent(null)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {saveSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Configurações salvas e aplicadas com sucesso!</span>
              </div>
            )}

            <form onSubmit={handleSaveStudentSettings} className="space-y-4 text-xs">
              
              {/* Quem pode pagar */}
              <div className="bg-[#151515] p-3 rounded-xl border border-[#282828] space-y-2">
                <label className="block font-bold text-[#F5F5F5]">
                  1. Quem pode pagar as faturas deste aluno?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayerRule('BOTH')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      payerRule === 'BOTH' ? 'bg-[#282828] text-white border-[#8B7CFF]' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Aluno e Resp.
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerRule('STUDENT')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      payerRule === 'STUDENT' ? 'bg-[#282828] text-white border-[#8B7CFF]' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Apenas Aluno
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerRule('GUARDIAN')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      payerRule === 'GUARDIAN' ? 'bg-[#282828] text-white border-[#8B7CFF]' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Apenas Resp.
                  </button>
                </div>
              </div>

              {/* Quem recebe relatórios */}
              <div className="bg-[#151515] p-3 rounded-xl border border-[#282828] space-y-2">
                <label className="block font-bold text-[#F5F5F5]">
                  2. Quem recebe os relatórios mensais e extratos?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportRule('BOTH')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      reportRule === 'BOTH' ? 'bg-[#282828] text-white border-[#8B7CFF]' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Ambos
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportRule('STUDENT')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      reportRule === 'STUDENT' ? 'bg-[#282828] text-white border-[#8B7CFF]' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Apenas Aluno
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportRule('GUARDIAN')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      reportRule === 'GUARDIAN' ? 'bg-[#282828] text-white border-[#8B7CFF]' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Apenas Resp.
                  </button>
                </div>
              </div>

              {/* Canais de Comunicação */}
              <div className="bg-[#151515] p-3 rounded-xl border border-[#282828] space-y-2">
                <label className="block font-bold text-[#F5F5F5]">
                  3. Canais de Comunicação Habilitados
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-[#D4D4D8]">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes('WHATSAPP')}
                      onChange={() => toggleChannel('WHATSAPP')}
                      className="w-4 h-4 rounded bg-[#181818] border-[#333333]"
                    />
                    <span>WhatsApp</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[#D4D4D8]">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes('EMAIL')}
                      onChange={() => toggleChannel('EMAIL')}
                      className="w-4 h-4 rounded bg-[#181818] border-[#333333]"
                    />
                    <span>E-mail</span>
                  </label>
                </div>
              </div>

              {/* 4. Mensalidade Escolar Fixa & Isenção */}
              <div className="bg-[#151515] p-3.5 rounded-xl border border-[#282828] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-bold text-[#F5F5F5]">
                      4. Mensalidade Escolar deste Aluno
                    </label>
                    <span className="text-[11px] text-[#A1A1AA] block">
                      Defina o valor base cobrado na fatura mensal ou marque isenção total.
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isTuitionExempt || tuitionAmount === 0 
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {isTuitionExempt || tuitionAmount === 0 ? 'Isento (R$ 0,00)' : formatCurrency(tuitionAmount)}
                  </span>
                </div>

                <div className="space-y-2 pt-1 border-t border-[#242424]">
                  <div className="flex items-center gap-2.5">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!isTuitionExempt}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setIsTuitionExempt(!enabled);
                          if (enabled && tuitionAmount === 0) {
                            setTuitionAmount(750);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#282828] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                    <span className="text-xs text-[#D4D4D8] font-medium">
                      {isTuitionExempt ? 'Cobrar Apenas Consumo da Lojinha (Mensalidade R$ 0,00)' : 'Cobrar Mensalidade Escolar'}
                    </span>
                  </div>

                  {!isTuitionExempt && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 font-mono font-bold">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={tuitionAmount}
                          onChange={(e) => setTuitionAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                          placeholder="0.00"
                          className="flex-1 p-2 bg-[#1A1A1A] border border-[#303030] focus:border-[#8B7CFF] rounded-lg text-white font-mono font-bold text-xs outline-none"
                        />
                      </div>

                      {/* Presets rápidos */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => { setIsTuitionExempt(true); setTuitionAmount(0); }}
                          className="px-2 py-1 bg-[#222222] hover:bg-[#2A2A2A] text-amber-300 border border-amber-500/20 rounded-md text-[10px] font-bold cursor-pointer transition"
                        >
                          Remover / Isento (R$ 0)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsTuitionExempt(false); setTuitionAmount(375); }}
                          className="px-2 py-1 bg-[#222222] hover:bg-[#2A2A2A] text-purple-300 border border-purple-500/20 rounded-md text-[10px] font-bold cursor-pointer transition"
                        >
                          Bolsa 50% (R$ 375,00)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIsTuitionExempt(false); setTuitionAmount(750); }}
                          className="px-2 py-1 bg-[#222222] hover:bg-[#2A2A2A] text-emerald-300 border border-emerald-500/20 rounded-md text-[10px] font-bold cursor-pointer transition"
                        >
                          Padrão (R$ 750,00)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">
                  Observações de Consumo / Restrições
                </label>
                <input
                  type="text"
                  value={studentNotes}
                  onChange={(e) => setStudentNotes(e.target.value)}
                  placeholder="Ex: Limite de R$ 30,00 diário ou restrição alimentar..."
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 py-2.5 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 px-3 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-xl font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  {isSaving ? 'Salvando...' : 'Gravar Regras'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
