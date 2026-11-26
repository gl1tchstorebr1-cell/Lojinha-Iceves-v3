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
  MapPin,
  AlertTriangle,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Wallet,
  Lock
} from 'lucide-react';
import { Student, Guardian, PayerOption, RecipientOption, Passeio, StudentGuardianLink } from '../../types';
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
  const { isAdmin, canManage } = useAuth();
  const canEditStudents = isAdmin || canManage;
  const activePasseios = passeios.filter(p => p.ativo);

  const [activeTab, setActiveTab] = useState<'students' | 'guardians'>('students');
  const [searchTerm, setSearchTerm] = useState('');
  const [showStageReport, setShowStageReport] = useState(true);
  
  // Settings & Profile modal for Student
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editConsumptionLimit, setEditConsumptionLimit] = useState<string>('');
  const [editConsumptionBlocked, setEditConsumptionBlocked] = useState(false);
  const [editConsumptionBlockedReason, setEditConsumptionBlockedReason] = useState('');
  // Pais e Responsáveis fields in Student modal
  const [editGuardianId, setEditGuardianId] = useState('');
  const [editGuardianName, setEditGuardianName] = useState('');
  const [editGuardianPhone, setEditGuardianPhone] = useState('');
  const [editGuardianRelationship, setEditGuardianRelationship] = useState('Responsável');
  const [payerRule, setPayerRule] = useState<PayerOption>('BOTH');
  const [reportRule, setReportRule] = useState<RecipientOption>('BOTH');
  const [reminderRule, setReminderRule] = useState<RecipientOption>('BOTH');
  const [confirmationRule, setConfirmationRule] = useState<RecipientOption>('BOTH');
  const [selectedChannels, setSelectedChannels] = useState<('WHATSAPP' | 'EMAIL')[]>(['WHATSAPP', 'EMAIL']);
  const [studentNotes, setStudentNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Balance adjustment (Crédito / Débito em Conta) modal
  const [balanceModalStudent, setBalanceModalStudent] = useState<Student | null>(null);
  const [balanceOp, setBalanceOp] = useState<'CREDITO' | 'DEBITO'>('CREDITO');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [isAdjustingBalance, setIsAdjustingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // New Student modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAvatar, setNewAvatar] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Quick row photo upload state
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);

  // Resolve linked guardians for a student (combining student.guardians & guardians collection)
  const getResolvedGuardiansForStudent = (student: Student) => {
    const resolved: Array<{
      guardianId: string;
      name: string;
      phone: string;
      relationship: string;
      needsPhoneReview?: boolean;
      phoneReviewNote?: string;
      matchNote?: string;
    }> = [];

    if (Array.isArray(student.guardians) && student.guardians.length > 0) {
      for (const link of student.guardians) {
        const gRecord = guardians.find(g => g.id === link.guardianId);
        // Ignore legacy generic default guardian if it has > 1 student linked and no explicit guardianName
        if (link.guardianId === 'guardian-1' && !link.guardianName && gRecord && gRecord.studentIds.length > 2) {
          continue;
        }
        const name = link.guardianName || gRecord?.name || '';
        const phone = link.guardianPhone || gRecord?.phone || '';
        if (name) {
          resolved.push({
            guardianId: link.guardianId,
            name,
            phone,
            relationship: link.relationship || gRecord?.relationshipDefault || 'Responsável',
            needsPhoneReview: link.needsPhoneReview ?? gRecord?.needsPhoneReview,
            phoneReviewNote: link.phoneReviewNote ?? gRecord?.phoneReviewNote,
            matchNote: link.matchNote,
          });
        }
      }
    }

    // Also check guardians collection for any direct exclusive link not yet in resolved
    for (const g of guardians) {
      if (g.id === 'guardian-1' && g.studentIds.length > 2) continue;
      if (g.studentIds.includes(student.id) && !resolved.some(r => r.guardianId === g.id || r.name.toLowerCase() === g.name.toLowerCase())) {
        resolved.push({
          guardianId: g.id,
          name: g.name,
          phone: g.phone,
          relationship: g.relationshipDefault || 'Responsável',
          needsPhoneReview: g.needsPhoneReview,
          phoneReviewNote: g.phoneReviewNote,
        });
      }
    }

    return resolved;
  };

  // Filter students (matches student name, registrationNumber, email, cpf, phone, OR guardian name/phone)
  const filteredStudents = students.filter(s => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const studentGuardians = getResolvedGuardiansForStudent(s);
    const guardianMatch = studentGuardians.some(
      g => g.name.toLowerCase().includes(q) || g.phone.toLowerCase().includes(q)
    );
    return (
      s.name.toLowerCase().includes(q) ||
      s.registrationNumber.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      (s.cpf && s.cpf.toLowerCase().includes(q)) ||
      guardianMatch
    );
  });

  // Filter guardians (matches guardian name, cpf, email, phone, OR linked student name)
  const filteredGuardians = guardians.filter(g => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const linkedStudentNames = students
      .filter(s => g.studentIds.includes(s.id))
      .map(s => s.name.toLowerCase());
    return (
      g.name.toLowerCase().includes(q) ||
      g.cpf.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q) ||
      g.phone.toLowerCase().includes(q) ||
      linkedStudentNames.some(name => name.includes(q))
    );
  });

  const openSettingsModal = (student: Student) => {
    const resolved = getResolvedGuardiansForStudent(student);
    const primaryGuardian = resolved[0];
    setEditingStudent(student);
    setEditName(student.name);
    setEditEmail(student.email);
    setEditPhone(student.phone);
    setEditCpf(student.cpf || '');
    setEditAvatar(student.avatar || getInitialsAvatar(student.name));
    setEditConsumptionLimit(
      typeof student.consumptionLimit === 'number' && student.consumptionLimit > 0
        ? String(student.consumptionLimit)
        : ''
    );
    setEditConsumptionBlocked(Boolean(student.consumptionBlocked));
    setEditConsumptionBlockedReason(student.consumptionBlockedReason || '');
    setEditGuardianId(primaryGuardian?.guardianId || `guardian-st-${student.id}`);
    setEditGuardianName(primaryGuardian?.name || '');
    setEditGuardianPhone(primaryGuardian?.phone || '');
    setEditGuardianRelationship(primaryGuardian?.relationship || 'Responsável');
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
      const existingGuardians = editingStudent.guardians || [];
      const existingPrimary = existingGuardians[0];
      let updatedGuardiansPayload: StudentGuardianLink[] | undefined = undefined;

      if (editGuardianName.trim()) {
        const trimmedPhone = editGuardianPhone.trim();
        const isIntlOrUnusualPhone =
          trimmedPhone === '58 416-2028274' ||
          trimmedPhone === '54 9 2645 45-6122' ||
          (trimmedPhone.length > 0 && !/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(trimmedPhone));
        updatedGuardiansPayload = [
          {
            guardianId: editGuardianId || existingPrimary?.guardianId || `guardian-st-${editingStudent.id}`,
            guardianName: editGuardianName.trim(),
            guardianPhone: trimmedPhone,
            relationship: editGuardianRelationship.trim() || 'Responsável',
            isPrimaryPayer: true,
            canAccessPortal: true,
            needsPhoneReview: isIntlOrUnusualPhone,
            phoneReviewNote: isIntlOrUnusualPhone
              ? 'Formato de telefone fora do padrão nacional — mantido sem modificação automática e sinalizado para conferência.'
              : undefined,
            matchNote: existingPrimary?.matchNote,
          }
        ];
      } else {
        updatedGuardiansPayload = [];
      }

      const parsedLimit = editConsumptionLimit.trim()
        ? Math.max(0, Number(editConsumptionLimit))
        : null;

      const updated = await api.updateStudent(editingStudent.id, {
        name: editName.trim() || editingStudent.name,
        email: editEmail.trim() || editingStudent.email,
        phone: editPhone.trim() || editingStudent.phone,
        cpf: editCpf.trim() || undefined,
        avatar: editAvatar || getInitialsAvatar(editName || editingStudent.name),
        guardians: updatedGuardiansPayload,
        payerRule,
        reportRecipientRule: reportRule,
        dueReminderRecipientRule: reminderRule,
        paymentConfirmationRecipientRule: confirmationRule,
        allowedChannels: selectedChannels,
        defaultTuition: 0,
        consumptionLimit: parsedLimit,
        consumptionBlocked: editConsumptionBlocked,
        consumptionBlockedReason: editConsumptionBlocked ? editConsumptionBlockedReason.trim() || undefined : undefined,
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

  const handleAdjustBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceModalStudent) return;
    const numericAmt = Number(balanceAmount);
    if (!Number.isFinite(numericAmt) || numericAmt <= 0) {
      setBalanceError('Informe um valor válido maior que R$ 0,00.');
      return;
    }
    if (!balanceReason.trim()) {
      setBalanceError('Informe o motivo do lançamento para auditoria.');
      return;
    }
    setIsAdjustingBalance(true);
    setBalanceError(null);
    try {
      const updated = await api.adjustStudentBalance(balanceModalStudent.id, {
        operation: balanceOp,
        amount: numericAmt,
        reason: balanceReason.trim(),
      });
      onStudentUpdated(updated);
      setBalanceModalStudent(null);
      setBalanceAmount('');
      setBalanceReason('');
    } catch (err: any) {
      setBalanceError(err.message || 'Erro ao ajustar conta do aluno.');
    } finally {
      setIsAdjustingBalance(false);
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

  // Count how many students currently have a linked guardian
  const linkedStudentsCount = students.filter(s => getResolvedGuardiansForStudent(s).length > 0).length;
  const totalLinksCount = students.reduce((acc, s) => acc + getResolvedGuardiansForStudent(s).length, 0);

  return (
    <div className="space-y-5">
      
      {/* Top Banner — Escola de Cristo no ICEVES (10ª Turma) */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Users className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
                Alunos & Pais/Responsáveis — Escola de Cristo no ICEVES
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
                Pais e Responsáveis ({guardians.length})
              </button>
            </div>
          </div>
        </div>

        {/* Destaques da 10ª Turma */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#262626] text-xs">
          <div className="card-borda-conica card-borda-compact">
            <div className="conteudo p-3 bg-[#141414] border border-[#262626] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Edição Vigente</span>
                <span className="text-[#F5F5F5] font-bold">10ª Turma — Escola de Cristo</span>
              </div>
            </div>
          </div>

          <div className="card-borda-conica card-borda-compact">
            <div className="conteudo p-3 bg-[#141414] border border-[#262626] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Associação Completa (Etapas 1 & 2)</span>
                <span className="text-[#F5F5F5] font-bold">
                  {linkedStudentsCount}/{students.length} Alunos • {guardians.length} Responsáveis Únicos
                </span>
              </div>
            </div>
          </div>

          <div className="card-borda-conica card-borda-compact">
            <div className="conteudo p-3 bg-[#141414] border border-[#262626] flex items-center gap-3">
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
      </div>

      {/* Relatório Final — Associação Completa de Alunos e Responsáveis (8 Meninas + 9 Meninos) */}
      <div className="bg-[#1B1B1B] rounded-2xl border border-emerald-500/25 overflow-hidden">
        <div
          onClick={() => setShowStageReport(prev => !prev)}
          className="p-4 bg-[#161F1B] flex items-center justify-between gap-3 cursor-pointer hover:bg-[#192520] transition"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Operação Concluída (17/17)
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-[#F5F5F5]">
              Relatório de Associação Completa — 17 Estudantes (8 Alunas e 9 Meninos) • 16 Responsáveis Únicos • 17 Vínculos
            </h3>
          </div>
          <button
            type="button"
            className="text-xs text-emerald-400 font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span>{showStageReport ? 'Ocultar Relatório' : 'Ver Relatório Completo'}</span>
            {showStageReport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showStageReport && (
          <div className="p-4 space-y-3 text-xs border-t border-[#262626]">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] text-[#A1A1AA] uppercase font-bold block">Estudantes Localizados</span>
                <span className="text-base font-extrabold text-emerald-400">17 / 17 (8 meninas • 9 meninos)</span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] text-[#A1A1AA] uppercase font-bold block">Responsáveis Únicos no Banco</span>
                <span className="text-base font-extrabold text-[#F5F5F5]">{guardians.length} cadastros (0 duplicados)</span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] text-[#A1A1AA] uppercase font-bold block">Total de Vínculos Realizados</span>
                <span className="text-base font-extrabold text-emerald-400">{totalLinksCount} vínculos ativos</span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-emerald-500/30">
                <span className="text-[10px] text-emerald-300 uppercase font-bold block">Responsável com 2 Estudantes</span>
                <span className="text-xs font-bold text-[#F5F5F5] block mt-0.5">
                  Bill Stanley (Ana Vitória & Ialisson)
                </span>
              </div>
            </div>

            {/* Alerta de Conferência de Telefones e Grafia */}
            <div className="p-3 rounded-xl bg-amber-950/25 border border-amber-500/30 flex items-start gap-2.5 text-[11px] text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">
                  Conferência Obrigatória — Telefones Internacionais e Divergências de Grafia (mantidos sem alteração automática):
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[#D4D4D8]">
                  <li>
                    <strong>Darling Lozada</strong> (Responsável por <strong>Victoria Valentina Lopáz Lozada - EC10-017</strong>): Telefone mantido exatamente como <code className="font-mono text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded">58 416-2028274</code> (formato internacional +58 sinalizado para conferência).
                  </li>
                  <li>
                    <strong>Ceferino Oño</strong> (Responsável por <strong>Ezequiel Ismael Oño Goona - EC10-008</strong>): Telefone mantido exatamente como <code className="font-mono text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded">54 9 2645 45-6122</code> (formato internacional +54 sinalizado para conferência).
                  </li>
                  <li>
                    <strong>Bill Stanley (`66 99645-6370`)</strong>: Reutilizado em cadastro único vinculado aos <strong>2 estudantes</strong>: <strong>Ana Vitória Lisboa (`EC10-001`)</strong> e <strong>Ialisson Lisboa dos Santos (`EC10-009`)</strong>, sem criar duplicidade.
                  </li>
                  <li>
                    <strong>Divergências de grafia preservadas para conferência</strong>: <em>Maria Eduarda Colombo Serra</em> → <strong>Maria Eduarda Serra (EC10-013)</strong>; <em>Rayssa Gabriely dos Santos de Morais</em> → <strong>Rayssa Gabryele dos Santos de Morais (EC10-015)</strong>; <em>Júlia Oliveira</em> → <strong>Júlia de Oliveira Ferreira (EC10-011)</strong>; <em>Izhak Sousa Morais</em> → <strong>Izhak Souza Morais (EC10-010)</strong>; <em>Ialisson Lisboa Santos</em> → <strong>Ialisson Lisboa dos Santos (EC10-009)</strong>; <em>Ezequiel Oño</em> → <strong>Ezequiel Ismael Oño Goona (EC10-008)</strong>.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-lg min-w-[260px]">
          <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === 'students'
                ? "Buscar estudante por nome, matrícula (EC10-001) ou pelo nome do responsável..."
                : "Buscar por nome do responsável, telefone ou nome do estudante vinculado..."
            }
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-emerald-500"
          />
        </div>
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="px-3 py-2 rounded-xl bg-[#1F1F1F] hover:bg-[#282828] text-xs font-semibold text-emerald-400 border border-[#303030] cursor-pointer"
          >
            Limpar Filtro (&ldquo;{searchTerm}&rdquo;)
          </button>
        )}
      </div>

      {activeTab === 'students' ? (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Aluno & Foto de Perfil</th>
                  <th className="py-3 px-4">Código Matrícula</th>
                  <th className="py-3 px-4">Pais e Responsáveis</th>
                  <th className="py-3 px-4">Consumo Aberto (Lojinha)</th>
                  <th className="py-3 px-4">Quem Paga</th>
                  <th className="py-3 px-4 text-right">Foto / Configurar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredStudents.map(student => {
                  const avatarSrc = student.avatar || getInitialsAvatar(student.name);
                  const isRowUploading = uploadingRowId === student.id;
                  const studentGuardians = getResolvedGuardiansForStudent(student);

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
                              loading="lazy"
                              decoding="async"
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

                      {/* Seção Pais e Responsáveis na Linha do Estudante */}
                      <td className="py-3 px-4">
                        {studentGuardians.length > 0 ? (
                          <div className="space-y-1.5">
                            {studentGuardians.map((g) => {
                              const fullGuardian = guardians.find(gr => gr.id === g.guardianId || gr.name.toLowerCase() === g.name.toLowerCase());
                              const totalLinkedToGuardian = fullGuardian ? fullGuardian.studentIds.length : 1;

                              return (
                                <div key={g.guardianId} className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setSearchTerm(g.name)}
                                      title="Clique para filtrar todos os estudantes vinculados a este responsável"
                                      className="font-bold text-[#F5F5F5] hover:text-emerald-400 text-xs transition cursor-pointer text-left"
                                    >
                                      {g.name}
                                    </button>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                      {g.relationship}
                                    </span>
                                    {totalLinkedToGuardian > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => setSearchTerm(g.name)}
                                        className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 cursor-pointer"
                                        title="Clique para visualizar os estudantes vinculados a este mesmo responsável"
                                      >
                                        {totalLinkedToGuardian} alunos vinculados
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#A1A1AA]">
                                    <span className="inline-flex items-center gap-1 font-mono text-emerald-400">
                                      <Phone className="w-3 h-3" />
                                      {g.phone}
                                    </span>
                                    {g.needsPhoneReview && (
                                      <span
                                        title={g.phoneReviewNote || 'Telefone sinalizado para conferência'}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                      >
                                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                                        Conferir Telefone
                                      </span>
                                    )}
                                  </div>
                                  {g.matchNote && (
                                    <span className="block text-[10px] text-[#71717A]">
                                      {g.matchNote}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-[#151515] text-[#71717A] border border-[#282828]">
                            Sem responsável vinculado
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-extrabold text-emerald-400 block">
                          {formatCurrency(student.currentConsumptionBalance)}
                        </span>
                        {Number(student.creditBalance || 0) > 0 && (
                          <span className="text-[10px] text-teal-300 font-mono block">
                            Crédito: {formatCurrency(student.creditBalance || 0)}
                          </span>
                        )}
                        {typeof student.consumptionLimit === 'number' && student.consumptionLimit > 0 && (
                          <span className="text-[10px] text-amber-300 font-mono block">
                            Limite: {formatCurrency(student.consumptionLimit)}
                          </span>
                        )}
                        {student.consumptionBlocked && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400">
                            <Lock className="w-2.5 h-2.5" /> Bloqueado
                          </span>
                        )}
                        {!student.consumptionBlocked && !(student.creditBalance && student.creditBalance > 0) && !(student.consumptionLimit && student.consumptionLimit > 0) && (
                          <span className="text-[10px] text-[#71717A]">Em aberto no PDV</span>
                        )}
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
                        {canEditStudents && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setBalanceModalStudent(student);
                                setBalanceOp('CREDITO');
                                setBalanceAmount('');
                                setBalanceReason('');
                                setBalanceError(null);
                              }}
                              className="px-2 py-1.5 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-teal-300 border border-[#303030] transition cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold"
                              title="Registrar Crédito ou Débito manual na conta"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span>Saldo</span>
                            </button>
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
                              title="Abrir ficha individual do aluno (Pais e Responsáveis, Foto e Regras)"
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
                  <th className="py-3 px-4">Nome Completo do Responsável</th>
                  <th className="py-3 px-4">Grau de Parentesco</th>
                  <th className="py-3 px-4">Telefone / WhatsApp</th>
                  <th className="py-3 px-4">Estudantes Vinculados</th>
                  <th className="py-3 px-4">Status / Conferência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredGuardians.map(guardian => {
                  const authorizedStudents = students.filter(s => guardian.studentIds.includes(s.id));

                  return (
                    <tr key={guardian.id} className="hover:bg-[#202020] transition">
                      <td className="py-3 px-4 font-bold text-[#F5F5F5]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{guardian.name}</span>
                          {authorizedStudents.length > 1 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                              {authorizedStudents.length} alunos vinculados
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] text-[#71717A] font-normal mt-0.5">
                          ID: {guardian.id}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          {guardian.relationshipDefault || 'Responsável'}
                        </span>
                      </td>

                      <td className="py-3 px-4 space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold">
                          <Phone className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{guardian.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#71717A] text-[11px]">
                          <Mail className="w-3 h-3" />
                          <span>{guardian.email}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {authorizedStudents.map(st => (
                            <button
                              type="button"
                              key={st.id}
                              onClick={() => openSettingsModal(st)}
                              title="Clique para abrir a ficha individual deste estudante"
                              className="inline-flex items-center gap-1.5 bg-[#151515] hover:bg-[#242424] text-[#F5F5F5] border border-[#303030] hover:border-emerald-500/40 text-[11px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer"
                            >
                              <span>{st.name}</span>
                              <span className="font-mono text-[10px] text-emerald-400">({st.registrationNumber})</span>
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {guardian.needsPhoneReview ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-amber-300 font-bold bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md text-[10px]">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              Conferir Formato Telefone
                            </span>
                            {guardian.phoneReviewNote && (
                              <span className="block text-[10px] text-[#A1A1AA] max-w-xs">
                                {guardian.phoneReviewNote}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[10px]">
                            <ShieldCheck className="w-3 h-3" />
                            Vinculado & Validado
                          </span>
                        )}
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
                  Ficha Individual do Estudante
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
                <span>Cadastro do estudante e responsável salvos com sucesso!</span>
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
                    decoding="async"
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

              {/* Dados Cadastrais do Aluno */}
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                  <div>
                    <label className="block text-[11px] text-[#A1A1AA] mb-1">CPF (Opcional)</label>
                    <input
                      type="text"
                      value={editCpf}
                      onChange={(e) => setEditCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Limite de Consumo e Bloqueio */}
              <div className="bg-[#151515] p-3.5 rounded-xl border border-[#282828] space-y-2.5">
                <label className="block font-bold text-[#F5F5F5]">
                  Limite de Consumo & Bloqueio no PDV
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[#A1A1AA] mb-1">Limite de Consumo Mensal (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editConsumptionLimit}
                      onChange={(e) => setEditConsumptionLimit(e.target.value)}
                      placeholder="Sem limite"
                      className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F5]">
                      <input
                        type="checkbox"
                        checked={editConsumptionBlocked}
                        onChange={(e) => setEditConsumptionBlocked(e.target.checked)}
                        className="w-4 h-4 rounded bg-[#181818] border-[#333333] text-rose-500"
                      />
                      <span className="font-semibold text-rose-300">Bloquear consumo no balcão</span>
                    </label>
                  </div>
                </div>
                {editConsumptionBlocked && (
                  <input
                    type="text"
                    value={editConsumptionBlockedReason}
                    onChange={(e) => setEditConsumptionBlockedReason(e.target.value)}
                    placeholder="Motivo do bloqueio (ex: solicitação do responsável)..."
                    className="w-full p-2 bg-[#101010] border border-rose-500/30 rounded-lg text-white focus:border-rose-500 focus:outline-none"
                  />
                )}
              </div>

              {/* Seção: Pais e Responsáveis */}
              <div className="bg-[#151515] p-3.5 rounded-xl border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#F5F5F5] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Pais e Responsáveis</span>
                  </label>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    {editGuardianName.trim() ? 'Responsável Associado' : 'Aguardando Associação'}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] text-[#A1A1AA] mb-1">Nome Completo do Responsável</label>
                  <input
                    type="text"
                    value={editGuardianName}
                    onChange={(e) => setEditGuardianName(e.target.value)}
                    placeholder="Ex: Flaviane Maciel Rocha"
                    className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white font-semibold focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[#A1A1AA] mb-1">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      value={editGuardianPhone}
                      onChange={(e) => setEditGuardianPhone(e.target.value)}
                      placeholder="Ex: 94 99200-4759"
                      className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A1A1AA] mb-1">Grau de Parentesco</label>
                    <input
                      type="text"
                      value={editGuardianRelationship}
                      onChange={(e) => setEditGuardianRelationship(e.target.value)}
                      placeholder="Responsável"
                      className="w-full p-2 bg-[#101010] border border-[#2C2C2C] rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {(editGuardianPhone.trim() === '58 416-2028274' || editGuardianPhone.trim() === '54 9 2645 45-6122') && (
                  <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      Telefone <strong>{editGuardianPhone.trim()}</strong> registrado exatamente como informado, sem modificação automática, e sinalizado para conferência.
                    </span>
                  </div>
                )}

                {(() => {
                  const fullG = guardians.find(gr => gr.id === editGuardianId || gr.name.toLowerCase() === editGuardianName.trim().toLowerCase());
                  if (!fullG || fullG.studentIds.length <= 1) return null;
                  const linkedStudents = students.filter(s => fullG.studentIds.includes(s.id));
                  return (
                    <div className="p-2.5 rounded-lg bg-blue-950/25 border border-blue-500/30 text-[11px] text-blue-200 space-y-1">
                      <span className="font-bold text-blue-300 block">
                        Estudantes vinculados a {fullG.name} ({linkedStudents.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {linkedStudents.map(ls => (
                          <span key={ls.id} className="px-2 py-0.5 rounded bg-[#101010] border border-blue-500/30 text-white font-semibold">
                            {ls.name} ({ls.registrationNumber})
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
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

      {/* Balance Crédito/Débito Modal */}
      {balanceModalStudent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <div>
                <h3 className="font-extrabold text-[#F5F5F5] text-base flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>Crédito / Débito em Conta</span>
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  {balanceModalStudent.name} ({balanceModalStudent.registrationNumber})
                </p>
              </div>
              <button
                onClick={() => setBalanceModalStudent(null)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
              <div className="p-2.5 rounded-xl bg-[#151515] border border-[#282828]">
                <span className="text-[10px] text-[#71717A] uppercase block">Consumo em Aberto</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatCurrency(balanceModalStudent.currentConsumptionBalance)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#151515] border border-[#282828]">
                <span className="text-[10px] text-[#71717A] uppercase block">Crédito Pré-Pago</span>
                <span className="font-mono font-bold text-teal-300">
                  {formatCurrency(balanceModalStudent.creditBalance || 0)}
                </span>
              </div>
            </div>

            {balanceError && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {balanceError}
              </div>
            )}

            <form onSubmit={handleAdjustBalanceSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBalanceOp('CREDITO')}
                  className={`p-2 rounded-xl border font-bold cursor-pointer transition ${
                    balanceOp === 'CREDITO'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                      : 'bg-[#151515] border-[#282828] text-[#71717A]'
                  }`}
                >
                  + Crédito / Abatimento
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceOp('DEBITO')}
                  className={`p-2 rounded-xl border font-bold cursor-pointer transition ${
                    balanceOp === 'DEBITO'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-[#151515] border-[#282828] text-[#71717A]'
                  }`}
                >
                  - Débito Avulso
                </button>
              </div>

              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  placeholder="Ex: 50.00"
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Motivo (Auditoria)</label>
                <input
                  type="text"
                  required
                  value={balanceReason}
                  onChange={(e) => setBalanceReason(e.target.value)}
                  placeholder="Ex: Depósito antecipado pelo responsável / Acerto de saldo"
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setBalanceModalStudent(null)}
                  className="flex-1 py-2 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAdjustingBalance}
                  className="flex-1 py-2 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold cursor-pointer disabled:opacity-40"
                >
                  {isAdjustingBalance ? 'Salvando...' : 'Confirmar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
