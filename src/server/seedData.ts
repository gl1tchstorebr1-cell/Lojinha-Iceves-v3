import type { 
  User, 
  Student, 
  Guardian, 
  Product, 
  Sale, 
  Invoice, 
  PixPayment, 
  StockMovement, 
  FinancialTransaction, 
  WhatsAppNotification, 
  AuditLog, 
  SystemSettings,
  Passeio,
  ProductCategory
} from '../types/index.ts';
import { getInitialsAvatar } from '../utils/avatar.ts';

export const CATALOG_VERSION = '2026-ICEVES-70';

export const initialSettings: SystemSettings = {
  id: 'settings-1',
  institutionName: 'Escola de Cristo - ICEVES',
  cnpj: '18.423.891/0001-44',
  storeName: 'Lojinha Iceves',
  closingDay: 'LAST_DAY',
  closingHour: '23:59',
  dueDayOffset: 10,
  allowDirectCashPayment: false,
  stockControlActive: true,
  blockSaleWithoutStock: true,
  tuitionBillingActive: false,
  defaultTuitionAmount: 0,
  pixKey: '',
  pixKeyType: 'EMAIL',
  pixReceiverName: 'LOJINHA ICEVES',
  pixCity: 'SAO PAULO',
  whatsappAutoEnabled: true,
  whatsappProviderName: 'WhatsApp Business Cloud API',
  whatsappProviderStatus: 'CONNECTED',
  mercadoPagoActive: true,
  mercadoPagoMode: 'PRODUCAO',
  supabaseActive: true,
  supabaseUrl: 'https://brjsoaxvqrtxyofwxgkk.supabase.co',
  supabaseAnonKey: 'sb_publishable_mEQzWNPKvTxqWvzZ8u6XQA_2wlGfyLR',
  catalogVersion: CATALOG_VERSION,
  updatedAt: new Date().toISOString(),
  updatedByUserName: 'Coordenação ICEVES'
};

// Lista oficial dos 17 alunos da 10ª Turma da Escola de Cristo no ICEVES (Formatura: dia 27 ao dia 30)
const DECIMA_TURMA_NOMES = [
  'Ana Vitória Lisboa',
  'Beatriz Gomes Ramos',
  'Calebe Cabral Viana',
  'Calebe Fidelis Alves da Silva',
  'Daniel de Oliveira Ferreira',
  'Emily Costa da Silva',
  'Erick de Souza Fernandes',
  'Ezequiel Ismael Oño Goona',
  'Ialisson Lisboa dos Santos',
  'Izhak Souza Morais',
  'Júlia de Oliveira Ferreira',
  'Lohanne Maciel Arrais',
  'Maria Eduarda Serra',
  'Pedro Guilherme da Costa Lima',
  'Rayssa Gabryele dos Santos de Morais',
  'Rodrigo Lucas Almeida Santos',
  'Victoria Valentina Lopáz Lozada'
];

function slugifyEmail(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/);
  if (clean.length === 1) return `${clean[0]}@gmail.com`;
  return `${clean[0]}.${clean[clean.length - 1]}@gmail.com`;
}

export interface OfficialGuardianSeed {
  guardianId: string;
  studentId: string;
  studentDatabaseName: string;
  informedStudentName: string;
  guardianName: string;
  guardianPhone: string;
  relationship: string;
  stage: 'ETAPA_1_ALUNAS' | 'ETAPA_2_ALUNOS';
  needsPhoneReview?: boolean;
  phoneReviewNote?: string;
  matchNote?: string;
}

