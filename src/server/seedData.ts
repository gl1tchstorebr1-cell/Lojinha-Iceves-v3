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

export const initialSettings: SystemSettings = {
  id: 'settings-1',
  institutionName: 'Campus University School',
  cnpj: '18.423.891/0001-44',
  storeName: 'Lojinha do Campus',
  closingDay: 'LAST_DAY',
  closingHour: '23:59',
  dueDayOffset: 10, // Vencimento dia 10 do mês seguinte
  allowDirectCashPayment: false, // Consumo vai obrigatoriamente para a fatura mensal
  stockControlActive: true,
  blockSaleWithoutStock: true,
  pixKey: 'financeiro@campus.edu.br',
  pixKeyType: 'EMAIL',
  pixReceiverName: 'CAMPUS EDUCACIONAL',
  pixCity: 'SAO PAULO',
  whatsappAutoEnabled: true,
  whatsappProviderName: 'WhatsApp Business Cloud API',
  whatsappProviderStatus: 'CONNECTED',
  mercadoPagoActive: true,
  mercadoPagoMode: 'PRODUCAO',
  supabaseActive: true,
  stripePublishableKey: 'pk_test_51UVBR4Ce1xrwLqvjzNeIaPvHRPuBmEgEoTU3x447Ywbb6C9IbHOmP24vMtUT3azAtGadTJ5jjDJ6GCU9eXkObiva00E01EwrRp',
  updatedAt: '2026-10-25T10:00:00Z',
  updatedByUserName: 'Administrador do Sistema'
};

export const initialUsers: User[] = [
  {
    id: 'user-admin',
    name: 'Mariana Vasconcelos',
    email: 'admin@campus.edu',
    role: 'ADMIN',
    phone: '(11) 98765-4321',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-01-15T08:00:00Z'
  },
  {
    id: 'user-cashier',
    name: 'Roberto Silveira',
    email: 'caixa@campus.edu',
    role: 'CASHIER',
    phone: '(11) 97654-3210',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-02-01T08:00:00Z'
  },
  {
    id: 'user-student-lucas',
    name: 'Lucas Andrade',
    email: 'aluno.lucas@campus.edu',
    role: 'STUDENT',
    studentId: 'student-1',
    phone: '(11) 99123-4567',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-02-10T08:00:00Z'
  },
  {
    id: 'user-student-sofia',
    name: 'Sofia Andrade',
    email: 'aluna.sofia@campus.edu',
    role: 'STUDENT',
    studentId: 'student-2',
    phone: '(11) 99345-6789',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-02-10T08:00:00Z'
  },
  {
    id: 'user-guardian-claudia',
    name: 'Dra. Cláudia Andrade',
    email: 'resp.claudia@gmail.com',
    role: 'GUARDIAN',
    guardianId: 'guardian-1',
    phone: '(11) 98111-2233',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-02-10T08:00:00Z'
  },
  {
    id: 'user-guardian-marcos',
    name: 'Carlos Eduardo Lima',
    email: 'resp.carlos@gmail.com',
    role: 'GUARDIAN',
    guardianId: 'guardian-2',
    phone: '(11) 98222-3344',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-02-12T08:00:00Z'
  }
];

export const initialGuardians: Guardian[] = [
  {
    id: 'guardian-1',
    name: 'Dra. Cláudia Andrade',
    cpf: '142.589.632-10',
    email: 'resp.claudia@gmail.com',
    phone: '(11) 98111-2233',
    relationshipDefault: 'Mãe',
    studentIds: ['student-1', 'student-2'],
    createdAt: '2026-02-10T08:00:00Z'
  },
  {
    id: 'guardian-2',
    name: 'Carlos Eduardo Lima',
    cpf: '231.984.756-32',
    email: 'resp.carlos@gmail.com',
    phone: '(11) 98222-3344',
    relationshipDefault: 'Pai',
    studentIds: ['student-3'],
    createdAt: '2026-02-12T08:00:00Z'
  }
];

