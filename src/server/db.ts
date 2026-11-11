import fs from 'fs';
import path from 'path';
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
  SystemSettings,
  MonthlyClosingPreview,
  ProductCategory
} from '../types/index.ts';
import { generateBacenPixPayload } from '../utils/pix.ts';
import { getInitialsAvatar } from '../utils/avatar.ts';
import { 
  initialUsers, 
  initialGuardians, 
  initialStudents, 
  initialProducts, 
  initialStockMovements, 
  initialSales, 
  initialFinancialLedger, 
  initialInvoices, 
  initialPixPayments, 
  initialWhatsAppNotifications, 
  initialAuditLogs, 
  initialSettings,
  slugifyUsername,
  slugifyEmail
} from './seedData.ts';

export interface DatabaseSchema {
  settings: SystemSettings;
  users: User[];
  guardians: Guardian[];
  students: Student[];
  products: Product[];
  stockMovements: StockMovement[];
  sales: Sale[];
  financialLedger: FinancialTransaction[];
  invoices: Invoice[];
  pixPayments: PixPayment[];
  whatsappNotifications: WhatsAppNotification[];
  auditLogs: AuditLog[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'base44_db.json');

class DatabaseService {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);

        // Verificar se a base ainda contém os alunos fictícios antigos (ex: Lucas Andrade) e migrar para os 17 alunos da 10ª Turma
        const existingStudents: Student[] = Array.isArray(parsed.students) ? parsed.students : [];
        const hasOldFictionalStudents = existingStudents.some(s => s.name === 'Lucas Andrade' || s.name === 'Sofia Andrade');
        const hasAllDecimaTurma = initialStudents.every(seedSt =>
          existingStudents.some(s => s.name.toLowerCase() === seedSt.name.toLowerCase())
        );

        let finalStudents = existingStudents;
        let finalSales = parsed.sales || initialSales;
        let finalInvoices = parsed.invoices || initialInvoices;
        let finalLedger = parsed.financialLedger || initialFinancialLedger;
        let needsSave = false;

        if (hasOldFictionalStudents || !hasAllDecimaTurma) {
          finalStudents = initialStudents.map(seedSt => {
            const match = existingStudents.find(s => s.name.toLowerCase() === seedSt.name.toLowerCase());
            if (match) {
              return {
                ...seedSt,
                ...match,
                name: seedSt.name,
                registrationNumber: seedSt.registrationNumber,
                classGroup: '10ª Turma • Escola de Cristo (Formatura 27 a 30)',
                avatar: match.avatar || seedSt.avatar,
              };
            }
            return seedSt;
          });
          if (hasOldFictionalStudents) {
            finalSales = [];
            finalInvoices = [];
            finalLedger = [];
          }
          needsSave = true;
        }

        // Atualizar avatares SVG antigos e garantir vínculo com responsável e e-mail institucional ICEVES
        finalStudents = finalStudents.map(st => {
          let updatedSt = { ...st };
          if (
            !updatedSt.avatar ||
            (updatedSt.avatar.startsWith('data:image/svg+xml') &&
              (updatedSt.avatar.includes('6366F1') || updatedSt.avatar.includes('8B5CF6') || updatedSt.avatar.includes('4F46E5') || updatedSt.avatar.includes('7C3AED')))
          ) {
            needsSave = true;
            updatedSt.avatar = getInitialsAvatar(updatedSt.name);
          }
          if (!Array.isArray(updatedSt.guardians) || updatedSt.guardians.length === 0) {
            needsSave = true;
            updatedSt.guardians = [
              {
                guardianId: 'guardian-1',
                relationship: 'Responsável',
                isPrimaryPayer: true,
                canAccessPortal: true
              }
            ];
          }
          return updatedSt;
        });

        const loadedSettings: SystemSettings = {
          ...initialSettings,
          ...(parsed.settings || {}),
          institutionName:
            !parsed.settings?.institutionName || parsed.settings.institutionName === 'Lojinha Iceves' || parsed.settings.institutionName.includes('Campus')
              ? 'Escola de Cristo - ICEVES'
              : parsed.settings.institutionName,
          storeName: parsed.settings?.storeName || 'Lojinha Iceves',
          tuitionBillingActive: false,
          defaultTuitionAmount: 0,
          cohortsPerSemester: 1,
        };

        // Migração de produtos para as 4 categorias oficiais:
        // 'Alimentícios' | 'Papelaria' | 'Produtos de Limpeza' | 'Cosméticos'
        // e estruturação de até 3 imagens por produto
        const VALID_CATEGORIES: ProductCategory[] = ['Alimentícios', 'Papelaria', 'Produtos de Limpeza', 'Cosméticos'];
        let productsNeedsSave = false;
        let finalProducts: Product[] = (parsed.products || initialProducts).map((p: any) => {
          let cat: ProductCategory = 'Alimentícios';
          if (p.category === 'Papelaria' || p.category === 'Papelaria & Material') {
            cat = 'Papelaria';
          } else if (p.category === 'Produtos de Limpeza') {
            cat = 'Produtos de Limpeza';
          } else if (p.category === 'Cosméticos') {
            cat = 'Cosméticos';
          } else {
            cat = 'Alimentícios';
          }

          if (p.category !== cat) {
            productsNeedsSave = true;
          }

          let images: string[] = [];
          if (Array.isArray(p.images) && p.images.length > 0) {
            images = p.images.filter(Boolean).slice(0, 3);
          } else if (p.imageUrl) {
            images = [p.imageUrl];
          }

          return {
            ...p,
            category: cat,
            images,
            imageUrl: images[0] || p.imageUrl || undefined,
          };
        });

        // Garantir unicidade absoluta de IDs em finalProducts
        const seenProductIds = new Set<string>();
        const uniqueProducts: Product[] = [];
        for (const p of finalProducts) {
          if (!seenProductIds.has(p.id)) {
            seenProductIds.add(p.id);
            uniqueProducts.push(p);
          } else {
            // Se encontrar ID duplicado, gera novo ID sequencial único
            let counter = 1;
            let uniqueId = `${p.id}-alt-${counter}`;
            while (seenProductIds.has(uniqueId)) {
              counter++;
              uniqueId = `${p.id}-alt-${counter}`;
            }
            seenProductIds.add(uniqueId);
            uniqueProducts.push({
              ...p,
              id: uniqueId,
            });
            productsNeedsSave = true;
          }
        }
        finalProducts = uniqueProducts;