// Associação Completa — 17 Estudantes (8 Alunas + 9 Alunos Meninos) da 10ª Turma ICEVES
export const OFFICIAL_GUARDIAN_ASSIGNMENTS: OfficialGuardianSeed[] = [
  // --- 1. LISTA DE ALUNAS (8 REGISTROS) ---
  {
    guardianId: 'guardian-etapa1-1',
    studentId: 'student-12',
    studentDatabaseName: 'Lohanne Maciel Arrais',
    informedStudentName: 'Lohanne Maciel Arrais',
    guardianName: 'Flaviane Maciel Rocha',
    guardianPhone: '94 99200-4759',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS'
  },
  {
    guardianId: 'guardian-etapa1-2',
    studentId: 'student-13',
    studentDatabaseName: 'Maria Eduarda Serra',
    informedStudentName: 'Maria Eduarda Colombo Serra',
    guardianName: 'Evelyn Serra',
    guardianPhone: '11 93091-5958',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS',
    matchNote: 'Nome na lista: "Maria Eduarda Colombo Serra" • Vinculado ao cadastro existente "Maria Eduarda Serra" (EC10-013).'
  },
  {
    guardianId: 'guardian-etapa1-3',
    studentId: 'student-17',
    studentDatabaseName: 'Victoria Valentina Lopáz Lozada',
    informedStudentName: 'Victoria Valentina Lopáz Lozada',
    guardianName: 'Darling Lozada',
    guardianPhone: '58 416-2028274',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS',
    needsPhoneReview: true,
    phoneReviewNote: 'Telefone informado como "58 416-2028274" (código internacional +58). Sinalizado para conferência sem alteração automática.'
  },
  {
    guardianId: 'guardian-etapa1-4',
    studentId: 'student-15',
    studentDatabaseName: 'Rayssa Gabryele dos Santos de Morais',
    informedStudentName: 'Rayssa Gabriely dos Santos de Morais',
    guardianName: 'Maria do Amparo dos Santos de Morais',
    guardianPhone: '98 98751-8671',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS',
    matchNote: 'Nome na lista: "Rayssa Gabriely dos Santos de Morais" • Vinculado ao cadastro existente "Rayssa Gabryele dos Santos de Morais" (EC10-015).'
  },
  {
    guardianId: 'guardian-etapa1-5',
    studentId: 'student-1',
    studentDatabaseName: 'Ana Vitória Lisboa',
    informedStudentName: 'Ana Vitoria Lisboa',
    guardianName: 'Bill Stanley',
    guardianPhone: '66 99645-6370',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS',
    matchNote: 'Nome na lista: "Ana Vitoria Lisboa" • Vinculado ao cadastro "Ana Vitória Lisboa" (EC10-001) • Responsável compartilhado com Ialisson Lisboa dos Santos (EC10-009).'
  },
  {
    guardianId: 'guardian-etapa1-6',
    studentId: 'student-11',
    studentDatabaseName: 'Júlia de Oliveira Ferreira',
    informedStudentName: 'Júlia Oliveira',
    guardianName: 'Wareli Leandro Nunes Ferreira',
    guardianPhone: '31 98619-4449',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS',
    matchNote: 'Nome na lista: "Júlia Oliveira" • Vinculado ao cadastro completo existente "Júlia de Oliveira Ferreira" (EC10-011).'
  },
  {
    guardianId: 'guardian-etapa1-7',
    studentId: 'student-6',
    studentDatabaseName: 'Emily Costa da Silva',
    informedStudentName: 'Emily Costa da Silva',
    guardianName: 'Janice Costa Germano Silva',
    guardianPhone: '94 99129-7789',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS'
  },
  {
    guardianId: 'guardian-etapa1-8',
    studentId: 'student-2',
    studentDatabaseName: 'Beatriz Gomes Ramos',
    informedStudentName: 'Beatriz Gomes Ramos',
    guardianName: 'Elber Rafael Ramos',
    guardianPhone: '62 99153-3710',
    relationship: 'Responsável',
    stage: 'ETAPA_1_ALUNAS'
  },

  // --- 2. LISTA DE ALUNOS MENINOS (9 REGISTROS) ---
  {
    guardianId: 'guardian-etapa2-9',
    studentId: 'student-3',
    studentDatabaseName: 'Calebe Cabral Viana',
    informedStudentName: 'Calebe Cabral Viana',
    guardianName: 'Jean Santos Viana',
    guardianPhone: '33 99973-1040',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS'
  },
  {
    guardianId: 'guardian-etapa2-10',
    studentId: 'student-4',
    studentDatabaseName: 'Calebe Fidelis Alves da Silva',
    informedStudentName: 'Calebe Fidelis Alves da Silva',
    guardianName: 'Renata Fidelis Bezerra Alves',
    guardianPhone: '81 99431-8802',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS'
  },
  {
    guardianId: 'guardian-etapa2-11',
    studentId: 'student-14',
    studentDatabaseName: 'Pedro Guilherme da Costa Lima',
    informedStudentName: 'Pedro Guilherme da Costa Lima',
    guardianName: 'Cristiane da Costa Santos',
    guardianPhone: '79 99449-3537',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS'
  },
  {
    guardianId: 'guardian-etapa2-12',
    studentId: 'student-7',
    studentDatabaseName: 'Erick de Souza Fernandes',
    informedStudentName: 'Erick de Souza Fernandes',
    guardianName: 'Lucas Silva Fernandes',
    guardianPhone: '19 99670-1777',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS'
  },
  {
    guardianId: 'guardian-etapa2-13',
    studentId: 'student-16',
    studentDatabaseName: 'Rodrigo Lucas Almeida Santos',
    informedStudentName: 'Rodrigo Lucas Almeida Santos',
    guardianName: 'Solange Almeida Santos',
    guardianPhone: '73 98117-7865',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS'
  },
  {
    guardianId: 'guardian-etapa2-14',
    studentId: 'student-5',
    studentDatabaseName: 'Daniel de Oliveira Ferreira',
    informedStudentName: 'Daniel de Oliveira Ferreira',
    guardianName: 'Lívia Queiroz de Oliveira Ferreira',
    guardianPhone: '37 99820-6885',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS'
  },
  {
    guardianId: 'guardian-etapa2-15',
    studentId: 'student-10',
    studentDatabaseName: 'Izhak Souza Morais',
    informedStudentName: 'Izhak Sousa Morais',
    guardianName: 'Itamar Viana Santos Morais',
    guardianPhone: '99 98110-5096',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS',
    matchNote: 'Nome na lista: "Izhak Sousa Morais" • Vinculado ao cadastro existente "Izhak Souza Morais" (EC10-010).'
  },
  {
    // Reutiliza o cadastro único de Bill Stanley (guardian-etapa1-5)
    guardianId: 'guardian-etapa1-5',
    studentId: 'student-9',
    studentDatabaseName: 'Ialisson Lisboa dos Santos',
    informedStudentName: 'Ialisson Lisboa Santos',
    guardianName: 'Bill Stanley',
    guardianPhone: '66 99645-6370',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS',
    matchNote: 'Nome na lista: "Ialisson Lisboa Santos" • Vinculado ao cadastro existente "Ialisson Lisboa dos Santos" (EC10-009) • Cadastro de Bill Stanley reutilizado.'
  },
  {
    guardianId: 'guardian-etapa2-17',
    studentId: 'student-8',
    studentDatabaseName: 'Ezequiel Ismael Oño Goona',
    informedStudentName: 'Ezequiel Oño',
    guardianName: 'Ceferino Oño',
    guardianPhone: '54 9 2645 45-6122',
    relationship: 'Responsável',
    stage: 'ETAPA_2_ALUNOS',
    needsPhoneReview: true,
    phoneReviewNote: 'Telefone informado como "54 9 2645 45-6122" (código internacional +54). Sinalizado para conferência sem alteração automática.',
    matchNote: 'Nome na lista: "Ezequiel Oño" • Vinculado ao cadastro completo existente "Ezequiel Ismael Oño Goona" (EC10-008).'
  }
];

