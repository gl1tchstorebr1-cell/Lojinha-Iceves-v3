import { 
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
  SystemSettings 
} from '../types/index.ts';
import { getInitialsAvatar } from '../utils/avatar.ts';

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

export const initialStudents: Student[] = DECIMA_TURMA_NOMES.map((fullName, idx) => {
  const num = idx + 1;
  const regCode = `EC10-${String(num).padStart(3, '0')}`;
  return {
    id: `student-${num}`,
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
    guardians: [],
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
    password: 'Admin#Iceves2026',
    phone: '(11) 98765-4321',
    avatar: getInitialsAvatar('Coordenação ICEVES'),
    createdAt: '2026-01-15T08:00:00Z'
  },
  {
    id: 'user-cashier',
    name: 'Atendimento Lojinha Iceves',
    email: 'caixa.lojinha@gmail.com',
    role: 'CASHIER',
    password: 'Caixa#Iceves2026',
    phone: '(11) 97654-3210',
    avatar: getInitialsAvatar('Lojinha Iceves'),
    createdAt: '2026-02-01T08:00:00Z'
  },
  {
    id: 'user-student-1',
    name: 'Ana Vitória Lisboa',
    email: 'ana.lisboa@gmail.com',
    role: 'STUDENT',
    password: 'Aluno#Iceves2026',
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
    password: 'Aluno#Iceves2026',
    studentId: 'student-2',
    phone: '(11) 99100-1002',
    avatar: getInitialsAvatar('Beatriz Gomes Ramos'),
    createdAt: '2026-11-01T08:00:00Z'
  },
  {
    id: 'user-guardian-1',
    name: 'Responsável / Família ICEVES',
    email: 'familia.iceves@gmail.com',
    role: 'GUARDIAN',
    password: 'Familia#Iceves2026',
    guardianId: 'guardian-1',
    phone: '(11) 98111-2233',
    avatar: getInitialsAvatar('Família ICEVES'),
    createdAt: '2026-11-01T08:00:00Z'
  }
];

export const initialGuardians: Guardian[] = [
  {
    id: 'guardian-1',
    name: 'Responsável / Família ICEVES',
    cpf: '142.589.632-10',
    email: 'familia.iceves@gmail.com',
    phone: '(11) 98111-2233',
    relationshipDefault: 'Responsável',
    studentIds: initialStudents.map(s => s.id),
    createdAt: '2026-11-01T08:00:00Z'
  }
];

export const initialProducts: Product[] = [
  // --- ALIMENTÍCIOS ---
  {
    id: 'prod-1',
    name: 'Suco Natural de Laranja 300ml',
    category: 'Alimentícios',
    price: 7.50,
    internalCode: 'ALI-001',
    barcode: '7891000101',
    currentStock: 34,
    minStock: 10,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-2',
    name: 'Pão de Queijo Mineiro Artesanal',
    category: 'Alimentícios',
    price: 6.00,
    internalCode: 'ALI-002',
    barcode: '7891000102',
    currentStock: 48,
    minStock: 15,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1598110750419-75a89df2ebbe?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1598110750419-75a89df2ebbe?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-3',
    name: 'Sanduíche Natural Peito de Frango',
    category: 'Alimentícios',
    price: 12.00,
    internalCode: 'ALI-003',
    barcode: '7891000103',
    currentStock: 18,
    minStock: 8,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-4',
    name: 'Brownie Artesanal Chocolate Belga',
    category: 'Alimentícios',
    price: 8.50,
    internalCode: 'ALI-004',
    barcode: '7891000104',
    currentStock: 22,
    minStock: 10,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1515037893149-de7f840978e2?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },

  // --- PAPELARIA ---
  {
    id: 'prod-5',
    name: 'Caderno de Anotações Pautado ICEVES',
    category: 'Papelaria',
    price: 24.90,
    internalCode: 'PAP-005',
    barcode: '7891000105',
    currentStock: 35,
    minStock: 10,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517842645767-c639042777db?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1589998059171-988d887df646?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-6',
    name: 'Caneta Esferográfica Gel Ponta 0.5',
    category: 'Papelaria',
    price: 5.50,
    internalCode: 'PAP-006',
    barcode: '7891000106',
    currentStock: 85,
    minStock: 25,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1585336261026-7f570e303b6d?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1569683795645-b62e50fbf103?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-7',
    name: 'Kit Marca-Texto Tons Pastéis (4 cores)',
    category: 'Papelaria',
    price: 18.00,
    internalCode: 'PAP-007',
    barcode: '7891000107',
    currentStock: 28,
    minStock: 8,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1568205612837-017257d2310a?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1568205612837-017257d2310a?w=500&auto=format&fit=crop&q=80',
    unit: 'pct',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },

  // --- PRODUTOS DE LIMPEZA ---
  {
    id: 'prod-14',
    name: 'Detergente Líquido Neutro Concentrado 500ml',
    category: 'Produtos de Limpeza',
    price: 4.80,
    internalCode: 'LIM-008',
    barcode: '7891000108',
    currentStock: 30,
    minStock: 10,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1585670270608-b4be4fb880ed?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1585670270608-b4be4fb880ed?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-15',
    name: 'Álcool 70% Spray Higienizador 500ml',
    category: 'Produtos de Limpeza',
    price: 9.90,
    internalCode: 'LIM-009',
    barcode: '7891000109',
    currentStock: 42,
    minStock: 12,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1584362917165-526a968579e8?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-16',
    name: 'Pano de Microfibra Multiuso (Kit 3 unidades)',
    category: 'Produtos de Limpeza',
    price: 14.50,
    internalCode: 'LIM-010',
    barcode: '7891000110',
    currentStock: 25,
    minStock: 8,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1585670270608-b4be4fb880ed?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=500&auto=format&fit=crop&q=80',
    unit: 'pct',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },

  // --- COSMÉTICOS ---
  {
    id: 'prod-11',
    name: 'Sabonete Líquido Hidratante Erva-Doce 250ml',
    category: 'Cosméticos',
    price: 13.90,
    internalCode: 'COS-011',
    barcode: '7891000111',
    currentStock: 20,
    minStock: 8,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1608248597359-3a32247c4e57?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1608248597359-3a32247c4e57?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-12',
    name: 'Hidratante Labial Manteiga de Cacau',
    category: 'Cosméticos',
    price: 6.90,
    internalCode: 'COS-012',
    barcode: '7891000112',
    currentStock: 35,
    minStock: 10,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-13',
    name: 'Creme Hidratante para Mãos com Karité 50g',
    category: 'Cosméticos',
    price: 16.50,
    internalCode: 'COS-013',
    barcode: '7891000113',
    currentStock: 22,
    minStock: 8,
    status: 'ACTIVE',
    images: [
      'https://images.unsplash.com/photo-1617897903246-719242758050?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=500&auto=format&fit=crop&q=80'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=500&auto=format&fit=crop&q=80',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  }
];

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