export const initialStudents: Student[] = [
  {
    id: 'student-1',
    name: 'Lucas Andrade',
    registrationNumber: '2024-0412',
    classGroup: '3º Ano E.M. - Turma A',
    email: 'aluno.lucas@campus.edu',
    phone: '(11) 99123-4567',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    status: 'ACTIVE',
    defaultTuition: 750.00,
    currentConsumptionBalance: 42.50,
    totalOpenDebt: 792.50,
    payerRule: 'BOTH',
    reportRecipientRule: 'BOTH',
    dueReminderRecipientRule: 'BOTH',
    paymentConfirmationRecipientRule: 'BOTH',
    allowedChannels: ['WHATSAPP', 'EMAIL'],
    guardians: [
      {
        guardianId: 'guardian-1',
        relationship: 'Mãe',
        isPrimaryPayer: true,
        canAccessPortal: true
      }
    ],
    notes: 'Aluno autorizado a consumir na cantina até R$ 250,00 por quinzena.',
    createdAt: '2026-02-10T08:00:00Z'
  },
  {
    id: 'student-2',
    name: 'Sofia Andrade',
    registrationNumber: '2024-0413',
    classGroup: '1º Ano E.M. - Turma B',
    email: 'aluna.sofia@campus.edu',
    phone: '(11) 99345-6789',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    status: 'ACTIVE',
    defaultTuition: 750.00,
    currentConsumptionBalance: 27.00,
    totalOpenDebt: 777.00,
    payerRule: 'GUARDIAN_ONLY',
    reportRecipientRule: 'BOTH',
    dueReminderRecipientRule: 'GUARDIAN_ONLY',
    paymentConfirmationRecipientRule: 'BOTH',
    allowedChannels: ['WHATSAPP', 'EMAIL'],
    guardians: [
      {
        guardianId: 'guardian-1',
        relationship: 'Mãe',
        isPrimaryPayer: true,
        canAccessPortal: true
      }
    ],
    notes: 'Restrição alimentar: Intolerância à lactose.',
    createdAt: '2026-02-10T08:00:00Z'
  },
  {
    id: 'student-3',
    name: 'Matheus Lima',
    registrationNumber: '2024-0589',
    classGroup: '2º Ano E.M. - Turma A',
    email: 'aluno.matheus@campus.edu',
    phone: '(11) 99777-8899',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    status: 'ACTIVE',
    defaultTuition: 750.00,
    currentConsumptionBalance: 15.50,
    totalOpenDebt: 15.50,
    payerRule: 'STUDENT_ONLY',
    reportRecipientRule: 'STUDENT_ONLY',
    dueReminderRecipientRule: 'STUDENT_ONLY',
    paymentConfirmationRecipientRule: 'STUDENT_ONLY',
    allowedChannels: ['WHATSAPP'],
    guardians: [
      {
        guardianId: 'guardian-2',
        relationship: 'Pai',
        isPrimaryPayer: false,
        canAccessPortal: true
      }
    ],
    createdAt: '2026-02-12T08:00:00Z'
  },
  {
    id: 'student-4',
    name: 'Beatriz Costa',
    registrationNumber: '2024-0610',
    classGroup: '3º Ano E.M. - Turma B',
    email: 'aluna.beatriz@campus.edu',
    phone: '(11) 99888-1122',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    status: 'ACTIVE',
    defaultTuition: 750.00,
    currentConsumptionBalance: 64.00,
    totalOpenDebt: 64.00,
    payerRule: 'BOTH',
    reportRecipientRule: 'BOTH',
    dueReminderRecipientRule: 'BOTH',
    paymentConfirmationRecipientRule: 'BOTH',
    allowedChannels: ['WHATSAPP', 'EMAIL'],
    guardians: [],
    createdAt: '2026-02-15T08:00:00Z'
  }
];