export const initialStudents: Student[] = DECIMA_TURMA_NOMES.map((fullName, idx) => {
  const num = idx + 1;
  const studentId = `student-${num}`;
  const regCode = `EC10-${String(num).padStart(3, '0')}`;
  const assignedGuardians = OFFICIAL_GUARDIAN_ASSIGNMENTS.filter(g => g.studentId === studentId).map(g => ({
    guardianId: g.guardianId,
    guardianName: g.guardianName,
    guardianPhone: g.guardianPhone,
    relationship: g.relationship,
    isPrimaryPayer: true,
    canAccessPortal: true,
    needsPhoneReview: g.needsPhoneReview,
    phoneReviewNote: g.phoneReviewNote,
    matchNote: g.matchNote
  }));

  return {
    id: studentId,
    name: fullName,
    registrationNumber: regCode,
    classGroup: '10ª Turma • Escola de Cristo (Formatura 27 a 30)',
    email: slugifyEmail(fullName),
    phone: `(11) 99100-${String(1000 + num).slice(-4)}`,
    avatar: getInitialsAvatar(fullName),
    status: 'ACTIVE',
    defaultTuition: 0,
    currentConsumptionBalance: 0,
    totalOpenDebt: 0,
    payerRule: 'BOTH',
    reportRecipientRule: 'BOTH',
    dueReminderRecipientRule: 'BOTH',
    paymentConfirmationRecipientRule: 'BOTH',
    allowedChannels: ['WHATSAPP', 'EMAIL'],
    guardians: assignedGuardians,
    notes: '10ª Turma - Escola de Cristo ICEVES (Formatura: 27 a 30)',
    createdAt: '2026-11-01T08:00:00Z'
  };
});

