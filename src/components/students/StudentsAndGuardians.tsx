import React, { useState } from 'react';
import { 
  Users, 
  Settings2, 
  Search, 
  Phone, 
  Mail, 
  ShieldCheck, 
  Check,
  Plus,
  Camera,
  Calendar,
  Award,
  RotateCcw,
  Bus,
  MapPin
} from 'lucide-react';
import { Student, Guardian, PayerOption, RecipientOption, Passeio } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getInitialsAvatar, compressImageFileToDataUrl } from '../../utils/avatar';

interface StudentsAndGuardiansProps {
  students: Student[];
  guardians: Guardian[];
  passeios?: Passeio[];
  onStudentUpdated: (student: Student) => void;
}

export function StudentsAndGuardians({ 
  students, 
  guardians, 
  passeios = [],
  onStudentUpdated 
}: StudentsAndGuardiansProps) {
  const { isAdmin } = useAuth();
  const activePasseios = passeios.filter(p => p.ativo);

  const [activeTab, setActiveTab] = useState<'students' | 'guardians'>('students');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Settings & Profile modal for Student
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [payerRule, setPayerRule] = useState<PayerOption>('BOTH');
  const [reportRule, setReportRule] = useState<RecipientOption>('BOTH');
  const [reminderRule, setReminderRule] = useState<RecipientOption>('BOTH');
  const [confirmationRule, setConfirmationRule] = useState<RecipientOption>('BOTH');
  const [selectedChannels, setSelectedChannels] = useState<('WHATSAPP' | 'EMAIL')[]>(['WHATSAPP', 'EMAIL']);
  const [studentNotes, setStudentNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New Student modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAvatar, setNewAvatar] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Quick row photo upload state
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);

  // Filter students
  const filteredStudents = students.filter(s => {
    const q = searchTerm.toLowerCase();
    return !q || (
      s.name.toLowerCase().includes(q) ||
      s.registrationNumber.toLowerCase().includes(q) ||
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
    setEditName(student.name);
    setEditEmail(student.email);
    setEditPhone(student.phone);
    setEditAvatar(student.avatar || getInitialsAvatar(student.name));
    setPayerRule(student.payerRule);
    setReportRule(student.reportRecipientRule);
    setReminderRule(student.dueReminderRecipientRule);
    setConfirmationRule(student.paymentConfirmationRecipientRule);
    setSelectedChannels([...student.allowedChannels]);
    setStudentNotes(student.notes || '');
    setSaveSuccess(false);
  };

  const handleQuickPhotoUpload = async (student: Student, file?: File) => {
    if (!file) return;
    setUploadingRowId(student.id);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 320);
      const updated = await api.updateStudent(student.id, { avatar: dataUrl });
      onStudentUpdated(updated);
    } catch (err: any) {
      alert(`Erro ao enviar foto: ${err.message}`);
    } finally {
      setUploadingRowId(null);
    }
  };

  const handleModalPhotoFile = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 320);
      setEditAvatar(dataUrl);
    } catch (err: any) {
      alert(`Erro ao processar imagem: ${err.message}`);
    }
  };

  const handleNewModalPhotoFile = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 320);
      setNewAvatar(dataUrl);
    } catch (err: any) {
      alert(`Erro ao processar imagem: ${err.message}`);
    }
  };

  const handleSaveStudentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setIsSaving(true);
    try {
      const updated = await api.updateStudent(editingStudent.id, {
        name: editName.trim() || editingStudent.name,
        email: editEmail.trim() || editingStudent.email,
        phone: editPhone.trim() || editingStudent.phone,
        avatar: editAvatar || getInitialsAvatar(editName || editingStudent.name),
        payerRule,
        reportRecipientRule: reportRule,
        dueReminderRecipientRule: reminderRule,
        paymentConfirmationRecipientRule: confirmationRule,
        allowedChannels: selectedChannels,
        defaultTuition: 0,
        notes: studentNotes
      });
      onStudentUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => {
        setEditingStudent(null);
        setSaveSuccess(false);
      }, 800);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const created = await api.createStudent({
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        avatar: newAvatar || getInitialsAvatar(newName.trim()),
      });
      onStudentUpdated(created);
      setShowNewModal(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewAvatar('');
    } catch (err: any) {
      alert(`Erro ao cadastrar aluno: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const toggleChannel = (channel: 'WHATSAPP' | 'EMAIL') => {
    setSelectedChannels(prev => {
      if (prev.includes(channel)) {
        if (prev.length === 1) return prev;
        return prev.filter(c => c !== channel);
      }
      return [...prev, channel];
    });
  };

  return (
    <div className="space-y-5">
      
      {/* Top Banner — Escola de Cristo no ICEVES (10ª Turma) */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Users className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
                Alunos — Escola de Cristo no ICEVES
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                10ª Turma Atual ({students.length} Alunos)
              </span>
            </div>
            <p className="text-xs text-[#A1A1AA] mt-1">
              Na Escola de Cristo no ICEVES opera-se 1 turma por vez (1 turma por semestre). No momento encontra-se na <strong>10ª Turma</strong>, com formatura do <strong>dia 27 ao dia 30</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Aluno</span>
              </button>
            )}

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
        </div>

        {/* Destaques da 10ª Turma */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#262626] text-xs">
          <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Edição Vigente</span>
              <span className="text-[#F5F5F5] font-bold">10ª Turma — Escola de Cristo</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Formato no ICEVES</span>
              <span className="text-[#F5F5F5] font-bold">1 turma por vez • 1 por semestre</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Calendário de Formatura</span>
              <span className="text-emerald-400 font-bold">Início dia 27 • Término dia 30</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={activeTab === 'students' ? "Buscar aluno por nome ou código (ex: EC10-001)..." : "Buscar por responsável, CPF ou telefone..."}
          className="w-full pl-9 pr-4 py-2 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-emerald-500"
        />
      </div>

      {activeTab === 'students' ? (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Aluno & Foto de Perfil</th>
                  <th className="py-3 px-4">Código Matrícula</th>
                  <th className="py-3 px-4">Consumo Aberto (Lojinha)</th>
                  <th className="py-3 px-4">Contato</th>
                  <th className="py-3 px-4">Quem Paga</th>
                  <th className="py-3 px-4 text-right">Foto / Configurar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredStudents.map(student => {
                  const avatarSrc = student.avatar || getInitialsAvatar(student.name);
                  const isRowUploading = uploadingRowId === student.id;

                  return (
                    <tr key={student.id} className="hover:bg-[#202020] transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <label
                            className="relative group cursor-pointer shrink-0"
                            title="Clique na foto para enviar nova foto de perfil"
                          >
                            <img 
                              src={avatarSrc} 
                              alt={student.name}
                              className="w-10 h-10 rounded-full object-cover border border-[#383838] group-hover:border-emerald-500 transition" 
                            />
                            {isAdmin && (
                              <>
                                <span className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                  <Camera className="w-3.5 h-3.5 text-white" />
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={isRowUploading}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleQuickPhotoUpload(student, file);
                                    e.target.value = '';
                                  }}
                                />
                              </>
                            )}
                          </label>
                          <div>
                            <span className="font-bold text-[#F5F5F5] block text-xs">{student.name}</span>
                            <span className="text-[10px] text-[#71717A]">{student.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-[#D4D4D8] bg-[#151515] border border-[#2C2C2C] px-2 py-0.5 rounded-md">
                          {student.registrationNumber}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-extrabold text-emerald-400 block">
                          {formatCurrency(student.currentConsumptionBalance)}
                        </span>
                        <span className="text-[10px] text-[#71717A]">Em aberto no PDV</span>
                      </td>

                      <td className="py-3 px-4 text-[#A1A1AA]">
                        <span className="block text-[11px]">{student.phone}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          student.payerRule === 'BOTH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          student.payerRule === 'STUDENT' || student.payerRule === 'STUDENT_ONLY' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {student.payerRule === 'BOTH' ? 'Aluno & Resp.' :
                           student.payerRule === 'STUDENT' || student.payerRule === 'STUDENT_ONLY' ? 'Próprio Aluno' : 'Responsável'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isAdmin && (
                          <div className="inline-flex items-center gap-1.5">
                            <label
                              className="px-2.5 py-1.5 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-[#D4D4D8] hover:text-white border border-[#303030] transition cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold"
                              title="Enviar foto de perfil"
                            >
                              <Camera className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{isRowUploading ? '...' : 'Foto'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={isRowUploading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleQuickPhotoUpload(student, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              onClick={() => openSettingsModal(student)}
                              className="p-1.5 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-[#A1A1AA] hover:text-emerald-400 border border-[#303030] transition cursor-pointer"
                              title="Editar foto, dados e regras do aluno"
                            >
                              <Settings2 className="w-4 h-4" />
                            </button>
                          </div>
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
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-4">CPF</th>
                  <th className="py-3 px-4">Contato (E-mail & WhatsApp)</th>
                  <th className="py-3 px-4">Alunos Vinculados</th>
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
                        <span className="inline-block bg-[#222222] text-[#F5F5F5] border border-[#333333] text-[11px] font-bold px-2.5 py-1 rounded-md">
                          {authorizedStudents.length} alunos vinculados (10ª Turma)
                        </span>
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

      {/* Individual Student Profile & Photo Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-lg w-full p-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <div>
                <h3 className="font-extrabold text-[#F5F5F5] text-base">
                  Perfil, Foto e Configurações do Aluno
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  Código: <strong className="font-mono text-white">{editingStudent.registrationNumber}</strong> • 10ª Turma Escola de Cristo
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
                <span>Foto e configurações salvas com sucesso!</span>
              </div>
            )}

            <form onSubmit={handleSaveStudentSettings} className="space-y-4 text-xs">
              
              {/* Foto de Perfil do Aluno */}
              <div className="bg-[#151515] p-4 rounded-xl border border-[#282828] space-y-3">
                <label className="block font-bold text-[#F5F5F5]">
                  Foto de Perfil do Aluno
                </label>
                <div className="flex items-center gap-4">
                  <img
                    src={editAvatar || getInitialsAvatar(editName || editingStudent.name)}
                    alt={editName}
                    className="w-16 h-16 rounded-full object-cover border-2 border-emerald-500/50 shrink-0"
                  />
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <label className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-lg font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Enviar Foto do Dispositivo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleModalPhotoFile(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditAvatar(getInitialsAvatar(editName || editingStudent.name))}
                        className="px-2.5 py-1.5 bg-[#222222] hover:bg-[#2C2C2C] text-zinc-300 rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Iniciais</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editAvatar.startsWith('data:') ? '' : editAvatar}
                      onChange={(e) => setEditAvatar(e.target.value)}
                      placeholder="Ou cole aqui o link (URL) de uma foto..."
                      className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-[11px] text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Dados Cadastrais */}
              <div className="bg-[#151515] p-3.5 rounded-xl border border-[#282828] space-y-3">
                <label className="block font-bold text-[#F5F5F5]">
                  Dados do Aluno (10ª Turma)
                </label>
                <div>
                  <label className="block text-[11px] text-[#A1A1AA] mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white font-semibold focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[#A1A1AA] mb-1">E-mail</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A1A1AA] mb-1">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Seção Passeios na Área Individual do Aluno */}
              <div className="bg-[#151515] p-3.5 rounded-xl border border-[#282828] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#F5F5F5] flex items-center gap-1.5">
                    <Bus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Passeios ({activePasseios.length})</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    Disponibilizados automaticamente
                  </span>
                </div>
                {activePasseios.length === 0 ? (
                  <p className="text-[11px] text-[#71717A]">
                    Nenhum passeio ativo cadastrado no momento.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {activePasseios.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-lg bg-[#101010] border border-[#262626] flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-[#F5F5F5] text-xs flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                            {p.nome}
                          </span>
                          {p.descricao && (
                            <span className="text-[10px] text-[#A1A1AA] block">
                              {p.descricao}
                            </span>
                          )}
                          {p.dataPasseio && (
                            <span className="text-[10px] text-[#71717A] font-mono block">
                              Data: {formatDate(p.dataPasseio)}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded shrink-0">
                          {formatCurrency(p.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quem pode pagar */}
              <div className="bg-[#151515] p-3 rounded-xl border border-[#282828] space-y-2">
                <label className="block font-bold text-[#F5F5F5]">
                  Quem realiza os pagamentos do consumo na Lojinha?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayerRule('BOTH')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      payerRule === 'BOTH' ? 'bg-[#282828] text-white border-emerald-500' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Aluno e Resp.
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerRule('STUDENT')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      payerRule === 'STUDENT' ? 'bg-[#282828] text-white border-emerald-500' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Apenas Aluno
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerRule('GUARDIAN')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      payerRule === 'GUARDIAN' ? 'bg-[#282828] text-white border-emerald-500' : 'bg-[#181818] text-[#71717A] border-[#262626]'
                    }`}
                  >
                    Apenas Resp.
                  </button>
                </div>
              </div>

              {/* Canais de Comunicação */}
              <div className="bg-[#151515] p-3 rounded-xl border border-[#282828] space-y-2">
                <label className="block font-bold text-[#F5F5F5]">
                  Canais de Comunicação Habilitados
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

              {/* Observações */}
              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">
                  Observações de Consumo / Restrições
                </label>
                <input
                  type="text"
                  value={studentNotes}
                  onChange={(e) => setStudentNotes(e.target.value)}
                  placeholder="Ex: Observação sobre consumo na Lojinha Iceves..."
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
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
                  {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* New Student Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <div>
                <h3 className="font-extrabold text-[#F5F5F5] text-base">
                  Adicionar Aluno à 10ª Turma
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  Escola de Cristo - ICEVES (Formatura 27 a 30)
                </p>
              </div>
              <button 
                onClick={() => setShowNewModal(false)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="space-y-4 text-xs">
              <div className="flex items-center gap-3 bg-[#151515] p-3 rounded-xl border border-[#282828]">
                <img
                  src={newAvatar || getInitialsAvatar(newName || 'Novo Aluno')}
                  alt="Preview"
                  className="w-14 h-14 rounded-full object-cover border border-[#383838]"
                />
                <div>
                  <label className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-lg font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition">
                    <Camera className="w-3.5 h-3.5" />
                    <span>Escolher Foto de Perfil</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleNewModalPhotoFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <span className="block text-[10px] text-[#71717A] mt-1">
                    Opcional — gera avatar com iniciais automaticamente.
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#F5F5F5] mb-1">Nome Completo do Aluno</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Nome Completo"
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#F5F5F5] mb-1">E-mail</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="aluno@gmail.com"
                    className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#F5F5F5] mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="(11) 99100-0000"
                    className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 py-2.5 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  {isCreating ? 'Cadastrando...' : 'Cadastrar Aluno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