export const initialProducts: Product[] = [
  {
    id: 'prod-1',
    name: 'Suco Natural de Laranja 300ml',
    category: 'Bebidas',
    price: 7.50,
    internalCode: 'BEB-001',
    barcode: '7891000101',
    currentStock: 34,
    minStock: 10,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-2',
    name: 'Pão de Queijo Mineiro Artesanal',
    category: 'Salgados & Lanches',
    price: 6.00,
    internalCode: 'SAL-002',
    barcode: '7891000102',
    currentStock: 48,
    minStock: 15,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-3',
    name: 'Sanduíche Natural Peito de Frango',
    category: 'Salgados & Lanches',
    price: 12.00,
    internalCode: 'SAL-003',
    barcode: '7891000103',
    currentStock: 18,
    minStock: 8,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-4',
    name: 'Água Mineral sem Gás 500ml',
    category: 'Bebidas',
    price: 4.00,
    internalCode: 'BEB-004',
    barcode: '7891000104',
    currentStock: 65,
    minStock: 20,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-5',
    name: 'Brownie Artesanal Chocolate Belga',
    category: 'Doces & Sobremesas',
    price: 8.50,
    internalCode: 'DOC-005',
    barcode: '7891000105',
    currentStock: 22,
    minStock: 10,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-6',
    name: 'Barra de Cereal Nuts & Cacau',
    category: 'Doces & Sobremesas',
    price: 4.50,
    internalCode: 'DOC-006',
    barcode: '7891000106',
    currentStock: 40,
    minStock: 12,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-7',
    name: 'Caderno Universitário 10 Matérias Campus',
    category: 'Papelaria & Material',
    price: 28.90,
    internalCode: 'PAP-007',
    barcode: '7891000107',
    currentStock: 14,
    minStock: 6,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-8',
    name: 'Caneta Esferográfica Gel Ponta 0.5',
    category: 'Papelaria & Material',
    price: 5.50,
    internalCode: 'PAP-008',
    barcode: '7891000108',
    currentStock: 85,
    minStock: 25,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-9',
    name: 'Camisa Polo Oficial Campus',
    category: 'Uniformes & Merch',
    price: 89.00,
    internalCode: 'UNI-009',
    barcode: '7891000109',
    currentStock: 4, // Abaixo do mínimo! Gatilho de alerta
    minStock: 8,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  },
  {
    id: 'prod-10',
    name: 'Garrafa Térmica Inox Campus 600ml',
    category: 'Uniformes & Merch',
    price: 55.00,
    internalCode: 'UNI-010',
    barcode: '7891000110',
    currentStock: 0, // Esgotado! Bloqueio de venda ativo
    minStock: 5,
    status: 'ACTIVE',
    unit: 'un',
    createdAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-10-20T08:00:00Z'
  }
];

export const initialStockMovements: StockMovement[] = [
  {
    id: 'mov-1',
    productId: 'prod-9',
    productName: 'Camisa Polo Oficial Campus',
    type: 'SAIDA_VENDA',
    quantity: -1,
    previousStock: 5,
    newStock: 4,
    reason: 'Venda caixa balcão - VEN-2026-1002',
    performedByUserId: 'user-cashier',
    performedByUserName: 'Roberto Silveira',
    referenceId: 'VEN-2026-1002',
    timestamp: '2026-10-28T14:32:00Z'
  },
  {
    id: 'mov-2',
    productId: 'prod-1',
    productName: 'Suco Natural de Laranja 300ml',
    type: 'ENTRADA',
    quantity: 40,
    previousStock: 0,
    newStock: 40,
    reason: 'Remessa fornecedor Fazenda Boa Vista NF 4912',
    performedByUserId: 'user-admin',
    performedByUserName: 'Mariana Vasconcelos',
    timestamp: '2026-10-20T09:00:00Z'
  }
];