export const initialUsers: User[] = [
  {
    id: 'user-admin',
    name: 'Coordenação ICEVES',
    email: 'admin.lojinha@gmail.com',
    role: 'ADMIN',
    phone: '(11) 98765-4321',
    avatar: getInitialsAvatar('Coordenação ICEVES'),
    createdAt: '2026-01-15T08:00:00Z'
  },
  {
    id: 'user-cashier',
    name: 'Atendimento Lojinha Iceves',
    email: 'caixa.lojinha@gmail.com',
    role: 'CASHIER',
    phone: '(11) 97654-3210',
    avatar: getInitialsAvatar('Lojinha Iceves'),
    createdAt: '2026-02-01T08:00:00Z'
  },
  {
    id: 'user-student-1',
    name: 'Ana Vitória Lisboa',
    email: 'ana.lisboa@gmail.com',
    role: 'STUDENT',
    studentId: 'student-1',
    phone: '(11) 99100-1001',
    avatar: getInitialsAvatar('Ana Vitória Lisboa'),
    createdAt: '2026-11-01T08:00:00Z'
  },
  {
    id: 'user-student-2',
    name: 'Beatriz Gomes Ramos',
    email: 'beatriz.ramos@gmail.com',
    role: 'STUDENT',
    studentId: 'student-2',
    phone: '(11) 99100-1002',
    avatar: getInitialsAvatar('Beatriz Gomes Ramos'),
    createdAt: '2026-11-01T08:00:00Z'
  },
  {
    id: 'user-guardian-1',
    name: 'Bill Stanley',
    email: 'bill.stanley@gmail.com',
    role: 'GUARDIAN',
    guardianId: 'guardian-etapa1-5',
    phone: '66 99645-6370',
    avatar: getInitialsAvatar('Bill Stanley'),
    createdAt: '2026-11-01T08:00:00Z'
  }
];

// Consolida os 16 responsáveis únicos (reutilizando Bill Stanley para Ana Vitória Lisboa e Ialisson Lisboa dos Santos)
export const initialGuardians: Guardian[] = (() => {
  const map = new Map<string, Guardian>();
  for (const g of OFFICIAL_GUARDIAN_ASSIGNMENTS) {
    const existing = map.get(g.guardianId);
    if (!existing) {
      map.set(g.guardianId, {
        id: g.guardianId,
        name: g.guardianName,
        cpf: 'Não informado',
        email: slugifyEmail(g.guardianName),
        phone: g.guardianPhone,
        relationshipDefault: g.relationship,
        studentIds: [g.studentId],
        needsPhoneReview: g.needsPhoneReview,
        phoneReviewNote: g.phoneReviewNote,
        createdAt: '2026-11-01T08:00:00Z'
      });
    } else if (!existing.studentIds.includes(g.studentId)) {
      existing.studentIds.push(g.studentId);
    }
  }
  return Array.from(map.values());
})();

interface CatalogSeedEntry {
  id: string;
  internalCode: string;
  name: string;
  category: ProductCategory;
  price: number | null;
  currentStock: number;
  imageUrl: string;
  unit?: string;
}