        // Se faltar itens em 'Produtos de Limpeza' ou 'Cosméticos', adiciona os da semente com verificação de unicidade
        const presentCategories = new Set(finalProducts.map(p => p.category));
        for (const cat of VALID_CATEGORIES) {
          if (!presentCategories.has(cat)) {
            const seedItems = initialProducts.filter(p => p.category === cat);
            for (const item of seedItems) {
              let itemId = item.id;
              if (seenProductIds.has(itemId)) {
                let counter = 1;
                while (seenProductIds.has(`${itemId}-${counter}`)) {
                  counter++;
                }
                itemId = `${itemId}-${counter}`;
              }
              seenProductIds.add(itemId);
              finalProducts.push({ ...item, id: itemId });
            }
            productsNeedsSave = true;
          }
        }

        if (productsNeedsSave) {
          needsSave = true;
        }

        // Garantir que todos os perfis reais (Admin, Caixa, Responsável e os 17 Alunos da 10ª Turma) tenham usuário e senha estruturados
        const existingUsers: User[] = Array.isArray(parsed.users) ? parsed.users : [];
        const baseRoles = initialUsers.filter(u => u.role !== 'STUDENT');
        const finalUsers: User[] = [];

        for (const seedStaff of baseRoles) {
          const found = existingUsers.find(u => u.id === seedStaff.id || u.role === seedStaff.role);
          if (!found || !found.username || !found.password) {
            needsSave = true;
          }
          finalUsers.push({
            ...seedStaff,
            lastLogin: found?.lastLogin,
            password: found?.password || seedStaff.password,
            username: seedStaff.username,
            email: seedStaff.email,
            avatar: getInitialsAvatar(seedStaff.name),
          });
        }

        // Vincular cada um dos 17 alunos (e eventuais alunos extras) a uma conta de usuário individual real
        finalStudents.forEach((st, idx) => {
          const num = idx + 1;
          const uname = slugifyUsername(st.name);
          const instEmail = `${uname}@iceves.com.br`;
          const foundUser = existingUsers.find(
            u => u.studentId === st.id || u.id === `user-student-${num}` || u.name.toLowerCase() === st.name.toLowerCase()
          );

          if (!foundUser || !foundUser.username || !foundUser.password || !foundUser.registrationNumber) {
            needsSave = true;
          }

          finalUsers.push({
            id: foundUser?.id || `user-student-${num}`,
            name: st.name,
            username: foundUser?.username || uname,
            email: instEmail,
            password: foundUser?.password || `Aluno@${1000 + num}`,
            role: 'STUDENT',
            studentId: st.id,
            registrationNumber: st.registrationNumber,
            phone: st.phone,
            avatar: st.avatar || getInitialsAvatar(st.name),
            createdAt: foundUser?.createdAt || st.createdAt,
            lastLogin: foundUser?.lastLogin,
          });
        });

        const loadedData: DatabaseSchema = {
          settings: loadedSettings,
          users: finalUsers,
          guardians: hasOldFictionalStudents ? initialGuardians : (parsed.guardians || initialGuardians),
          students: finalStudents,
          products: finalProducts,
          stockMovements: parsed.stockMovements || initialStockMovements,
          sales: finalSales,
          financialLedger: finalLedger,
          invoices: finalInvoices,
          pixPayments: parsed.pixPayments || initialPixPayments,
          whatsappNotifications: parsed.whatsappNotifications || initialWhatsAppNotifications,
          auditLogs: parsed.auditLogs || initialAuditLogs,
        };

        if (needsSave) {
          this.saveDatabase(loadedData);
        }