export const initialSales: Sale[] = [
  {
    id: 'VEN-2026-1001',
    studentId: 'student-1',
    studentName: 'Lucas Andrade',
    registrationNumber: '2024-0412',
    items: [
      {
        productId: 'prod-1',
        name: 'Suco Natural de Laranja 300ml',
        category: 'Bebidas',
        unitPrice: 7.50,
        quantity: 1,
        subtotal: 7.50
      },
      {
        productId: 'prod-2',
        name: 'Pão de Queijo Mineiro Artesanal',
        category: 'Salgados & Lanches',
        unitPrice: 6.00,
        quantity: 2,
        subtotal: 12.00
      }
    ],
    total: 19.50,
    operatorUserId: 'user-cashier',
    operatorUserName: 'Roberto Silveira',
    status: 'COMPLETED',
    billingPeriod: '2026-10',
    createdAt: '2026-10-27T10:15:00Z'
  },
  {
    id: 'VEN-2026-1002',
    studentId: 'student-1',
    studentName: 'Lucas Andrade',
    registrationNumber: '2024-0412',
    items: [
      {
        productId: 'prod-3',
        name: 'Sanduíche Natural Peito de Frango',
        category: 'Salgados & Lanches',
        unitPrice: 12.00,
        quantity: 1,
        subtotal: 12.00
      },
      {
        productId: 'prod-5',
        name: 'Brownie Artesanal Chocolate Belga',
        category: 'Doces & Sobremesas',
        unitPrice: 8.50,
        quantity: 1,
        subtotal: 8.50
      },
      {
        productId: 'prod-8',
        name: 'Caneta Esferográfica Gel Ponta 0.5',
        category: 'Papelaria & Material',
        unitPrice: 2.50,
        quantity: 1,
        subtotal: 2.50
      }
    ],
    total: 23.00,
    operatorUserId: 'user-cashier',
    operatorUserName: 'Roberto Silveira',
    status: 'COMPLETED',
    billingPeriod: '2026-10',
    createdAt: '2026-10-28T15:40:00Z'
  },
  {
    id: 'VEN-2026-1003',
    studentId: 'student-2',
    studentName: 'Sofia Andrade',
    registrationNumber: '2024-0413',
    items: [
      {
        productId: 'prod-7',
        name: 'Caderno Universitário 10 Matérias Campus',
        category: 'Papelaria & Material',
        unitPrice: 28.90,
        quantity: 1,
        subtotal: 28.90
      }
    ],
    total: 28.90,
    operatorUserId: 'user-cashier',
    operatorUserName: 'Roberto Silveira',
    status: 'REVERSED',
    reversedReason: 'Item registrado por engano pelo operador do caixa',
    reversedByUserName: 'Roberto Silveira',
    reversedAt: '2026-10-28T16:00:00Z',
    billingPeriod: '2026-10',
    createdAt: '2026-10-28T15:50:00Z'
  },
  {
    id: 'VEN-2026-1004',
    studentId: 'student-2',
    studentName: 'Sofia Andrade',
    registrationNumber: '2024-0413',
    items: [
      {
        productId: 'prod-1',
        name: 'Suco Natural de Laranja 300ml',
        category: 'Bebidas',
        unitPrice: 7.50,
        quantity: 2,
        subtotal: 15.00
      },
      {
        productId: 'prod-3',
        name: 'Sanduíche Natural Peito de Frango',
        category: 'Salgados & Lanches',
        unitPrice: 12.00,
        quantity: 1,
        subtotal: 12.00
      }
    ],
    total: 27.00,
    operatorUserId: 'user-cashier',
    operatorUserName: 'Roberto Silveira',
    status: 'COMPLETED',
    billingPeriod: '2026-10',
    createdAt: '2026-10-29T09:30:00Z'
  }
];

export const initialFinancialLedger: FinancialTransaction[] = [
  {
    id: 'LED-001',
    timestamp: '2026-10-01T00:00:00Z',
    studentId: 'student-1',
    type: 'DEBITO',
    category: 'MENSALIDADE',
    amount: 750.00,
    description: 'Mensalidade escolar Outubro/2026',
    performedByUserName: 'Sistema Automático'
  },
  {
    id: 'LED-002',
    timestamp: '2026-10-27T10:15:00Z',
    studentId: 'student-1',
    type: 'DEBITO',
    category: 'CONSUMO_LOJINHA',
    amount: 19.50,
    description: 'Consumo Lojinha - Cupom VEN-2026-1001',
    documentRef: 'VEN-2026-1001',
    performedByUserName: 'Roberto Silveira'
  },
  {
    id: 'LED-003',
    timestamp: '2026-10-28T15:40:00Z',
    studentId: 'student-1',
    type: 'DEBITO',
    category: 'CONSUMO_LOJINHA',
    amount: 23.00,
    description: 'Consumo Lojinha - Cupom VEN-2026-1002',
    documentRef: 'VEN-2026-1002',
    performedByUserName: 'Roberto Silveira'
  },
  {
    id: 'LED-004',
    timestamp: '2026-10-29T09:30:00Z',
    studentId: 'student-2',
    type: 'DEBITO',
    category: 'CONSUMO_LOJINHA',
    amount: 27.00,
    description: 'Consumo Lojinha - Cupom VEN-2026-1004',
    documentRef: 'VEN-2026-1004',
    performedByUserName: 'Roberto Silveira'
  }
];