const CATALOG_ENTRIES: CatalogSeedEntry[] = [
  // 1. LIVROS E LITERATURA CRISTÃ (30)
  { id: 'prod-liv-001', internalCode: 'LIV-001', name: 'Bíblia pequena', category: 'Livros e Literatura Cristã', price: 25.00, currentStock: 6, imageUrl: '/assets/products/bible.jpg' },
  { id: 'prod-liv-002', internalCode: 'LIV-002', name: 'Livro Tempo de Sair', category: 'Livros e Literatura Cristã', price: null, currentStock: 9, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-003', internalCode: 'LIV-003', name: 'Adolescentes Moldados pelo Espírito', category: 'Livros e Literatura Cristã', price: 35.00, currentStock: 11, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-004', internalCode: 'LIV-004', name: 'Face a Face com o Verdadeiro Evangelho', category: 'Livros e Literatura Cristã', price: 25.00, currentStock: 4, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-005', internalCode: 'LIV-005', name: 'Conselho de Pedro aos Pais', category: 'Livros e Literatura Cristã', price: 25.00, currentStock: 3, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-006', internalCode: 'LIV-006', name: 'Jovem, Você Vai se Arriscar', category: 'Livros e Literatura Cristã', price: 10.00, currentStock: 2, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-007', internalCode: 'LIV-007', name: 'O Que Farei para Herdar a Vida Eterna', category: 'Livros e Literatura Cristã', price: 25.00, currentStock: 197, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-008', internalCode: 'LIV-008', name: 'Por Que Jesus Ainda Não Voltou', category: 'Livros e Literatura Cristã', price: 20.00, currentStock: 47, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-009', internalCode: 'LIV-009', name: 'Pornografia: O Inimigo Silencioso', category: 'Livros e Literatura Cristã', price: 40.00, currentStock: 16, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-010', internalCode: 'LIV-010', name: 'Como Orar por Sua Futura Esposa', category: 'Livros e Literatura Cristã', price: 25.00, currentStock: 5, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-011', internalCode: 'LIV-011', name: 'Como Orar por Seu Futuro Marido', category: 'Livros e Literatura Cristã', price: 25.00, currentStock: 2, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-012', internalCode: 'LIV-012', name: 'Mães Orando, Filhos Protegidos', category: 'Livros e Literatura Cristã', price: 35.00, currentStock: 6, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-013', internalCode: 'LIV-013', name: 'Florescendo em Virtude', category: 'Livros e Literatura Cristã', price: 25.00, currentStock: 10, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-014', internalCode: 'LIV-014', name: 'Guiados pelo Espírito', category: 'Livros e Literatura Cristã', price: null, currentStock: 4, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-015', internalCode: 'LIV-015', name: 'Bateria, Rock e Adoração', category: 'Livros e Literatura Cristã', price: 20.00, currentStock: 122, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-016', internalCode: 'LIV-016', name: 'Um Primeiro Rascunho da História', category: 'Livros e Literatura Cristã', price: 40.00, currentStock: 53, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-017', internalCode: 'LIV-017', name: 'Oito Passos para Saúde', category: 'Livros e Literatura Cristã', price: 4.00, currentStock: 168, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-018', internalCode: 'LIV-018', name: 'A Proximidade do Seu Salvador', category: 'Livros e Literatura Cristã', price: 4.00, currentStock: 6, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-019', internalCode: 'LIV-019', name: 'Liberdade Religiosa', category: 'Livros e Literatura Cristã', price: null, currentStock: 34, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-020', internalCode: 'LIV-020', name: 'A Terra do Tesouro Perdido', category: 'Livros e Literatura Cristã', price: null, currentStock: 2, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-021', internalCode: 'LIV-021', name: 'A Única Esperança', category: 'Livros e Literatura Cristã', price: 10.00, currentStock: 8, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-022', internalCode: 'LIV-022', name: 'No Deserto da Tentação', category: 'Livros e Literatura Cristã', price: 10.00, currentStock: 7, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-023', internalCode: 'LIV-023', name: 'Fé e Obras', category: 'Livros e Literatura Cristã', price: 10.00, currentStock: 8, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-024', internalCode: 'LIV-024', name: 'O Livro Amargo', category: 'Livros e Literatura Cristã', price: 10.00, currentStock: 8, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-025', internalCode: 'LIV-025', name: 'Mapa do Tesouro', category: 'Livros e Literatura Cristã', price: 10.00, currentStock: 4, imageUrl: '/assets/products/christian_book.jpg' },
  { id: 'prod-liv-026', internalCode: 'LIV-026', name: 'Projetado para Curar', category: 'Livros e Literatura Cristã', price: 50.00, currentStock: 1, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-027', internalCode: 'LIV-027', name: 'Saúde Nua e Crua', category: 'Livros e Literatura Cristã', price: 30.00, currentStock: 17, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-028', internalCode: 'LIV-028', name: 'A Máquina Viva', category: 'Livros e Literatura Cristã', price: null, currentStock: 7, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-029', internalCode: 'LIV-029', name: 'Trata-se de Amar Pessoas', category: 'Livros e Literatura Cristã', price: null, currentStock: 10, imageUrl: '/assets/products/health_book.jpg' },
  { id: 'prod-liv-030', internalCode: 'LIV-030', name: 'O Verbo se Fez Carne', category: 'Livros e Literatura Cristã', price: 30.00, currentStock: 2, imageUrl: '/assets/products/christian_book.jpg' },

  // 2. ALIMENTOS E SNACKS (17)
  { id: 'prod-ali-001', internalCode: 'ALI-001', name: 'Paçocas', category: 'Alimentos e Snacks', price: 0.60, currentStock: 189, imageUrl: '/assets/products/pacoca.jpg' },
  { id: 'prod-ali-002', internalCode: 'ALI-002', name: 'Barrinha de Cereal Kobber', category: 'Alimentos e Snacks', price: 2.50, currentStock: 17, imageUrl: '/assets/products/cereal_bar.jpg' },
  { id: 'prod-ali-003', internalCode: 'ALI-003', name: 'Nutry Cereais', category: 'Alimentos e Snacks', price: 3.00, currentStock: 119, imageUrl: '/assets/products/cereal_bar.jpg' },
  { id: 'prod-ali-004', internalCode: 'ALI-004', name: 'Nutry Nuts', category: 'Alimentos e Snacks', price: 4.00, currentStock: 50, imageUrl: '/assets/products/cereal_bar.jpg' },
  { id: 'prod-ali-005', internalCode: 'ALI-005', name: 'Rosquinha Rancheiro Sabor Coco', category: 'Alimentos e Snacks', price: 8.00, currentStock: 17, imageUrl: '/assets/products/cookies_granola.jpg' },
  { id: 'prod-ali-006', internalCode: 'ALI-006', name: 'Rosquinha Rancheiro Sabor Maçã com Canela', category: 'Alimentos e Snacks', price: 8.50, currentStock: 7, imageUrl: '/assets/products/cookies_granola.jpg' },
  { id: 'prod-ali-007', internalCode: 'ALI-007', name: 'Granola Salgada', category: 'Alimentos e Snacks', price: 13.00, currentStock: 2, imageUrl: '/assets/products/cookies_granola.jpg' },
  { id: 'prod-ali-008', internalCode: 'ALI-008', name: 'Granola Doce', category: 'Alimentos e Snacks', price: 15.00, currentStock: 20, imageUrl: '/assets/products/cookies_granola.jpg' },
  { id: 'prod-ali-009', internalCode: 'ALI-009', name: 'Chips de Arroz Integral Cebola e Salsa', category: 'Alimentos e Snacks', price: 8.50, currentStock: 9, imageUrl: '/assets/products/savory_snacks.jpg' },
  { id: 'prod-ali-010', internalCode: 'ALI-010', name: 'Barrinha Kobber Banana e Mel', category: 'Alimentos e Snacks', price: 2.50, currentStock: 17, imageUrl: '/assets/products/cereal_bar.jpg' },
  { id: 'prod-ali-011', internalCode: 'ALI-011', name: 'Sucrilhos 500g', category: 'Alimentos e Snacks', price: 10.00, currentStock: 4, imageUrl: '/assets/products/cookies_granola.jpg' },
  { id: 'prod-ali-012', internalCode: 'ALI-012', name: 'Biscoito de Polvilho', category: 'Alimentos e Snacks', price: 3.00, currentStock: 2, imageUrl: '/assets/products/cookies_granola.jpg' },
  { id: 'prod-ali-013', internalCode: 'ALI-013', name: 'Farofa', category: 'Alimentos e Snacks', price: 8.50, currentStock: 29, imageUrl: '/assets/products/savory_snacks.jpg' },
  { id: 'prod-ali-014', internalCode: 'ALI-014', name: 'Cream Cracker Rancheiro', category: 'Alimentos e Snacks', price: 5.50, currentStock: 14, imageUrl: '/assets/products/cookies_granola.jpg' },
  { id: 'prod-ali-015', internalCode: 'ALI-015', name: 'Farinha de Mandioca', category: 'Alimentos e Snacks', price: 8.50, currentStock: 2, imageUrl: '/assets/products/savory_snacks.jpg' },
  { id: 'prod-ali-016', internalCode: 'ALI-016', name: 'Rapadura', category: 'Alimentos e Snacks', price: 12.00, currentStock: 7, imageUrl: '/assets/products/savory_snacks.jpg' },
  { id: 'prod-ali-017', internalCode: 'ALI-017', name: 'Amendoim Crocante Cebola e Salsa', category: 'Alimentos e Snacks', price: 3.50, currentStock: 21, imageUrl: '/assets/products/savory_snacks.jpg' },

  // 3. PRODUTOS NATURAIS E SAÚDE (5)
  { id: 'prod-nat-001', internalCode: 'NAT-001', name: 'Extrato de Própolis Grão do Céu', category: 'Produtos Naturais e Saúde', price: 20.00, currentStock: 7, imageUrl: '/assets/products/natural_health.jpg' },
  { id: 'prod-nat-002', internalCode: 'NAT-002', name: 'Pomadas de Própolis', category: 'Produtos Naturais e Saúde', price: 20.00, currentStock: 3, imageUrl: '/assets/products/natural_health.jpg' },
  { id: 'prod-nat-003', internalCode: 'NAT-003', name: 'Óleo de Copaíba', category: 'Produtos Naturais e Saúde', price: 10.00, currentStock: 10, imageUrl: '/assets/products/natural_health.jpg' },
  { id: 'prod-nat-004', internalCode: 'NAT-004', name: 'Extrato de Própolis', category: 'Produtos Naturais e Saúde', price: 25.00, currentStock: 3, imageUrl: '/assets/products/natural_health.jpg' },
  { id: 'prod-nat-005', internalCode: 'NAT-005', name: 'Mel ICEVES', category: 'Produtos Naturais e Saúde', price: 12.00, currentStock: 7, imageUrl: '/assets/products/natural_health.jpg' },

  // 4. PAPELARIA (3)
  { id: 'prod-pap-001', internalCode: 'PAP-001', name: 'Marca-texto Amarelo', category: 'Papelaria', price: 4.00, currentStock: 7, imageUrl: '/assets/products/stationery_markers.jpg' },
  { id: 'prod-pap-002', internalCode: 'PAP-002', name: 'Marca-texto Laranja', category: 'Papelaria', price: 4.00, currentStock: 9, imageUrl: '/assets/products/stationery_markers.jpg' },
  { id: 'prod-pap-003', internalCode: 'PAP-003', name: 'Caneta Ponta Fina', category: 'Papelaria', price: 4.00, currentStock: 13, imageUrl: '/assets/products/stationery_markers.jpg' },

  // 5. HIGIENE E CUIDADOS PESSOAIS (14)
  { id: 'prod-hig-001', internalCode: 'HIG-001', name: 'Sabão em Pedra', category: 'Higiene e Cuidados Pessoais', price: 4.00, currentStock: 32, imageUrl: '/assets/products/soap_hygiene.jpg' },
  { id: 'prod-hig-002', internalCode: 'HIG-002', name: 'Sabonete Nivea', category: 'Higiene e Cuidados Pessoais', price: 4.00, currentStock: 3, imageUrl: '/assets/products/soap_hygiene.jpg' },
  { id: 'prod-hig-003', internalCode: 'HIG-003', name: 'Cotonete Reale', category: 'Higiene e Cuidados Pessoais', price: 4.00, currentStock: 4, imageUrl: '/assets/products/soap_hygiene.jpg' },
  { id: 'prod-hig-004', internalCode: 'HIG-004', name: 'Creme Skala', category: 'Higiene e Cuidados Pessoais', price: 15.00, currentStock: 8, imageUrl: '/assets/products/hair_care.jpg' },
  { id: 'prod-hig-005', internalCode: 'HIG-005', name: 'Kit Seda Shampoo + Condicionador', category: 'Higiene e Cuidados Pessoais', price: 28.00, currentStock: 2, imageUrl: '/assets/products/hair_care.jpg' },
  { id: 'prod-hig-006', internalCode: 'HIG-006', name: 'Escova de Dente Oral-B', category: 'Higiene e Cuidados Pessoais', price: 7.50, currentStock: 5, imageUrl: '/assets/products/oral_care.jpg' },
  { id: 'prod-hig-007', internalCode: 'HIG-007', name: 'Prestobarba BIC', category: 'Higiene e Cuidados Pessoais', price: 2.50, currentStock: 8, imageUrl: '/assets/products/oral_care.jpg' },
  { id: 'prod-hig-008', internalCode: 'HIG-008', name: 'Absorvente Intimus', category: 'Higiene e Cuidados Pessoais', price: 7.00, currentStock: 3, imageUrl: '/assets/products/soap_hygiene.jpg' },
  { id: 'prod-hig-009', internalCode: 'HIG-009', name: 'Absorvente Always', category: 'Higiene e Cuidados Pessoais', price: 11.00, currentStock: 2, imageUrl: '/assets/products/soap_hygiene.jpg' },
  { id: 'prod-hig-010', internalCode: 'HIG-010', name: 'Pasta de Dente Sorriso', category: 'Higiene e Cuidados Pessoais', price: 4.00, currentStock: 8, imageUrl: '/assets/products/oral_care.jpg' },
  { id: 'prod-hig-011', internalCode: 'HIG-011', name: 'Desodorante Giovanna Baby', category: 'Higiene e Cuidados Pessoais', price: 12.00, currentStock: 12, imageUrl: '/assets/products/oral_care.jpg' },
  { id: 'prod-hig-012', internalCode: 'HIG-012', name: 'Lenço Umedecido Bebê Limpinho CIMED', category: 'Higiene e Cuidados Pessoais', price: 14.00, currentStock: 2, imageUrl: '/assets/products/soap_hygiene.jpg' },
  { id: 'prod-hig-013', internalCode: 'HIG-013', name: 'Tennys Pé', category: 'Higiene e Cuidados Pessoais', price: 14.00, currentStock: 2, imageUrl: '/assets/products/oral_care.jpg' },
  { id: 'prod-hig-014', internalCode: 'HIG-014', name: 'Papel Higiênico Persona VIP', category: 'Higiene e Cuidados Pessoais', price: 18.00, currentStock: 12, imageUrl: '/assets/products/soap_hygiene.jpg' },

  // 6. LIMPEZA (1)
  { id: 'prod-lim-001', internalCode: 'LIM-001', name: 'Sabão Tixan em Pó 400g', category: 'Limpeza', price: 10.00, currentStock: 6, imageUrl: '/assets/products/laundry_detergent.jpg' },
];

export const initialProducts: Product[] = CATALOG_ENTRIES.map((item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  price: item.price,
  priceStatus: item.price === null ? 'PENDING' : 'DEFINED',
  internalCode: item.internalCode,
  currentStock: item.currentStock,
  minStock: 5,
  status: 'ACTIVE',
  archived: false,
  images: [item.imageUrl],
  imageUrl: item.imageUrl,
  unit: item.unit || 'un',
  createdAt: '2026-11-17T11:00:00Z',
  updatedAt: '2026-11-17T11:00:00Z',
}));

export const initialStockMovements: StockMovement[] = [];

export const initialSales: Sale[] = [];

export const initialFinancialLedger: FinancialTransaction[] = [];

export const initialInvoices: Invoice[] = [];

export const initialPixPayments: PixPayment[] = [];

export const initialWhatsAppNotifications: WhatsAppNotification[] = [];

export const initialAuditLogs: AuditLog[] = [
  {
    id: 'AUD-001',
    timestamp: new Date().toISOString(),
    userId: 'user-admin',
    userName: 'Coordenação ICEVES',
    userRole: 'ADMIN',
    action: 'CADASTRO_DECIMA_TURMA',
    module: 'CONFIGURACOES',
    details: '17 alunos da 10ª Turma da Escola de Cristo - ICEVES (Formatura 27 a 30) sincronizados no sistema.',
    status: 'SUCESSO'
  }
];

export const initialPasseios: Passeio[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    nome: 'Passeio para a Cachoeira',
    valor: 35.00,
    descricao: 'Excursão oficial da 10ª Turma da Escola de Cristo (ICEVES) com transporte e acompanhamento.',
    dataPasseio: '2026-11-21',
    ativo: true,
    createdAt: '2026-11-01T08:00:00Z',
    updatedAt: '2026-11-01T08:00:00Z'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    nome: 'Passeio para a Cidade',
    valor: 20.00,
    descricao: 'Saída em grupo com os alunos da 10ª Turma para compras e confraternização na cidade.',
    dataPasseio: '2026-11-25',
    ativo: true,
    createdAt: '2026-11-01T08:00:00Z',
    updatedAt: '2026-11-01T08:00:00Z'
  }
];