        return loadedData;
      }
    } catch (err) {
      console.error('Erro ao ler base de dados JSON, iniciando com dados semente:', err);
    }

    const defaultData: DatabaseSchema = {
      settings: initialSettings,
      users: initialUsers,
      guardians: initialGuardians,
      students: initialStudents,
      products: initialProducts,
      stockMovements: initialStockMovements,
      sales: initialSales,
      financialLedger: initialFinancialLedger,
      invoices: initialInvoices,
      pixPayments: initialPixPayments,
      whatsappNotifications: initialWhatsAppNotifications,
      auditLogs: initialAuditLogs,
    };

    this.saveDatabase(defaultData);
    return defaultData;
  }

  private saveDatabase(dataToSave: DatabaseSchema = this.data) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Atomic write via temp file
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Falha ao persistir base de dados:', err);
    }
  }

  // Helper de auditoria
  public logAudit(
    userId: string, 
    userName: string, 
    userRole: any, 
    action: string, 
    module: any, 
    details: string, 
    status: 'SUCESSO' | 'FALHA' = 'SUCESSO'
  ) {
    const log: AuditLog = {
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      userRole,
      action,
      module,
      details,
      status
    };
    this.data.auditLogs.unshift(log);
    // Keep max 500 audit logs
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.saveDatabase();
    this.triggerSupabaseSync('audit_logs', log, 'mapAuditLogToSupabase');
  }

  public triggerSupabaseSync(table: string, record: any, mapperName: string) {
    setTimeout(async () => {
      try {
        const supabaseMod = await import('./supabase.ts');
        const mapper = (supabaseMod as any)[mapperName];
        await supabaseMod.syncRecordToSupabase(table, record, mapper);
      } catch (e) {
        // quiet background auto-sync
      }
    }, 0);
  }

  // --- GETTERS ---
  public getSettings(): SystemSettings {
    return this.data.settings;
  }

  public getUsers(): User[] {
    return this.data.users;
  }

  public getStudents(): Student[] {
    return this.data.students;
  }

  public getGuardians(): Guardian[] {
    return this.data.guardians;
  }

  public getProducts(): Product[] {
    return this.data.products;
  }

  public getSales(): Sale[] {
    return this.data.sales;
  }

  public getStockMovements(): StockMovement[] {
    return this.data.stockMovements;
  }

  public getInvoices(): Invoice[] {
    return this.data.invoices;
  }

  public getPixPayments(): PixPayment[] {
    return this.data.pixPayments;
  }

  public getWhatsAppNotifications(): WhatsAppNotification[] {
    return this.data.whatsappNotifications;
  }

  public getAuditLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  public getFinancialLedger(): FinancialTransaction[] {
    return this.data.financialLedger;
  }

  // --- REGRAS DE NEGÓCIO ---

  // 1. Atualizar configurações
  public updateSettings(newSettings: Partial<SystemSettings>, user: { id: string; name: string; role: any }) {
    this.data.settings = {
      ...this.data.settings,
      ...newSettings,
      updatedAt: new Date().toISOString(),
      updatedByUserName: user.name
    };
    this.logAudit(user.id, user.name, user.role, 'ATUALIZAR_CONFIGURACOES', 'CONFIGURACOES', 'Parâmetros de fechamento e sistema atualizados');
    this.saveDatabase();
    this.triggerSupabaseSync('settings', this.data.settings, 'mapSettingsToSupabase');
    return this.data.settings;
  }

  // 2. Operação de Venda no PDV (Caixa Rápido)
  public registerSale(params: {
    studentId: string;
    items: { productId: string; quantity: number }[];
    operatorUser: { id: string; name: string; role: any };
    idempotencyKey?: string;
  }): { sale: Sale; student: Student } {
    const { studentId, items, operatorUser, idempotencyKey } = params;

    // Idempotency check
    if (idempotencyKey) {
      const existingSale = this.data.sales.find(s => s.idempotencyKey === idempotencyKey);
      if (existingSale) {
        const student = this.data.students.find(s => s.id === studentId)!;
        return { sale: existingSale, student };
      }
    }

    const student = this.data.students.find(s => s.id === studentId);
    if (!student) {
      throw new Error(`Aluno com ID ${studentId} não encontrado.`);
    }

    if (student.status !== 'ACTIVE') {
      throw new Error(`O aluno ${student.name} está inativo e não pode realizar compras.`);
    }

    if (!items || items.length === 0) {
      throw new Error('A venda deve conter pelo menos 1 item.');
    }

    // Conferência e bloqueio de estoque
    const saleItems: Sale['items'] = [];
    let saleTotal = 0;

    for (const item of items) {
      const product = this.data.products.find(p => p.id === item.productId);
      if (!product) {
        throw new Error(`Produto ID ${item.productId} não encontrado.`);
      }

      if (this.data.settings.stockControlActive && this.data.settings.blockSaleWithoutStock) {
        if (product.currentStock < item.quantity) {
          throw new Error(`Estoque insuficiente para o produto "${product.name}". Disponível: ${product.currentStock}, Solicitado: ${item.quantity}`);
        }
      }

      const subtotal = Math.round((product.price * item.quantity) * 100) / 100;
      saleTotal += subtotal;

      saleItems.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        unitPrice: product.price, // PRESERVA PREÇO HISTÓRICO
        quantity: item.quantity,
        subtotal
      });
    }

    saleTotal = Math.round(saleTotal * 100) / 100;

    const currentPeriod = new Date().toISOString().substring(0, 7); // e.g. '2026-10'
    const saleId = `VEN-${Date.now().toString().slice(-6)}`;

    // Criar registro de venda
    const newSale: Sale = {
      id: saleId,
      studentId: student.id,
      studentName: student.name,
      registrationNumber: student.registrationNumber,
      items: saleItems,
      total: saleTotal,
      operatorUserId: operatorUser.id,
      operatorUserName: operatorUser.name,
      status: 'COMPLETED',
      billingPeriod: currentPeriod,
      idempotencyKey,
      createdAt: new Date().toISOString()
    };

    // Atualizar estoque e gerar movimentações
    for (const item of saleItems) {
      const product = this.data.products.find(p => p.id === item.productId)!;
      const prevStock = product.currentStock;
      product.currentStock = Math.max(0, product.currentStock - item.quantity);
      product.updatedAt = new Date().toISOString();

      const movement: StockMovement = {
        id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productId: product.id,
        productName: product.name,
        type: 'SAIDA_VENDA',
        quantity: -item.quantity,
        previousStock: prevStock,
        newStock: product.currentStock,
        reason: `Venda ${newSale.id} - Aluno: ${student.name}`,
        performedByUserId: operatorUser.id,
        performedByUserName: operatorUser.name,
        referenceId: newSale.id,
        timestamp: new Date().toISOString()
      };
      this.data.stockMovements.unshift(movement);

      // Checar se disparar alerta de estoque baixo
      if (product.currentStock <= product.minStock) {
        this.data.whatsappNotifications.unshift({
          id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 100)}`,
          type: 'ALERTA_ESTOQUE',
          recipientName: 'Coordenação Lojinha',
          recipientPhone: '(11) 98765-4321',
          recipientRole: 'ADMIN',
          studentName: 'Estoque da Lojinha',
          messageText: `⚠️ Atenção: O item "${product.name}" atingiu ${product.currentStock} ${product.unit} (estoque mínimo: ${product.minStock}).`,
          status: 'ENTREGUE',
          scheduledFor: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          attemptsCount: 1
        });
      }
    }

    // Atualizar saldo do aluno (Todo consumo vai para a conta mensal)
    student.currentConsumptionBalance = Math.round((student.currentConsumptionBalance + saleTotal) * 100) / 100;
    student.totalOpenDebt = Math.round((student.totalOpenDebt + saleTotal) * 100) / 100;

    // Criar lançamento no livro financeiro
    this.data.financialLedger.unshift({
      id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      timestamp: new Date().toISOString(),
      studentId: student.id,
      type: 'DEBITO',
      category: 'CONSUMO_LOJINHA',
      amount: saleTotal,
      description: `Consumo Lojinha - Venda ${newSale.id} (${saleItems.length} itens)`,
      documentRef: newSale.id,
      performedByUserName: operatorUser.name
    });

    this.data.sales.unshift(newSale);

    this.logAudit(
      operatorUser.id,
      operatorUser.name,
      operatorUser.role,
      'REGISTRO_VENDA_PDV',
      'VENDAS',
      `Venda ${newSale.id} (R$ ${saleTotal.toFixed(2)}) para o aluno ${student.name} registrada na conta mensal.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('sales', newSale, 'mapSaleToSupabase');
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    return { sale: newSale, student };
  }

  // 3. Estorno de Venda no PDV
  public reverseSale(saleId: string, reason: string, user: { id: string; name: string; role: any }) {
    const sale = this.data.sales.find(s => s.id === saleId);
    if (!sale) {
      throw new Error(`Venda ${saleId} não encontrada.`);
    }

    if (sale.status === 'REVERSED') {
      throw new Error(`A venda ${saleId} já foi estornada anteriormente.`);
    }

    const student = this.data.students.find(s => s.id === sale.studentId);
    if (!student) {
      throw new Error(`Aluno associado à venda não encontrado.`);
    }

    // Reverter estoque
    for (const item of sale.items) {
      const product = this.data.products.find(p => p.id === item.productId);
      if (product) {
        const prevStock = product.currentStock;
        product.currentStock += item.quantity;
        product.updatedAt = new Date().toISOString();

        this.data.stockMovements.unshift({
          id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productId: product.id,
          productName: product.name,
          type: 'ESTORNO_VENDA',
          quantity: item.quantity,
          previousStock: prevStock,
          newStock: product.currentStock,
          reason: `Estorno de venda ${sale.id}: ${reason}`,
          performedByUserId: user.id,
          performedByUserName: user.name,
          referenceId: sale.id,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Abater do consumo acumulado
    student.currentConsumptionBalance = Math.max(0, Math.round((student.currentConsumptionBalance - sale.total) * 100) / 100);
    student.totalOpenDebt = Math.max(0, Math.round((student.totalOpenDebt - sale.total) * 100) / 100);

    // Registro no livro financeiro
    this.data.financialLedger.unshift({
      id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      timestamp: new Date().toISOString(),
      studentId: student.id,
      type: 'CREDITO',
      category: 'ESTORNO_VENDA',
      amount: sale.total,
      description: `Estorno de venda ${sale.id} - Motivo: ${reason}`,
      documentRef: sale.id,
      performedByUserName: user.name
    });

    sale.status = 'REVERSED';
    sale.reversedReason = reason;
    sale.reversedByUserName = user.name;
    sale.reversedAt = new Date().toISOString();

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ESTORNO_VENDA_PDV',
      'VENDAS',
      `Estorno da venda ${sale.id} (R$ ${sale.total.toFixed(2)}) de ${student.name}. Motivo: ${reason}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    return { sale, student };
  }

  // 4. Ajuste manual de estoque (Entrada/Saída/Ajuste)
  public adjustStock(params: {
    productId: string;
    type: 'ENTRADA' | 'AJUSTE_MANUAL';
    quantity: number; // For ENTRADA: amount to add. For AJUSTE_MANUAL: absolute new stock
    reason: string;
    user: { id: string; name: string; role: any };
  }) {
    const { productId, type, quantity, reason, user } = params;
    const product = this.data.products.find(p => p.id === productId);
    if (!product) {
      throw new Error(`Produto não encontrado.`);
    }

    const prevStock = product.currentStock;
    let newStock = prevStock;
    let diff = 0;

    if (type === 'ENTRADA') {
      if (quantity <= 0) throw new Error('Quantidade de entrada deve ser maior que zero.');
      newStock = prevStock + quantity;
      diff = quantity;
    } else {
      if (quantity < 0) throw new Error('Estoque não pode ser negativo.');
      newStock = quantity;
      diff = newStock - prevStock;
    }

    product.currentStock = newStock;
    product.updatedAt = new Date().toISOString();

    this.data.stockMovements.unshift({
      id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      productId: product.id,
      productName: product.name,
      type: type,
      quantity: diff,
      previousStock: prevStock,
      newStock: newStock,
      reason,
      performedByUserId: user.id,
      performedByUserName: user.name,
      timestamp: new Date().toISOString()
    });

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'AJUSTE_ESTOQUE',
      'ESTOQUE',
      `Ajuste manual de estoque no produto ${product.name}: ${prevStock} -> ${newStock} (${diff >= 0 ? '+' : ''}${diff}). Motivo: ${reason}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('products', product, 'mapProductToSupabase');
    return product;
  }

  // 5. Salvar / Editar produto (garante que preços de vendas passadas não se alteram)
  public saveProduct(productData: Partial<Product>, user: { id: string; name: string; role: any }) {
    if (productData.id) {
      const idx = this.data.products.findIndex(p => p.id === productData.id);
      if (idx === -1) throw new Error('Produto não encontrado');
      
      const oldPrice = this.data.products[idx].price;
      const images: string[] = Array.isArray(productData.images)
        ? productData.images.filter(Boolean).slice(0, 3)
        : (this.data.products[idx].images || (productData.imageUrl ? [productData.imageUrl] : []));

      this.data.products[idx] = {
        ...this.data.products[idx],
        ...productData,
        images,
        imageUrl: images[0] || productData.imageUrl || this.data.products[idx].imageUrl || undefined,
        updatedAt: new Date().toISOString()
      };

      this.logAudit(
        user.id,
        user.name,
        user.role,
        'EDITAR_PRODUTO',
        'ESTOQUE',
        `Produto ${this.data.products[idx].name} editado. Preço anterior: R$ ${oldPrice.toFixed(2)}, Novo preço: R$ ${this.data.products[idx].price.toFixed(2)}`
      );

      this.saveDatabase();
      this.triggerSupabaseSync('products', this.data.products[idx], 'mapProductToSupabase');
      return this.data.products[idx];
    } else {
      const images: string[] = Array.isArray(productData.images)
        ? productData.images.filter(Boolean).slice(0, 3)
        : (productData.imageUrl ? [productData.imageUrl] : []);

      let generatedId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      while (this.data.products.some(p => p.id === generatedId)) {
        generatedId = `prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      }

      const newProduct: Product = {
        id: generatedId,
        name: productData.name || 'Novo Produto',
        category: (productData.category as ProductCategory) || 'Alimentícios',
        price: Number(productData.price) || 0,
        internalCode: productData.internalCode || `INT-${Math.floor(Math.random() * 9000 + 1000)}`,
        barcode: productData.barcode || undefined,
        currentStock: Number(productData.currentStock) || 0,
        minStock: Number(productData.minStock) || 5,
        status: productData.status || 'ACTIVE',
        images,
        imageUrl: images[0] || productData.imageUrl || undefined,
        unit: productData.unit || 'un',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.data.products.push(newProduct);
      this.logAudit(
        user.id,
        user.name,
        user.role,
        'CRIAR_PRODUTO',
        'ESTOQUE',
        `Novo produto cadastrado: ${newProduct.name} (R$ ${newProduct.price.toFixed(2)}) com estoque inicial de ${newProduct.currentStock}`
      );

      this.saveDatabase();
      this.triggerSupabaseSync('products', newProduct, 'mapProductToSupabase');
      return newProduct;
    }
  }

  // 6. Prévia de Fechamento Mensal
  public getMonthlyClosingPreview(period: string): MonthlyClosingPreview {
    // period e.g. '2026-10'
    const eligibleStudents = this.data.students.filter(s => s.status === 'ACTIVE');
    const existingInvoices = this.data.invoices.filter(i => i.billingPeriod === period && i.status !== 'CANCELADA');

    let totalTuitions = 0;
    let totalConsumptions = 0;
    let pendingUnpaidSalesCount = 0;
    const inconsistencies: MonthlyClosingPreview['inconsistencies'] = [];

    // Checar vendas em aberto (não faturadas)
    const unbilledSales = this.data.sales.filter(s => s.status === 'COMPLETED' && !s.invoiceId);
    pendingUnpaidSalesCount = unbilledSales.length;

    const isTuitionEnabled = Boolean(this.data.settings.tuitionBillingActive);

    for (const student of eligibleStudents) {
      const studentTuition = isTuitionEnabled ? (Number(student.defaultTuition) || 0) : 0;
      totalTuitions += studentTuition;

      // Calcular consumo em aberto do aluno na Lojinha
      const studentSales = unbilledSales.filter(s => s.studentId === student.id);
      const salesSum = studentSales.reduce((acc, sale) => acc + sale.total, 0);
      const studentConsumption = Math.max(salesSum, Number(student.currentConsumptionBalance) || 0);
      totalConsumptions += studentConsumption;

      // Inconsistências
      const alreadyHasInvoice = existingInvoices.some(i => i.studentId === student.id);
      if (alreadyHasInvoice) {
        inconsistencies.push({
          studentId: student.id,
          studentName: student.name,
          severity: 'WARNING',
          message: `O aluno já possui cobrança gerada para ${period}. Não será duplicada.`
        });
      }

      if (student.guardians.length === 0 && (student.payerRule === 'GUARDIAN' || student.payerRule === 'GUARDIAN_ONLY')) {
        inconsistencies.push({
          studentId: student.id,
          studentName: student.name,
          severity: 'BLOCKER',
          message: `Aluno configurado como 'Pagamento Exclusivo pelo Responsável', mas não possui responsável vinculado.`
        });
      }
    }

    const totalGrossToBill = Math.round((totalTuitions + totalConsumptions) * 100) / 100;

    return {
      period,
      studentsCount: eligibleStudents.length,
      totalTuitions: Math.round(totalTuitions * 100) / 100,
      totalConsumptions: Math.round(totalConsumptions * 100) / 100,
      totalPreviousBalances: 0,
      totalGrossToBill,
      pendingUnpaidSalesCount,
      existingInvoicesCount: existingInvoices.length,
      inconsistencies,
      canProceed: !inconsistencies.some(inc => inc.severity === 'BLOCKER')
    };
  }

  // 7. Executar Fechamento Mensal e Publicar Faturas
  public executeMonthlyClosing(period: string, user: { id: string; name: string; role: any }) {
    const preview = this.getMonthlyClosingPreview(period);
    if (!preview.canProceed) {
      throw new Error('Não é possível fechar o mês devido a inconsistências impeditivas.');
    }

    const eligibleStudents = this.data.students.filter(s => s.status === 'ACTIVE');
    const createdInvoices: Invoice[] = [];
    const now = new Date();

    // Data de vencimento baseada no offset de configurações
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-12
    
    // Mês seguinte para vencimento
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const dueDay = this.data.settings.dueDayOffset;
    const dueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    const closingDate = `${year}-${String(month).padStart(2, '0')}-28`;

    const isTuitionEnabled = Boolean(this.data.settings.tuitionBillingActive);

    for (const student of eligibleStudents) {
      // PREVENÇÃO DE DUPLICIDADE (Idempotência estrita)
      const existing = this.data.invoices.find(
        i => i.studentId === student.id && i.billingPeriod === period && i.status !== 'CANCELADA'
      );
      if (existing) {
        continue; // Não gerar faturas duplicadas!
      }

      // Vendas não faturadas para este aluno
      const studentSales = this.data.sales.filter(
        s => s.studentId === student.id && s.status === 'COMPLETED' && !s.invoiceId
      );

      const salesSum = studentSales.reduce((acc, s) => acc + s.total, 0);
      const consumptionTotal = Math.max(salesSum, Number(student.currentConsumptionBalance) || 0);
      const tuitionAmount = isTuitionEnabled ? (Number(student.defaultTuition) || 0) : 0;
      const grossTotal = Math.round((tuitionAmount + consumptionTotal) * 100) / 100;

      // Não gerar cobrança zerada (R$ 0,00)
      if (grossTotal <= 0) {
        continue;
      }

      // Agrupar itens de consumo para o extrato da cobrança
      const itemMap = new Map<string, { product: Product | undefined; name: string; category: any; qty: number; total: number }>();
      for (const sale of studentSales) {
        for (const item of sale.items) {
          const key = item.productId;
          const current = itemMap.get(key) || {
            product: this.data.products.find(p => p.id === item.productId),
            name: item.name,
            category: item.category,
            qty: 0,
            total: 0
          };
          current.qty += item.quantity;
          current.total += item.subtotal;
          itemMap.set(key, current);
        }
      }

      const consumptionItems = Array.from(itemMap.entries()).map(([productId, data]) => ({
        productId,
        productName: data.name,
        category: data.category,
        quantity: data.qty,
        averageUnitPrice: data.qty > 0 ? Math.round((data.total / data.qty) * 100) / 100 : 0,
        totalAmount: Math.round(data.total * 100) / 100
      }));

      const invoiceId = `FAT-${period.replace('-', '')}-${student.registrationNumber.replace('-', '')}`;

      // Vincular vendas a esta cobrança
      for (const sale of studentSales) {
        sale.invoiceId = invoiceId;
      }

      // Montar código Pix Copia e Cola no padrão oficial Bacen EMV
      const pixCode = generateBacenPixPayload({
        pixKey: this.data.settings.pixKey,
        receiverName: this.data.settings.pixReceiverName,
        city: this.data.settings.pixCity,
        amount: grossTotal,
        txId: invoiceId
      });

      const invoice: Invoice = {
        id: invoiceId,
        studentId: student.id,
        studentName: student.name,
        registrationNumber: student.registrationNumber,
        billingPeriod: period,
        tuitionAmount,
        canteenConsumptionTotal: Math.round(consumptionTotal * 100) / 100,
        previousBalance: 0,
        adjustmentsTotal: 0,
        grossTotal,
        paidTotal: 0,
        remainingBalance: grossTotal,
        closingDate,
        dueDate,
        status: 'PUBLICADA',
        salesIds: studentSales.map(s => s.id),
        consumptionItems,
        paymentAllocations: [],
        pixCopyPasteCode: pixCode,
        pixQrCodePayload: pixCode,
        approvedByUserName: user.name,
        approvedAt: now.toISOString(),
        publishedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      createdInvoices.push(invoice);
      this.data.invoices.unshift(invoice);

      // Zerar o saldo de consumo aberto do aluno pois agora está faturado nesta cobrança
      student.currentConsumptionBalance = 0;
      const openInvoicesTotal = this.data.invoices
        .filter(i => i.studentId === student.id && i.status !== 'CANCELADA' && i.status !== 'PAGA')
        .reduce((acc, inv) => acc + inv.remainingBalance, 0);
      student.totalOpenDebt = Math.round(openInvoicesTotal * 100) / 100;

      // Disparar Notificações WhatsApp conforme preferências do Aluno
      this.scheduleInvoiceNotifications(invoice, student);
    }

    if (createdInvoices.length === 0) {
      throw new Error(`Nenhuma cobrança com saldo positivo pendente para gerar na competência ${period}.`);
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'FECHAMENTO_MENSAL_EXECUTADO',
      'FECHAMENTO',
      `Fechamento de ${period} concluído com sucesso. ${createdInvoices.length} cobranças geradas e publicadas.`
    );

    this.saveDatabase();
    createdInvoices.forEach(inv => this.triggerSupabaseSync('invoices', inv, 'mapInvoiceToSupabase'));
    return {
      period,
      invoicesCreated: createdInvoices.length,
      invoices: createdInvoices
    };
  }

  // 7.1 Excluir uma fatura individual
  public deleteInvoice(invoiceId: string, user: { id: string; name: string; role: any }) {
    const idx = this.data.invoices.findIndex(i => i.id === invoiceId);
    if (idx === -1) throw new Error('Cobrança não encontrada.');

    const deleted = this.data.invoices.splice(idx, 1)[0];

    // Desvincular vendas que apontavam para esta fatura
    for (const sale of this.data.sales) {
      if (sale.invoiceId === invoiceId) {
        sale.invoiceId = undefined;
      }
    }

    // Recalcular saldo de consumo aberto e dívida total do aluno
    const student = this.data.students.find(s => s.id === deleted.studentId);
    if (student) {
      const unbilledSalesTotal = this.data.sales
        .filter(s => s.studentId === student.id && s.status === 'COMPLETED' && !s.invoiceId)
        .reduce((acc, s) => acc + s.total, 0);
      student.currentConsumptionBalance = Math.round(unbilledSalesTotal * 100) / 100;

      const remainingOpenInvoices = this.data.invoices.filter(
        i => i.studentId === student.id && i.status !== 'CANCELADA' && i.status !== 'PAGA'
      );
      const openInvoicesTotal = remainingOpenInvoices.reduce((acc, inv) => acc + inv.remainingBalance, 0);
      student.totalOpenDebt = Math.round((openInvoicesTotal + student.currentConsumptionBalance) * 100) / 100;
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'EXCLUIR_FATURA',
      'FATURAMENTO',
      `Cobrança ${deleted.id} do aluno ${deleted.studentName} foi excluída permanentemente.`
    );

    this.saveDatabase();
    return { success: true, deletedId: invoiceId };
  }

  // 7.2 Excluir todas as faturas antigas de todos os estudantes (Deixar a base limpa)
  public clearAllInvoices(user: { id: string; name: string; role: any }) {
    const totalDeleted = this.data.invoices.length;
    this.data.invoices = [];

    // Limpar invoiceId de todas as vendas para que voltem a ser consumo em aberto na Lojinha
    for (const sale of this.data.sales) {
      sale.invoiceId = undefined;
    }

    // Recalcular currentConsumptionBalance e totalOpenDebt de todos os estudantes com base nas vendas reais
    for (const student of this.data.students) {
      const unbilledSalesTotal = this.data.sales
        .filter(s => s.studentId === student.id && s.status === 'COMPLETED' && !s.invoiceId)
        .reduce((acc, s) => acc + s.total, 0);
      student.currentConsumptionBalance = Math.round(unbilledSalesTotal * 100) / 100;
      student.totalOpenDebt = student.currentConsumptionBalance;
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'LIMPAR_TODAS_FATURAS',
      'FATURAMENTO',
      `Todas as ${totalDeleted} faturas foram excluídas de todos os estudantes com sucesso. Saldos de consumo da Lojinha restaurados.`
    );

    this.saveDatabase();
    return { success: true, totalDeleted };
  }

  // Programar notificações WhatsApp respeitando quem deve receber
  private scheduleInvoiceNotifications(invoice: Invoice, student: Student) {
    if (!this.data.settings.whatsappAutoEnabled) return;

    const sendToStudent = student.reportRecipientRule === 'STUDENT' || student.reportRecipientRule === 'STUDENT_ONLY' || student.reportRecipientRule === 'BOTH';
    const sendToGuardian = student.reportRecipientRule === 'GUARDIAN' || student.reportRecipientRule === 'GUARDIAN_ONLY' || student.reportRecipientRule === 'BOTH';

    const detailsText = invoice.tuitionAmount > 0
      ? `(Mensalidade: R$ ${invoice.tuitionAmount.toFixed(2)} + Lojinha: R$ ${invoice.canteenConsumptionTotal.toFixed(2)})`
      : `(Consumo Lojinha Iceves: R$ ${invoice.canteenConsumptionTotal.toFixed(2)})`;

    if (sendToStudent && student.phone) {
      this.data.whatsappNotifications.unshift({
        id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'NOVA_FATURA',
        recipientName: student.name,
        recipientPhone: student.phone,
        recipientRole: 'ALUNO',
        studentName: student.name,
        studentId: student.id,
        invoiceId: invoice.id,
        messageText: `Olá, ${student.name}! Seu fechamento da Lojinha Iceves ref. a ${invoice.billingPeriod} foi emitido. Valor Total: R$ ${invoice.grossTotal.toFixed(2)} ${detailsText}. Vencimento: ${invoice.dueDate}.`,
        status: 'ENTREGUE',
        scheduledFor: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        attemptsCount: 1
      });
    }

    if (sendToGuardian) {
      for (const link of student.guardians) {
        const guardian = this.data.guardians.find(g => g.id === link.guardianId);
        if (guardian && guardian.phone) {
          this.data.whatsappNotifications.unshift({
            id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'NOVA_FATURA',
            recipientName: guardian.name,
            recipientPhone: guardian.phone,
            recipientRole: 'RESPONSAVEL',
            studentName: student.name,
            studentId: student.id,
            invoiceId: invoice.id,
            messageText: `Prezado(a) ${guardian.name}, o fechamento de consumo da Lojinha Iceves de ${student.name} referente a ${invoice.billingPeriod} está disponível. Total: R$ ${invoice.grossTotal.toFixed(2)}. Vencimento: ${invoice.dueDate}.`,
            status: 'ENTREGUE',
            scheduledFor: new Date().toISOString(),
            sentAt: new Date().toISOString(),
            attemptsCount: 1
          });
        }
      }
    }
  }

  // 8. Registro de Intenção de Pagamento via Pix (Aluno ou Responsável envia comprovante)
  public submitPixPayment(params: {
    invoiceId: string;
    amount: number;
    transactionReference: string;
    receiptAttachment?: string;
    receiptNotes?: string;
    user: { id: string; name: string; role: any };
  }) {
    const { invoiceId, amount, transactionReference, receiptAttachment, receiptNotes, user } = params;

    const invoice = this.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    if (amount <= 0) throw new Error('Valor do pagamento deve ser positivo.');
    if (amount > invoice.remainingBalance) {
      throw new Error(`Valor informado (R$ ${amount.toFixed(2)}) é maior que o saldo restante da fatura (R$ ${invoice.remainingBalance.toFixed(2)}).`);
    }

    const payerRole = user.role === 'GUARDIAN' ? 'RESPONSAVEL' : 'ALUNO';

    const pixPayment: PixPayment = {
      id: `PIX-${Date.now().toString().slice(-6)}`,
      invoiceId: invoice.id,
      invoiceCode: invoice.id,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      payerName: user.name,
      payerRole: payerRole as any,
      amount: Math.round(amount * 100) / 100,
      transactionReference,
      receiptAttachment: receiptAttachment || 'Comprovante_Pix_Enviado.pdf',
      receiptNotes,
      status: 'AGUARDANDO_CONFERENCIA',
      registeredByUserId: user.id,
      registeredByUserName: user.name,
      registeredAt: new Date().toISOString()
    };

    this.data.pixPayments.unshift(pixPayment);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ENVIO_COMPROVANTE_PIX',
      'PAGAMENTOS',
      `Comprovante de pagamento Pix ${pixPayment.id} enviado para fatura ${invoice.id} (R$ ${amount.toFixed(2)}) aguardando conferência administrativa.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('pix_payments', pixPayment, 'mapPixPaymentToSupabase');
    return pixPayment;
  }

  // 9. Conferência e Aprovação de Pagamento Pix (Administrador)
  public reviewPixPayment(params: {
    paymentId: string;
    decision: 'APROVADO' | 'REJEITADO';
    reason: string;
    reviewerUser: { id: string; name: string; role: any };
  }) {
    const { paymentId, decision, reason, reviewerUser } = params;
    const payment = this.data.pixPayments.find(p => p.id === paymentId);
    if (!payment) throw new Error('Pagamento não encontrado.');

    if (payment.status !== 'AGUARDANDO_CONFERENCIA') {
      throw new Error(`Este pagamento já foi ${payment.status.toLowerCase()} anteriormente.`);
    }

    const invoice = this.data.invoices.find(i => i.id === payment.invoiceId);
    if (!invoice) throw new Error('Fatura relacionada não encontrada.');

    payment.reviewedByUserId = reviewerUser.id;
    payment.reviewedByUserName = reviewerUser.name;
    payment.reviewedAt = new Date().toISOString();
    payment.reviewDecisionReason = reason;

    if (decision === 'APROVADO') {
      payment.status = 'CONFIRMADO';

      // Atualizar fatura
      invoice.paidTotal = Math.round((invoice.paidTotal + payment.amount) * 100) / 100;
      invoice.remainingBalance = Math.max(0, Math.round((invoice.grossTotal - invoice.paidTotal) * 100) / 100);

      if (invoice.remainingBalance <= 0) {
        invoice.status = 'PAGA';
      } else {
        invoice.status = 'PARCIALMENTE_PAGA';
      }
      invoice.updatedAt = new Date().toISOString();

      // Registrar alocação na fatura
      invoice.paymentAllocations.push({
        paymentId: payment.id,
        amount: payment.amount,
        payerName: payment.payerName,
        payerType: payment.payerRole,
        date: new Date().toISOString()
      });

      // Atualizar saldo total do aluno
      const student = this.data.students.find(s => s.id === invoice.studentId);
      if (student) {
        student.totalOpenDebt = Math.max(0, Math.round((student.totalOpenDebt - payment.amount) * 100) / 100);
      }

      // Registro no livro financeiro
      this.data.financialLedger.unshift({
        id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        timestamp: new Date().toISOString(),
        studentId: invoice.studentId,
        type: 'CREDITO',
        category: 'PAGAMENTO_PIX',
        amount: payment.amount,
        description: `Recebimento Pix ${payment.id} confirmado para fatura ${invoice.id}`,
        invoiceId: invoice.id,
        documentRef: payment.transactionReference,
        performedByUserName: reviewerUser.name
      });

      // Programar confirmação WhatsApp
      if (this.data.settings.whatsappAutoEnabled) {
        this.data.whatsappNotifications.unshift({
          id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'CONFIRMACAO_PAGAMENTO',
          recipientName: payment.payerName,
          recipientPhone: '(11) 98111-2233',
          recipientRole: payment.payerRole,
          studentName: invoice.studentName,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          messageText: `Recebimento confirmado! O valor de R$ ${payment.amount.toFixed(2)} foi processado na fatura ${invoice.id}. Saldo restante da fatura: R$ ${invoice.remainingBalance.toFixed(2)}. Obrigado!`,
          status: 'ENTREGUE',
          scheduledFor: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          attemptsCount: 1
        });
      }

      this.logAudit(
        reviewerUser.id,
        reviewerUser.name,
        reviewerUser.role,
        'APROVACAO_PIX',
        'PAGAMENTOS',
        `Pagamento Pix ${payment.id} de R$ ${payment.amount.toFixed(2)} aprovado para a fatura ${invoice.id}. Novo saldo da fatura: R$ ${invoice.remainingBalance.toFixed(2)}`
      );
    } else {
      payment.status = 'REJEITADO';

      this.logAudit(
        reviewerUser.id,
        reviewerUser.name,
        reviewerUser.role,
        'REJEICAO_PIX',
        'PAGAMENTOS',
        `Pagamento Pix ${payment.id} de R$ ${payment.amount.toFixed(2)} REJEITADO. Motivo: ${reason}`
      );
    }

    this.saveDatabase();
    this.triggerSupabaseSync('pix_payments', payment, 'mapPixPaymentToSupabase');
    if (invoice) this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');
    return { payment, invoice };
  }

  // 10. Atualização de Cadastro, Foto de Perfil e Regras de Aluno
  public updateStudentSettings(studentId: string, updates: Partial<Student>, user: { id: string; name: string; role: any }) {
    const student = this.data.students.find(s => s.id === studentId);
    if (!student) throw new Error('Aluno não encontrado.');

    Object.assign(student, updates);

    // Sincronizar nome, avatar e credenciais caso exista usuário vinculado ao aluno
    for (const u of this.data.users) {
      if (u.studentId === student.id) {
        if (updates.name) u.name = updates.name;
        if (updates.avatar) u.avatar = updates.avatar;
        if (updates.email) u.email = updates.email;
        if (updates.registrationNumber) u.registrationNumber = updates.registrationNumber;
        this.triggerSupabaseSync('users', u, 'mapUserToSupabase');
      }
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ATUALIZAR_CADASTRO_ALUNO',
      'CONFIGURACOES',
      `Cadastro, foto de perfil ou regras do aluno ${student.name} foram atualizados.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    return student;
  }

  public recordUserLogin(userId: string) {
    const u = this.data.users.find(item => item.id === userId);
    if (u) {
      u.lastLogin = new Date().toISOString();
      this.saveDatabase();
      this.triggerSupabaseSync('users', u, 'mapUserToSupabase');
    }
  }

  public createStudent(studentData: Partial<Student>, user: { id: string; name: string; role: any }) {
    const nextNum = this.data.students.length + 1;
    const regCode = studentData.registrationNumber || `EC10-${String(nextNum).padStart(3, '0')}`;
    const fullName = (studentData.name || 'Novo Aluno').trim();

    const newStudent: Student = {
      id: `student-${Date.now().toString().slice(-5)}`,
      name: fullName,
      registrationNumber: regCode,
      classGroup: studentData.classGroup || '10ª Turma • Escola de Cristo (Formatura 27 a 30)',
      email: studentData.email || `aluno.${nextNum}@gmail.com`,
      phone: studentData.phone || '(11) 99100-0000',
      avatar: studentData.avatar || initialStudents[0]?.avatar,
      status: 'ACTIVE',
      defaultTuition: 0,
      currentConsumptionBalance: 0,
      totalOpenDebt: 0,
      payerRule: studentData.payerRule || 'BOTH',
      reportRecipientRule: studentData.reportRecipientRule || 'BOTH',
      dueReminderRecipientRule: 'BOTH',
      paymentConfirmationRecipientRule: 'BOTH',
      allowedChannels: studentData.allowedChannels || ['WHATSAPP', 'EMAIL'],
      guardians: studentData.guardians || [],
      notes: studentData.notes || '10ª Turma - Escola de Cristo ICEVES (Formatura: 27 a 30)',
      createdAt: new Date().toISOString()
    };

    this.data.students.push(newStudent);

    const uname = slugifyUsername(fullName);
    const newStudentUser: User = {
      id: `user-student-${nextNum}-${Date.now().toString().slice(-3)}`,
      name: newStudent.name,
      username: uname,
      email: newStudent.email,
      password: `Aluno@${1000 + nextNum}`,
      role: 'STUDENT',
      studentId: newStudent.id,
      registrationNumber: newStudent.registrationNumber,
      phone: newStudent.phone,
      avatar: newStudent.avatar,
      createdAt: newStudent.createdAt
    };
    this.data.users.push(newStudentUser);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'CADASTRAR_ALUNO',
      'CONFIGURACOES',
      `Aluno ${newStudent.name} (${newStudent.registrationNumber}) adicionado à 10ª Turma com conta de acesso (${newStudentUser.username}).`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('students', newStudent, 'mapStudentToSupabase');
    this.triggerSupabaseSync('users', newStudentUser, 'mapUserToSupabase');
    return newStudent;
  }

  // 10.1 Atualização flexível de Mensalidade e Ajustes na Fatura
  public updateInvoice(
    invoiceId: string, 
    updates: { tuitionAmount?: number; adjustmentsTotal?: number; notes?: string }, 
    user: { id: string; name: string; role: any }
  ) {
    const invoice = this.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    if (updates.tuitionAmount !== undefined) {
      invoice.tuitionAmount = Math.max(0, Number(updates.tuitionAmount) || 0);
    }
    if (updates.adjustmentsTotal !== undefined) {
      invoice.adjustmentsTotal = Number(updates.adjustmentsTotal) || 0;
    }
    if (updates.notes !== undefined) {
      invoice.notes = updates.notes;
    }

    // Recalcular total bruto e saldo devedor
    invoice.grossTotal = Math.max(
      0, 
      Math.round((invoice.tuitionAmount + invoice.canteenConsumptionTotal - (invoice.adjustmentsTotal || 0)) * 100) / 100
    );
    invoice.remainingBalance = Math.max(
      0, 
      Math.round((invoice.grossTotal - invoice.paidTotal) * 100) / 100
    );

    // Ajustar status se quitada ou pendente
    if (invoice.remainingBalance === 0 && invoice.grossTotal > 0 && invoice.paidTotal >= invoice.grossTotal) {
      invoice.status = 'PAGA';
    } else if (invoice.remainingBalance === 0 && invoice.grossTotal === 0) {
      invoice.status = 'PAGA';
    } else if (invoice.remainingBalance > 0 && invoice.paidTotal > 0) {
      invoice.status = 'PARCIALMENTE_PAGA';
    } else if (invoice.remainingBalance > 0 && invoice.status === 'PAGA') {
      invoice.status = 'PUBLICADA';
    }

    // Regerar payload Pix se houver saldo restante a pagar
    if (invoice.remainingBalance > 0) {
      invoice.pixCopyPasteCode = generateBacenPixPayload({
        pixKey: this.data.settings.pixKey,
        receiverName: this.data.settings.pixReceiverName,
        city: this.data.settings.pixCity,
        amount: invoice.remainingBalance,
        txId: invoice.id
      });
    }

    invoice.updatedAt = new Date().toISOString();

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'AJUSTAR_MENSALIDADE_FATURA',
      'FATURAMENTO',
      `Fatura ${invoice.id} (${invoice.studentName}) teve sua mensalidade ajustada para R$ ${invoice.tuitionAmount.toFixed(2)} e ajustes para R$ ${(invoice.adjustmentsTotal || 0).toFixed(2)}. Novo total: R$ ${invoice.grossTotal.toFixed(2)}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');
    return invoice;
  }

  // 11. Simulação e reprocessamento da fila de WhatsApp
  public retryWhatsAppNotification(notificationId: string) {
    const notif = this.data.whatsappNotifications.find(n => n.id === notificationId);
    if (!notif) throw new Error('Notificação não encontrada.');

    // Regra crítica de negócio: Se a fatura relacionada já estiver quitada, não envia cobrança!
    if (notif.invoiceId) {
      const invoice = this.data.invoices.find(i => i.id === notif.invoiceId);
      if (invoice && (invoice.status === 'PAGA' || invoice.status === 'CANCELADA' || invoice.remainingBalance <= 0)) {
        notif.status = 'CANCELADO_FATURA_QUITADA';
        notif.lastErrorMessage = 'Envio cancelado: fatura já se encontra quitada no sistema.';
        this.saveDatabase();
        return notif;
      }
    }

    notif.status = 'ENTREGUE';
    notif.sentAt = new Date().toISOString();
    notif.attemptsCount += 1;
    notif.lastErrorMessage = undefined;

    this.saveDatabase();
    return notif;
  }

  public resetToSeed(user: { id: string; name: string; role: any }) {
    this.data = {
      settings: initialSettings,
      users: initialUsers,
      guardians: initialGuardians,
      students: initialStudents,
      products: initialProducts,
      stockMovements: initialStockMovements,
      sales: initialSales,
      financialLedger: initialFinancialLedger,
      invoices: initialInvoices,
      pixPayments: initialPixPayments,
      whatsappNotifications: initialWhatsAppNotifications,
      auditLogs: initialAuditLogs,
    };
    this.logAudit(user.id, user.name, user.role, 'RESET_BASE_DE_DADOS', 'SISTEMA', 'Base de dados resetada para estado semente.');
    this.saveDatabase();
    return { success: true };
  }
}

export const db = new DatabaseService();