export const initialInvoices: Invoice[] = [
  {
    id: 'FAT-2026-09-001',
    studentId: 'student-1',
    studentName: 'Lucas Andrade',
    registrationNumber: '2024-0412',
    billingPeriod: '2026-09',
    tuitionAmount: 750.00,
    canteenConsumptionTotal: 84.50,
    previousBalance: 0.00,
    adjustmentsTotal: 0.00,
    grossTotal: 834.50,
    paidTotal: 834.50,
    remainingBalance: 0.00,
    closingDate: '2026-09-30',
    dueDate: '2026-10-10',
    status: 'PAGA',
    salesIds: ['VEN-2026-0941', 'VEN-2026-0955'],
    consumptionItems: [
      {
        productId: 'prod-1',
        productName: 'Suco Natural de Laranja 300ml',
        category: 'Bebidas',
        quantity: 6,
        averageUnitPrice: 7.50,
        totalAmount: 45.00
      },
      {
        productId: 'prod-2',
        productName: 'Pão de Queijo Mineiro Artesanal',
        category: 'Salgados & Lanches',
        quantity: 5,
        averageUnitPrice: 6.00,
        totalAmount: 30.00
      },
      {
        productId: 'prod-5',
        productName: 'Brownie Artesanal Chocolate Belga',
        category: 'Doces & Sobremesas',
        quantity: 1,
        averageUnitPrice: 8.50,
        totalAmount: 9.50
      }
    ],
    paymentAllocations: [
      {
        paymentId: 'PIX-2026-0701',
        amount: 834.50,
        payerName: 'Dra. Cláudia Andrade',
        payerType: 'RESPONSAVEL',
        date: '2026-10-08T11:20:00Z'
      }
    ],
    pixCopyPasteCode: '00020126580014br.gov.bcb.pix0136financeiro@campus.edu.br5204000053039865406834.505802BR5925CAMPUS EDUCACIONAL6009SAO PAULO62070503***6304D1A4',
    pixQrCodePayload: '00020126580014br.gov.bcb.pix0136financeiro@campus.edu.br5204000053039865406834.505802BR5925CAMPUS EDUCACIONAL6009SAO PAULO62070503***6304D1A4',
    approvedByUserName: 'Mariana Vasconcelos',
    approvedAt: '2026-09-30T18:00:00Z',
    publishedAt: '2026-09-30T18:30:00Z',
    createdAt: '2026-09-30T17:00:00Z',
    updatedAt: '2026-10-08T11:25:00Z'
  }
];

export const initialPixPayments: PixPayment[] = [
  {
    id: 'PIX-2026-0901',
    invoiceId: 'FAT-2026-09-001',
    invoiceCode: 'FAT-2026-09-001',
    studentId: 'student-1',
    studentName: 'Lucas Andrade',
    payerName: 'Dra. Cláudia Andrade',
    payerRole: 'RESPONSAVEL',
    amount: 834.50,
    transactionReference: 'E18423891202610081120KLP834',
    receiptAttachment: 'Comprovante_PIX_BancoDoBrasil_834_50.pdf',
    receiptNotes: 'Transferência Pix liquidada via App BB com chave e-mail da escola.',
    status: 'CONFIRMADO',
    registeredByUserId: 'user-guardian-claudia',
    registeredByUserName: 'Dra. Cláudia Andrade',
    registeredAt: '2026-10-08T11:20:00Z',
    reviewedByUserId: 'user-admin',
    reviewedByUserName: 'Mariana Vasconcelos',
    reviewedAt: '2026-10-08T11:25:00Z',
    reviewDecisionReason: 'Crédito de R$ 834,50 localizado no extrato bancário oficial.'
  }
];

export const initialWhatsAppNotifications: WhatsAppNotification[] = [
  {
    id: 'WPP-001',
    type: 'NOVA_FATURA',
    recipientName: 'Dra. Cláudia Andrade',
    recipientPhone: '(11) 98111-2233',
    recipientRole: 'RESPONSAVEL',
    studentName: 'Lucas Andrade',
    studentId: 'student-1',
    invoiceId: 'FAT-2026-09-001',
    messageText: 'Olá Cláudia! A fatura de Setembro/2026 do aluno Lucas Andrade já está disponível para conferência. Valor: R$ 834,50 (Mensalidade + Consumo Lojinha). Vencimento: 10/10/2026. Acesse o portal: https://campus.edu.br/portal',
    status: 'ENTREGUE',
    scheduledFor: '2026-09-30T19:00:00Z',
    sentAt: '2026-09-30T19:01:14Z',
    attemptsCount: 1
  },
  {
    id: 'WPP-002',
    type: 'CONFIRMACAO_PAGAMENTO',
    recipientName: 'Dra. Cláudia Andrade',
    recipientPhone: '(11) 98111-2233',
    recipientRole: 'RESPONSAVEL',
    studentName: 'Lucas Andrade',
    studentId: 'student-1',
    invoiceId: 'FAT-2026-09-001',
    messageText: 'Recebimento Pix confirmado! Recebemos com sucesso o pagamento de R$ 834,50 ref. à fatura FAT-2026-09-001 de Lucas Andrade. A fatura foi liquidada. Obrigado!',
    status: 'ENTREGUE',
    scheduledFor: '2026-10-08T11:25:00Z',
    sentAt: '2026-10-08T11:25:30Z',
    attemptsCount: 1
  },
  {
    id: 'WPP-003',
    type: 'ALERTA_ESTOQUE',
    recipientName: 'Mariana Vasconcelos',
    recipientPhone: '(11) 98765-4321',
    recipientRole: 'ADMIN',
    studentName: 'Estoque da Lojinha',
    messageText: '⚠️ Alerta de Estoque Baixo: O produto "Camisa Polo Oficial Campus" atingiu 4 unidades (mínimo: 8). Favor programar reposição.',
    status: 'ENTREGUE',
    scheduledFor: '2026-10-28T14:35:00Z',
    sentAt: '2026-10-28T14:35:10Z',
    attemptsCount: 1
  }
];

export const initialAuditLogs: AuditLog[] = [
  {
    id: 'AUD-001',
    timestamp: '2026-10-28T14:32:00Z',
    userId: 'user-cashier',
    userName: 'Roberto Silveira',
    userRole: 'CASHIER',
    action: 'REGISTRO_VENDA_PDV',
    module: 'VENDAS',
    details: 'Venda VEN-2026-1002 realizada para aluno Lucas Andrade (total: R$ 23,00, 3 itens debitados do estoque)',
    status: 'SUCESSO'
  },
  {
    id: 'AUD-002',
    timestamp: '2026-10-28T16:00:00Z',
    userId: 'user-cashier',
    userName: 'Roberto Silveira',
    userRole: 'CASHIER',
    action: 'ESTORNO_VENDA_PDV',
    module: 'VENDAS',
    details: 'Venda VEN-2026-1003 estornada (Motivo: Item registrado por engano). Estoque reestabelecido.',
    status: 'SUCESSO'
  },
  {
    id: 'AUD-003',
    timestamp: '2026-10-28T16:05:00Z',
    userId: 'user-admin',
    userName: 'Mariana Vasconcelos',
    userRole: 'ADMIN',
    action: 'AUDITORIA_ESTOQUE',
    module: 'ESTOQUE',
    details: 'Consulta ao relatório de produtos críticos. Notificação de estoque baixo disparada.',
    status: 'SUCESSO'
  }
];
