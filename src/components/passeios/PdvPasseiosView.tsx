import React, { useState, useMemo, useEffect } from 'react';
import {
  Compass,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Users,
  Calendar,
  MapPin,
  FileText,
  DollarSign,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Save,
  ArrowRight,
  Eye,
  ShieldCheck,
  Filter,
  Package,
  Bus,
  Receipt,
  UserCheck,
  Clock,
  Lock,
  Calculator,
  Layers
} from 'lucide-react';
import {
  Student,
  Product,
  Passeio,
  TripOperation,
  TripExpenseItem,
  TripExpenseItemType,
  TripParticipantAllocation,
  TripParticipantAllocationItem,
  TripDistributionMethod,
  Sale,
  Invoice,
  SystemSettings,
  PdvPasseiosPermissions
} from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface PdvPasseiosViewProps {
  students: Student[];
  products: Product[];
  passeios: Passeio[];
  sales: Sale[];
  invoices: Invoice[];
  settings: SystemSettings | null;
  onOperationLaunched: () => void;
  onSettingsUpdated?: (updated: SystemSettings) => void;
}

const EXPENSE_CATEGORIES = [
  'Alimentação',
  'Transporte',
  'Ingresso',
  'Lanche',
  'Hospedagem',
  'Material & Kit',
  'Guia / Atividade',
  'Outros'
];

export function PdvPasseiosView({
  students,
  products,
  passeios,
  sales,
  invoices,
  settings,
  onOperationLaunched,
  onSettingsUpdated
}: PdvPasseiosViewProps) {
  const { user, isAdmin, isCashier } = useAuth();

  // Sub-navigation inside PDV de Passeios
  const [activeSubTab, setActiveSubTab] = useState<'new_operation' | 'history' | 'permissions'>('new_operation');

  // Operations list loaded from backend
  const [operations, setOperations] = useState<TripOperation[]>([]);
  const [isLoadingOps, setIsLoadingOps] = useState(true);

  // Operation Form State
  const [editingDraftId, setEditingDraftId] = useState<string | undefined>(undefined);
  const [catalogPasseioId, setCatalogPasseioId] = useState<string>('');
  const [tripName, setTripName] = useState('');
  const [tripDescription, setTripDescription] = useState('');
  const [tripDate, setTripDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [tripDestination, setTripDestination] = useState('');
  const [tripNotes, setTripNotes] = useState('');
  const [responsibleName, setResponsibleName] = useState(user?.name || 'Administração ICEVES');

  // Expense Items State
  const [items, setItems] = useState<TripExpenseItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemCategory, setItemCategory] = useState('Ingresso');
  const [itemType, setItemType] = useState<TripExpenseItemType>('SERVICO');
  const [itemStoreProductId, setItemStoreProductId] = useState('');
  const [itemDeductStock, setItemDeductStock] = useState(false);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemUnitPrice, setItemUnitPrice] = useState<string>('');
  const [itemNotes, setItemNotes] = useState('');

  // Student Selection State
  const [selectionMode, setSelectionMode] = useState<'ALL_STUDENTS' | 'SPECIFIC_STUDENTS'>('ALL_STUDENTS');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // Distribution State
  const [distributionMethod, setDistributionMethod] = useState<TripDistributionMethod>('IGUALITARIA');
  const [customStudentAmounts, setCustomStudentAmounts] = useState<Record<string, string>>({});
  // Matrix for POR_ITEM: record of studentId -> array of expenseItemId
  const [studentItemMatrix, setStudentItemMatrix] = useState<Record<string, string[]>>({});
  const [fixedValueInput, setFixedValueInput] = useState<string>('');

  // Review & Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Post-Launch Result Receipt Modal
  const [launchResult, setLaunchResult] = useState<{
    operation: TripOperation;
    salesCreated: Sale[];
  } | null>(null);

  // History Filters State
  const [historySearchName, setHistorySearchName] = useState('');
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const [historyFilterStudent, setHistoryFilterStudent] = useState('');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('ALL');
  const [historyFilterResponsible, setHistoryFilterResponsible] = useState('');

  // Detail & Reversal Modal State
  const [viewingOperation, setViewingOperation] = useState<TripOperation | null>(null);
  const [reversingTarget, setReversingTarget] = useState<{
    operation: TripOperation;
    studentId?: string; // undefined = reverse entire operation
    studentName?: string;
    amount: number;
  } | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [isReversing, setIsReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  // Permissions State (Admin only)
  const [permsForm, setPermsForm] = useState<PdvPasseiosPermissions>({
    cashierCanViewPasseios: settings?.pdvPasseiosPermissions?.cashierCanViewPasseios ?? false,
    cashierCanCreatePasseios: settings?.pdvPasseiosPermissions?.cashierCanCreatePasseios ?? false,
    cashierCanAddExpenses: settings?.pdvPasseiosPermissions?.cashierCanAddExpenses ?? false,
    cashierCanSelectStudents: settings?.pdvPasseiosPermissions?.cashierCanSelectStudents ?? false,
    cashierCanConfirmLaunches: settings?.pdvPasseiosPermissions?.cashierCanConfirmLaunches ?? false,
    cashierCanViewHistory: settings?.pdvPasseiosPermissions?.cashierCanViewHistory ?? false,
    cashierCanReverseLaunches: settings?.pdvPasseiosPermissions?.cashierCanReverseLaunches ?? false,
  });
  const [isSavingPerms, setIsSavingPerms] = useState(false);

  // Resolve current user's granular permissions
  const userPermissions = useMemo(() => {
    if (isAdmin) {
      return {
        canViewPasseios: true,
        canCreatePasseios: true,
        canAddExpenses: true,
        canSelectStudents: true,
        canConfirmLaunches: true,
        canViewHistory: true,
        canReverseLaunches: true,
      };
    }
    if (isCashier) {
      const p = settings?.pdvPasseiosPermissions;
      return {
        canViewPasseios: Boolean(p?.cashierCanViewPasseios),
        canCreatePasseios: Boolean(p?.cashierCanCreatePasseios),
        canAddExpenses: Boolean(p?.cashierCanAddExpenses),
        canSelectStudents: Boolean(p?.cashierCanSelectStudents),
        canConfirmLaunches: Boolean(p?.cashierCanConfirmLaunches),
        canViewHistory: Boolean(p?.cashierCanViewHistory),
        canReverseLaunches: Boolean(p?.cashierCanReverseLaunches),
      };
    }
    return {
      canViewPasseios: false,
      canCreatePasseios: false,
      canAddExpenses: false,
      canSelectStudents: false,
      canConfirmLaunches: false,
      canViewHistory: false,
      canReverseLaunches: false,
    };
  }, [isAdmin, isCashier, settings]);

  // Active eligible students
  const eligibleStudents = useMemo(
    () => students.filter(s => s.status === 'ACTIVE'),
    [students]
  );

  // Load operations from API
  const fetchOperations = async () => {
    setIsLoadingOps(true);
    try {
      const data = await api.getTripOperations();
      setOperations(data);
    } catch (err) {
      // ignore
    } finally {
      setIsLoadingOps(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, []);

  // Keep ALL_STUDENTS selection synced with eligibleStudents
  useEffect(() => {
    if (selectionMode === 'ALL_STUDENTS') {
      setSelectedStudentIds(eligibleStudents.map(s => s.id));
    }
  }, [selectionMode, eligibleStudents]);

  // Initialize item matrix when items or selected students change
  useEffect(() => {
    setStudentItemMatrix(prev => {
      const next: Record<string, string[]> = { ...prev };
      const allItemIds = items.map(i => i.id);
      for (const stId of selectedStudentIds) {
        if (!next[stId]) {
          next[stId] = [...allItemIds];
        } else {
          // Retain existing valid item IDs
          next[stId] = next[stId].filter(id => allItemIds.includes(id));
        }
      }
      return next;
    });
  }, [items, selectedStudentIds]);

  // Selected Student Objects (in deterministic order)
  const participatingStudents = useMemo(
    () => eligibleStudents.filter(s => selectedStudentIds.includes(s.id)),
    [eligibleStudents, selectedStudentIds]
  );

  // Filtered students for search in SPECIFIC_STUDENTS mode
  const filteredSearchStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return eligibleStudents;
    return eligibleStudents.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.registrationNumber.toLowerCase().includes(q)
    );
  }, [eligibleStudents, studentSearch]);

  // Calculate Total Expenses in integer cents
  const totalExpensesCents = useMemo(() => {
    return items.reduce((acc, it) => acc + Math.round(it.totalAmount * 100), 0);
  }, [items]);

  const totalExpensesReais = totalExpensesCents / 100;

  // Compute deterministic participant allocations in integer cents according to distributionMethod
  const computedAllocations: TripParticipantAllocation[] = useMemo(() => {
    const count = participatingStudents.length;
    if (count === 0) return [];

    // MODE A: IGUALITARIA (Deterministic cent remainder distribution)
    if (distributionMethod === 'IGUALITARIA') {
      const baseCents = Math.floor(totalExpensesCents / count);
      const remainderCents = totalExpensesCents % count;

      return participatingStudents.map((st, idx) => {
        const studentCents = idx < remainderCents ? baseCents + 1 : baseCents;
        const studentReais = studentCents / 100;

        // Build itemized breakdown for this student summing to studentCents
        const allocItems: TripParticipantAllocationItem[] = items.map(it => {
          const itemCents = Math.round(it.totalAmount * 100);
          const itemShareCents =
            totalExpensesCents > 0
              ? Math.round((itemCents * studentCents) / totalExpensesCents)
              : 0;
          return {
            expenseItemId: it.id,
            name: it.name,
            category: it.category,
            itemType: it.itemType,
            quantity: 1,
            unitPrice: itemShareCents / 100,
            amount: itemShareCents / 100,
            description: it.description,
            notes: it.notes,
          };
        });

        // Adjust last item by any 1-cent rounding delta so sum(allocItems) === studentCents
        const sumItemsCents = allocItems.reduce((a, b) => a + Math.round(b.amount * 100), 0);
        if (allocItems.length > 0 && sumItemsCents !== studentCents) {
          const delta = studentCents - sumItemsCents;
          const last = allocItems[allocItems.length - 1];
          const correctedCents = Math.max(0, Math.round(last.amount * 100) + delta);
          last.amount = correctedCents / 100;
          last.unitPrice = last.amount;
        }

        return {
          studentId: st.id,
          studentName: st.name,
          registrationNumber: st.registrationNumber,
          classGroup: st.classGroup,
          allocatedAmount: studentReais,
          allocatedCents: studentCents,
          items: allocItems,
          status: 'PENDENTE',
        };
      });
    }

    // MODE B: PERSONALIZADA (Custom value per student)
    if (distributionMethod === 'PERSONALIZADA') {
      return participatingStudents.map(st => {
        const rawVal = parseFloat((customStudentAmounts[st.id] || '0').replace(',', '.'));
        const studentCents = Math.max(0, Math.round((isNaN(rawVal) ? 0 : rawVal) * 100));
        const studentReais = studentCents / 100;

        const allocItems: TripParticipantAllocationItem[] = items.map(it => {
          const itemCents = Math.round(it.totalAmount * 100);
          const itemShareCents =
            totalExpensesCents > 0
              ? Math.round((itemCents * studentCents) / totalExpensesCents)
              : 0;
          return {
            expenseItemId: it.id,
            name: it.name,
            category: it.category,
            itemType: it.itemType,
            quantity: 1,
            unitPrice: itemShareCents / 100,
            amount: itemShareCents / 100,
            description: it.description,
            notes: it.notes,
          };
        });

        const sumItemsCents = allocItems.reduce((a, b) => a + Math.round(b.amount * 100), 0);
        if (allocItems.length > 0 && sumItemsCents !== studentCents) {
          const delta = studentCents - sumItemsCents;
          const last = allocItems[allocItems.length - 1];
          const correctedCents = Math.max(0, Math.round(last.amount * 100) + delta);
          last.amount = correctedCents / 100;
          last.unitPrice = last.amount;
        }

        return {
          studentId: st.id,
          studentName: st.name,
          registrationNumber: st.registrationNumber,
          classGroup: st.classGroup,
          allocatedAmount: studentReais,
          allocatedCents: studentCents,
          items: allocItems,
          status: 'PENDENTE',
        };
      });
    }

    // MODE C: POR_ITEM (Each expense item is divided among or assigned to the students checked for that item)
    if (distributionMethod === 'POR_ITEM') {
      // For each item, find all participating students who have this item checked
      const itemStudentShares: Record<string, Record<string, number>> = {};

      for (const it of items) {
        const itemTotalCents = Math.round(it.totalAmount * 100);
        const checkedStudents = participatingStudents.filter(st =>
          (studentItemMatrix[st.id] || []).includes(it.id)
        );
        itemStudentShares[it.id] = {};

        if (checkedStudents.length > 0) {
          const base = Math.floor(itemTotalCents / checkedStudents.length);
          const rem = itemTotalCents % checkedStudents.length;
          checkedStudents.forEach((st, idx) => {
            itemStudentShares[it.id][st.id] = idx < rem ? base + 1 : base;
          });
        }
      }

      return participatingStudents.map(st => {
        const checkedItemIds = studentItemMatrix[st.id] || [];
        const studentAllocItems: TripParticipantAllocationItem[] = [];
        let studentCents = 0;

        for (const it of items) {
          if (checkedItemIds.includes(it.id)) {
            const shareCents = itemStudentShares[it.id]?.[st.id] ?? 0;
            studentCents += shareCents;
            studentAllocItems.push({
              expenseItemId: it.id,
              name: it.name,
              category: it.category,
              itemType: it.itemType,
              quantity: 1,
              unitPrice: shareCents / 100,
              amount: shareCents / 100,
              description: it.description,
              notes: it.notes,
            });
          }
        }

        return {
          studentId: st.id,
          studentName: st.name,
          registrationNumber: st.registrationNumber,
          classGroup: st.classGroup,
          allocatedAmount: studentCents / 100,
          allocatedCents: studentCents,
          items: studentAllocItems,
          status: 'PENDENTE',
        };
      });
    }

    // MODE D: VALOR_FIXO (Specific fixed value per student)
    const rawFixed = parseFloat((fixedValueInput || '0').replace(',', '.'));
    const fixedCents = Math.max(0, Math.round((isNaN(rawFixed) ? 0 : rawFixed) * 100));
    const fixedReais = fixedCents / 100;

    return participatingStudents.map(st => {
      const allocItems: TripParticipantAllocationItem[] =
        items.length > 0
          ? items.map(it => {
              const itemCents = Math.round(it.totalAmount * 100);
              const shareCents =
                totalExpensesCents > 0
                  ? Math.round((itemCents * fixedCents) / totalExpensesCents)
                  : fixedCents;
              return {
                expenseItemId: it.id,
                name: it.name,
                category: it.category,
                itemType: it.itemType,
                quantity: 1,
                unitPrice: shareCents / 100,
                amount: shareCents / 100,
                description: it.description,
                notes: it.notes,
              };
            })
          : [
              {
                expenseItemId: 'fixed-rate',
                name: tripName || 'Taxa de Participação no Passeio',
                category: 'Passeio',
                itemType: 'SERVICO',
                quantity: 1,
                unitPrice: fixedReais,
                amount: fixedReais,
              },
            ];

      const sumItemsCents = allocItems.reduce((a, b) => a + Math.round(b.amount * 100), 0);
      if (allocItems.length > 0 && sumItemsCents !== fixedCents) {
        const delta = fixedCents - sumItemsCents;
        const last = allocItems[allocItems.length - 1];
        const correctedCents = Math.max(0, Math.round(last.amount * 100) + delta);
        last.amount = correctedCents / 100;
        last.unitPrice = last.amount;
      }

      return {
        studentId: st.id,
        studentName: st.name,
        registrationNumber: st.registrationNumber,
        classGroup: st.classGroup,
        allocatedAmount: fixedReais,
        allocatedCents: fixedCents,
        items: allocItems,
        status: 'PENDENTE',
      };
    });
  }, [
    participatingStudents,
    distributionMethod,
    totalExpensesCents,
    items,
    customStudentAmounts,
    studentItemMatrix,
    fixedValueInput,
    tripName
  ]);

  const totalDistributedCents = useMemo(
    () => computedAllocations.reduce((acc, p) => acc + p.allocatedCents, 0),
    [computedAllocations]
  );
  const totalDistributedReais = totalDistributedCents / 100;
  const divergenceCents = totalDistributedCents - totalExpensesCents;

  // Overall Module KPIs
  const moduleStats = useMemo(() => {
    let launchedOpsCount = 0;
    let draftOpsCount = 0;
    let totalExpensesAll = 0;
    let totalDistributedAll = 0;
    let pendingDraftAmount = 0;
    let totalStudentLaunches = 0;
    const uniqueStudentSet = new Set<string>();

    for (const op of operations) {
      if (op.status === 'RASCUNHO') {
        draftOpsCount += 1;
        pendingDraftAmount += op.totalExpenses;
      } else {
        launchedOpsCount += 1;
        totalExpensesAll += op.totalExpenses;
        totalDistributedAll += op.totalDistributed;
        for (const p of op.participants) {
          if (p.status === 'LANCADO') {
            totalStudentLaunches += 1;
            uniqueStudentSet.add(p.studentId);
          }
        }
      }
    }

    return {
      launchedOpsCount,
      draftOpsCount,
      totalExpensesAll,
      totalDistributedAll,
      pendingDraftAmount,
      totalStudentLaunches,
      uniqueStudentsCount: uniqueStudentSet.size,
    };
  }, [operations]);

  // Filtered History Operations
  const filteredOperations = useMemo(() => {
    return operations.filter(op => {
      if (historyFilterStatus !== 'ALL' && op.status !== historyFilterStatus) {
        return false;
      }
      if (historyFilterDate && op.tripDate !== historyFilterDate) {
        return false;
      }
      if (historySearchName.trim()) {
        const q = historySearchName.trim().toLowerCase();
        const matchName =
          op.name.toLowerCase().includes(q) ||
          op.id.toLowerCase().includes(q) ||
          op.destination.toLowerCase().includes(q);
        if (!matchName) return false;
      }
      if (historyFilterResponsible.trim()) {
        const r = historyFilterResponsible.trim().toLowerCase();
        if (!op.responsibleUserName.toLowerCase().includes(r)) return false;
      }
      if (historyFilterStudent.trim()) {
        const stQ = historyFilterStudent.trim().toLowerCase();
        const hasSt = op.participants.some(
          p =>
            p.studentName.toLowerCase().includes(stQ) ||
            p.registrationNumber.toLowerCase().includes(stQ)
        );
        if (!hasSt) return false;
      }
      return true;
    });
  }, [
    operations,
    historyFilterStatus,
    historyFilterDate,
    historySearchName,
    historyFilterResponsible,
    historyFilterStudent
  ]);

  // Quick-fill from existing Passeios catalog
  const handleSelectCatalogPasseio = (id: string) => {
    setCatalogPasseioId(id);
    if (!id) return;
    const found = passeios.find(p => p.id === id);
    if (!found) return;
    setTripName(found.nome);
    if (found.descricao) setTripDescription(found.descricao);
    if (found.dataPasseio) setTripDate(found.dataPasseio);
    if (!tripDestination) setTripDestination(found.nome);

    // If items list is empty and catalog passeio has a base price > 0, offer a pre-filled item
    if (items.length === 0 && found.valor > 0) {
      const count = Math.max(1, participatingStudents.length);
      const unitCents = Math.round(found.valor * 100);
      setItems([
        {
          id: `ITEM-${Date.now()}`,
          name: `Inscrição / Taxa — ${found.nome}`,
          description: found.descricao || `Participação individual em ${found.nome}`,
          category: 'Ingresso',
          itemType: 'SERVICO',
          quantity: count,
          unitPrice: unitCents / 100,
          totalAmount: (unitCents * count) / 100,
          notes: 'Carregado do catálogo oficial de passeios',
        },
      ]);
      setFixedValueInput(found.valor.toFixed(2));
    }
  };

  // Add or Update Expense Item
  const handleAddOrUpdateItem = () => {
    setFormError(null);
    const cleanName = itemName.trim();
    if (!cleanName) {
      setFormError('Informe o nome do produto ou despesa do passeio.');
      return;
    }

    const qty = Math.max(1, Math.floor(Number(itemQuantity) || 1));
    const parsedUnit = parseFloat(itemUnitPrice.replace(',', '.'));
    if (isNaN(parsedUnit) || parsedUnit <= 0) {
      setFormError('Informe um valor unitário válido maior que R$ 0,00.');
      return;
    }

    const unitCents = Math.round(parsedUnit * 100);
    const totalCents = qty * unitCents;

    if (editingItemId) {
      setItems(prev =>
        prev.map(it =>
          it.id === editingItemId
            ? {
                ...it,
                name: cleanName,
                description: itemDescription.trim(),
                category: itemCategory,
                itemType,
                storeProductId: itemType === 'PRODUTO_FISICO' && itemStoreProductId ? itemStoreProductId : undefined,
                deductFromStock: itemType === 'PRODUTO_FISICO' && Boolean(itemStoreProductId) && itemDeductStock,
                quantity: qty,
                unitPrice: unitCents / 100,
                totalAmount: totalCents / 100,
                notes: itemNotes.trim(),
              }
            : it
        )
      );
      setEditingItemId(null);
    } else {
      const newItem: TripExpenseItem = {
        id: `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: cleanName,
        description: itemDescription.trim(),
        category: itemCategory,
        itemType,
        storeProductId: itemType === 'PRODUTO_FISICO' && itemStoreProductId ? itemStoreProductId : undefined,
        deductFromStock: itemType === 'PRODUTO_FISICO' && Boolean(itemStoreProductId) && itemDeductStock,
        quantity: qty,
        unitPrice: unitCents / 100,
        totalAmount: totalCents / 100,
        notes: itemNotes.trim(),
      };
      setItems(prev => [...prev, newItem]);
      // Automatically mark new item for all selected students in POR_ITEM matrix
      setStudentItemMatrix(prev => {
        const next = { ...prev };
        for (const stId of selectedStudentIds) {
          next[stId] = [...(next[stId] || []), newItem.id];
        }
        return next;
      });
    }

    // Reset item form
    setItemName('');
    setItemDescription('');
    setItemStoreProductId('');
    setItemDeductStock(false);
    setItemQuantity(participatingStudents.length || 1);
    setItemUnitPrice('');
    setItemNotes('');
  };

  const handleEditItem = (it: TripExpenseItem) => {
    setEditingItemId(it.id);
    setItemName(it.name);
    setItemDescription(it.description || '');
    setItemCategory(it.category);
    setItemType(it.itemType);
    setItemStoreProductId(it.storeProductId || '');
    setItemDeductStock(Boolean(it.deductFromStock));
    setItemQuantity(it.quantity);
    setItemUnitPrice(it.unitPrice.toFixed(2));
    setItemNotes(it.notes || '');
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (editingItemId === id) {
      setEditingItemId(null);
    }
  };

  // Quick preset item helper (Alimentação, Transporte, Ingresso, Lanche)
  const applyPresetExpense = (preset: {
    name: string;
    category: string;
    itemType: TripExpenseItemType;
    defaultQty: number;
    defaultUnit: string;
    description: string;
  }) => {
    setItemName(preset.name);
    setItemCategory(preset.category);
    setItemType(preset.itemType);
    setItemQuantity(preset.defaultQty);
    setItemUnitPrice(preset.defaultUnit);
    setItemDescription(preset.description);
  };

  // Equalize custom amounts helper for PERSONALIZADA mode
  const handleDistributeRemainderInCustomMode = () => {
    if (participatingStudents.length === 0) return;
    const count = participatingStudents.length;
    const baseCents = Math.floor(totalExpensesCents / count);
    const rem = totalExpensesCents % count;
    const next: Record<string, string> = {};
    participatingStudents.forEach((st, idx) => {
      const c = idx < rem ? baseCents + 1 : baseCents;
      next[st.id] = (c / 100).toFixed(2);
    });
    setCustomStudentAmounts(next);
  };

  // Sync expense total with Fixed Value × Students in VALOR_FIXO mode
  const handleSyncExpensesToFixedValue = () => {
    const rawFixed = parseFloat((fixedValueInput || '0').replace(',', '.'));
    if (isNaN(rawFixed) || rawFixed <= 0 || participatingStudents.length === 0) return;
    const unitCents = Math.round(rawFixed * 100);
    const count = participatingStudents.length;
    const totalCents = unitCents * count;

    setItems([
      {
        id: `ITEM-${Date.now()}`,
        name: tripName.trim() ? `Pacote Individual — ${tripName.trim()}` : 'Cota Individual do Passeio',
        description: tripDescription.trim() || 'Valor individual definido por participante',
        category: 'Ingresso',
        itemType: 'SERVICO',
        quantity: count,
        unitPrice: unitCents / 100,
        totalAmount: totalCents / 100,
        notes: 'Sincronizado com valor fixo por aluno',
      },
    ]);
  };

  // Reset entire operation form
  const resetOperationForm = () => {
    setEditingDraftId(undefined);
    setCatalogPasseioId('');
    setTripName('');
    setTripDescription('');
    setTripDate(new Date().toISOString().substring(0, 10));
    setTripDestination('');
    setTripNotes('');
    setResponsibleName(user?.name || 'Administração ICEVES');
    setItems([]);
    setSelectionMode('ALL_STUDENTS');
    setSelectedStudentIds(eligibleStudents.map(s => s.id));
    setDistributionMethod('IGUALITARIA');
    setCustomStudentAmounts({});
    setFixedValueInput('');
    setFormError(null);
    setFormSuccess(null);
  };

  // Load a draft into the editor
  const handleLoadDraftIntoForm = (draft: TripOperation) => {
    setEditingDraftId(draft.id);
    setCatalogPasseioId(draft.catalogPasseioId || '');
    setTripName(draft.name);
    setTripDescription(draft.description || '');
    setTripDate(draft.tripDate);
    setTripDestination(draft.destination || '');
    setTripNotes(draft.notes || '');
    setResponsibleName(draft.responsibleUserName || user?.name || 'Administração ICEVES');
    setItems(draft.items || []);
    setSelectionMode(draft.selectionMode || 'SPECIFIC_STUDENTS');
    setSelectedStudentIds(draft.participants.map(p => p.studentId));
    setDistributionMethod(draft.distributionMethod || 'IGUALITARIA');
    if (draft.fixedValuePerStudent) {
      setFixedValueInput(draft.fixedValuePerStudent.toFixed(2));
    }
    const customMap: Record<string, string> = {};
    const matrixMap: Record<string, string[]> = {};
    draft.participants.forEach(p => {
      customMap[p.studentId] = p.allocatedAmount.toFixed(2);
      matrixMap[p.studentId] = p.items.map(i => i.expenseItemId);
    });
    setCustomStudentAmounts(customMap);
    setStudentItemMatrix(matrixMap);
    setViewingOperation(null);
    setActiveSubTab('new_operation');
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    setFormError(null);
    setFormSuccess(null);
    if (!tripName.trim()) {
      setFormError('Informe o nome do passeio para salvar o rascunho.');
      return;
    }

    setIsSavingDraft(true);
    try {
      const saved = await api.saveTripOperationDraft({
        id: editingDraftId,
        catalogPasseioId: catalogPasseioId || undefined,
        name: tripName.trim(),
        description: tripDescription.trim(),
        tripDate,
        destination: tripDestination.trim() || 'Destino Externo ICEVES',
        notes: tripNotes.trim(),
        responsibleUserId: user?.id,
        responsibleUserName: responsibleName.trim() || user?.name || 'Administração',
        selectionMode,
        distributionMethod,
        fixedValuePerStudent: fixedValueInput ? parseFloat(fixedValueInput.replace(',', '.')) : undefined,
        items,
        participants: computedAllocations,
      });

      setEditingDraftId(saved.id);
      setFormSuccess(`Passeio "${saved.name}" (${saved.id}) salvo como rascunho com sucesso!`);
      await fetchOperations();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar rascunho.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Open pre-launch confirmation screen
  const handleOpenConfirmScreen = () => {
    setFormError(null);
    setFormSuccess(null);

    if (!tripName.trim()) {
      setFormError('Informe o nome do passeio antes de avançar para a conferência.');
      return;
    }
    if (items.length === 0) {
      setFormError('Cadastre pelo menos 1 produto ou despesa do passeio.');
      return;
    }
    if (participatingStudents.length === 0) {
      setFormError('Selecione pelo menos 1 aluno participante.');
      return;
    }
    if (divergenceCents !== 0) {
      setFormError(
        `Não é permitido concluir com divergência financeira (${formatCurrency(divergenceCents / 100)}). O Total Distribuído (${formatCurrency(totalDistributedReais)}) deve ser exatamente igual ao Total das Despesas (${formatCurrency(totalExpensesReais)}).`
      );
      return;
    }
    if (computedAllocations.some(p => p.allocatedCents <= 0)) {
      setFormError(
        'Há aluno(s) selecionado(s) com valor R$ 0,00. Remova da seleção quem não teve custo ou atribua os itens correspondentes.'
      );
      return;
    }

    setShowConfirmModal(true);
  };

  // Execute transactional launch into student accounts
  const handleConfirmAndLaunch = async () => {
    setIsLaunching(true);
    setFormError(null);

    try {
      const idempotencyKey = `PDV-PAS-LAUNCH-${editingDraftId || Date.now()}-${totalDistributedCents}-${participatingStudents.length}`;
      const result = await api.launchTripOperation({
        id: editingDraftId,
        catalogPasseioId: catalogPasseioId || undefined,
        name: tripName.trim(),
        description: tripDescription.trim(),
        tripDate,
        destination: tripDestination.trim() || 'Destino Externo ICEVES',
        notes: tripNotes.trim(),
        responsibleUserId: user?.id,
        responsibleUserName: responsibleName.trim() || user?.name || 'Administração',
        selectionMode,
        distributionMethod,
        fixedValuePerStudent: fixedValueInput ? parseFloat(fixedValueInput.replace(',', '.')) : undefined,
        items,
        participants: computedAllocations,
        idempotencyKey,
      });

      setShowConfirmModal(false);
      setLaunchResult({
        operation: result.operation,
        salesCreated: result.salesCreated,
      });
      resetOperationForm();
      await fetchOperations();
      onOperationLaunched();
    } catch (err: any) {
      setFormError(err.message || 'Falha ao confirmar e lançar o passeio nas contas.');
      setShowConfirmModal(false);
    } finally {
      setIsLaunching(false);
    }
  };

  // Delete a draft operation
  const handleDeleteDraft = async (op: TripOperation) => {
    if (!window.confirm(`Deseja descartar o rascunho "${op.name}" (${op.id})?`)) return;
    try {
      await api.deleteTripOperationDraft(op.id);
      if (editingDraftId === op.id) resetOperationForm();
      if (viewingOperation?.id === op.id) setViewingOperation(null);
      await fetchOperations();
    } catch (err: any) {
      alert(err.message || 'Erro ao descartar rascunho.');
    }
  };

  // Execute Reversal (Single student or Entire operation)
  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingTarget) return;
    const cleanReason = reverseReason.trim();
    if (!cleanReason) {
      setReverseError('Informe a justificativa obrigatória para o estorno.');
      return;
    }

    setIsReversing(true);
    setReverseError(null);
    try {
      if (reversingTarget.studentId) {
        const res = await api.reverseTripParticipant(
          reversingTarget.operation.id,
          reversingTarget.studentId,
          cleanReason
        );
        setViewingOperation(res.operation);
      } else {
        const resOp = await api.reverseEntireTripOperation(
          reversingTarget.operation.id,
          cleanReason
        );
        setViewingOperation(resOp);
      }
      setReversingTarget(null);
      setReverseReason('');
      await fetchOperations();
      onOperationLaunched();
    } catch (err: any) {
      setReverseError(err.message || 'Erro ao executar estorno.');
    } finally {
      setIsReversing(false);
    }
  };

  // Save Operator Permissions (Admin only)
  const handleSavePermissions = async () => {
    if (!isAdmin) return;
    setIsSavingPerms(true);
    try {
      const updated = await api.updateSettings({
        pdvPasseiosPermissions: permsForm,
      });
      if (onSettingsUpdated) onSettingsUpdated(updated);
      setFormSuccess('Permissões de acesso do PDV de Passeios atualizadas com sucesso!');
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar permissões.');
    } finally {
      setIsSavingPerms(false);
    }
  };

  if (!userPermissions.canViewPasseios && !userPermissions.canViewHistory) {
    return (
      <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-10 text-center space-y-3 max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-[#F5F5F5]">
          Acesso Restrito ao PDV de Passeios
        </h3>
        <p className="text-xs text-[#A1A1AA] leading-relaxed">
          Seu perfil de operador não possui permissões habilitadas para operar o módulo de PDV de Passeios. Solicite autorização ao Administrador do sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & KPI Summary Cards */}
      <div className="bg-[#1B1B1B] rounded-2xl p-6 border border-[#282828] space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium mb-0.5">
                <span>Módulo Integrado ao Financeiro</span>
                <span aria-hidden="true">·</span>
                <span>Lojinha Iceves</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F5] tracking-tight">
                PDV de Passeios — Lançamento Coletivo e Rateio de Despesas
              </h2>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                Registre produtos, ingressos, transporte e alimentação de passeios uma única vez e distribua os valores detalhados diretamente nas contas individuais dos alunos.
              </p>
            </div>
          </div>

          {/* Sub-Navigation Segmented Control */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#141414] p-1.5 rounded-xl border border-[#282828] shrink-0">
            {userPermissions.canCreatePasseios && (
              <button
                type="button"
                onClick={() => setActiveSubTab('new_operation')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSubTab === 'new_operation'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{editingDraftId ? 'Editando Rascunho' : 'Novo Lançamento'}</span>
              </button>
            )}

            {userPermissions.canViewHistory && (
              <button
                type="button"
                onClick={() => setActiveSubTab('history')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSubTab === 'history'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Histórico de Passeios ({operations.length})</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveSubTab('permissions')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSubTab === 'permissions'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Permissões</span>
              </button>
            )}
          </div>
        </div>

        {/* 5 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-2 border-t border-[#262626]">
          <div className="p-4 rounded-xl bg-[#151515] border border-[#262626]">
            <span className="text-[11px] text-[#A1A1AA] block">Total de Despesas Lançadas</span>
            <span className="text-lg font-bold text-[#F5F5F5] font-mono tabular-nums mt-1 block">
              {formatCurrency(moduleStats.totalExpensesAll)}
            </span>
            <span className="text-[11px] text-[#71717A] mt-0.5 block">
              {moduleStats.launchedOpsCount} passeio(s) efetivado(s)
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#151515] border border-[#262626]">
            <span className="text-[11px] text-[#A1A1AA] block">Total Distribuído aos Alunos</span>
            <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums mt-1 block">
              {formatCurrency(moduleStats.totalDistributedAll)}
            </span>
            <span className="text-[11px] text-[#71717A] mt-0.5 block">
              Integrado às contas mensais
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#151515] border border-[#262626]">
            <span className="text-[11px] text-[#A1A1AA] block">Valores Pendentes (Rascunhos)</span>
            <span className="text-lg font-bold text-amber-400 font-mono tabular-nums mt-1 block">
              {formatCurrency(moduleStats.pendingDraftAmount)}
            </span>
            <span className="text-[11px] text-[#71717A] mt-0.5 block">
              {moduleStats.draftOpsCount} rascunho(s) salvo(s)
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#151515] border border-[#262626]">
            <span className="text-[11px] text-[#A1A1AA] block">Lançamentos Realizados</span>
            <span className="text-lg font-bold text-[#F5F5F5] font-mono tabular-nums mt-1 block">
              {moduleStats.totalStudentLaunches}
            </span>
            <span className="text-[11px] text-[#71717A] mt-0.5 block">
              Contas individuais debitadas
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#151515] border border-[#262626]">
            <span className="text-[11px] text-[#A1A1AA] block">Alunos Participantes</span>
            <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums mt-1 block">
              {moduleStats.uniqueStudentsCount} / {eligibleStudents.length}
            </span>
            <span className="text-[11px] text-[#71717A] mt-0.5 block">
              Alunos ativos na 10ª Turma
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {formError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{formError}</span>
          </div>
          <button
            type="button"
            onClick={() => setFormError(null)}
            className="text-red-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {formSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{formSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setFormSuccess(null)}
            className="text-emerald-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: NOVO LANÇAMENTO DE PASSEIO (PDV DE PASSEIOS)                   */}
      {/* ===================================================================== */}
      {activeSubTab === 'new_operation' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left 8 Columns: Trip Data, Expenses & Student Selection */}
          <div className="xl:col-span-8 space-y-6">
            {/* STEP 1: DADOS DO PASSEIO */}
            <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#262626] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#F5F5F5]">
                    01. Identificação da Operação de Passeio
                  </h3>
                  <p className="text-xs text-[#A1A1AA]">
                    Defina o passeio, data, local de destino e responsável pelo lançamento.
                  </p>
                </div>

                {editingDraftId && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-amber-400">
                      Editando Rascunho: {editingDraftId}
                    </span>
                    <button
                      type="button"
                      onClick={resetOperationForm}
                      className="px-2.5 py-1 bg-[#262626] hover:bg-[#323232] text-xs text-[#F5F5F5] rounded-lg cursor-pointer"
                    >
                      Novo Passeio Limpo
                    </button>
                  </div>
                )}
              </div>

              {/* Optional Quick-Fill from Catalog */}
              {passeios.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#151515] border border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-[#F5F5F5] block">
                      Importar dados de um Passeio Cadastrado (Opcional)
                    </span>
                    <span className="text-[#A1A1AA] text-[11px]">
                      Preenche rapidamente nome, data e valor base a partir do catálogo de passeios da 10ª Turma.
                    </span>
                  </div>
                  <select
                    value={catalogPasseioId}
                    onChange={e => handleSelectCatalogPasseio(e.target.value)}
                    className="bg-[#1E1E1E] border border-[#323232] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:border-emerald-500 focus:outline-none cursor-pointer sm:w-72"
                  >
                    <option value="">-- Criar operação personalizada --</option>
                    {passeios.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} ({formatCurrency(p.valor)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-[#F5F5F5] mb-1">
                    Nome do Passeio *
                  </label>
                  <input
                    type="text"
                    value={tripName}
                    onChange={e => setTripName(e.target.value)}
                    placeholder="Ex: Passeio ao Parque Aquático / Passeio para a Cachoeira"
                    className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#F5F5F5] mb-1">
                    Data do Passeio *
                  </label>
                  <input
                    type="date"
                    value={tripDate}
                    onChange={e => setTripDate(e.target.value)}
                    className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#F5F5F5] mb-1">
                    Local de Destino *
                  </label>
                  <input
                    type="text"
                    value={tripDestination}
                    onChange={e => setTripDestination(e.target.value)}
                    placeholder="Ex: Parque Aquático / Cachoeira Municipal"
                    className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#F5F5F5] mb-1">
                    Responsável pelo Lançamento
                  </label>
                  <input
                    type="text"
                    value={responsibleName}
                    onChange={e => setResponsibleName(e.target.value)}
                    className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#F5F5F5] mb-1">
                    Observações Internas
                  </label>
                  <input
                    type="text"
                    value={tripNotes}
                    onChange={e => setTripNotes(e.target.value)}
                    placeholder="Ex: Ônibus fretado + kit lanche"
                    className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block font-medium text-[#F5F5F5] mb-1">
                    Descrição da Operação (Visível no Extrato do Aluno e Responsável)
                  </label>
                  <textarea
                    rows={2}
                    value={tripDescription}
                    onChange={e => setTripDescription(e.target.value)}
                    placeholder="Ex: Despesas relacionadas à alimentação, transporte e ingressos das atividades externas."
                    className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* STEP 2: CADASTRO DE PRODUTOS E DESPESAS NO PASSEIO */}
            <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#262626] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#F5F5F5]">
                    02. Produtos, Serviços e Despesas do Passeio
                  </h3>
                  <p className="text-xs text-[#A1A1AA]">
                    Adicione despesas operacionais, ingressos, transporte ou produtos avulsos sem exigir cadastro no estoque da lojinha.
                  </p>
                </div>

                {/* Quick Preset Expense Templates */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      applyPresetExpense({
                        name: 'Alimentação',
                        category: 'Alimentação',
                        itemType: 'DESPESA_OPERACIONAL',
                        defaultQty: participatingStudents.length || 17,
                        defaultUnit: '25.00',
                        description: 'Almoço e refeição durante o passeio',
                      })
                    }
                    className="px-2.5 py-1 bg-[#151515] hover:bg-[#242424] border border-[#303030] rounded-lg text-[11px] text-[#D4D4D8] cursor-pointer whitespace-nowrap"
                  >
                    + Alimentação
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyPresetExpense({
                        name: 'Transporte',
                        category: 'Transporte',
                        itemType: 'DESPESA_OPERACIONAL',
                        defaultQty: 1,
                        defaultUnit: '450.00',
                        description: 'Fretamento de transporte coletivo ida e volta',
                      })
                    }
                    className="px-2.5 py-1 bg-[#151515] hover:bg-[#242424] border border-[#303030] rounded-lg text-[11px] text-[#D4D4D8] cursor-pointer whitespace-nowrap"
                  >
                    + Transporte
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyPresetExpense({
                        name: 'Ingresso',
                        category: 'Ingresso',
                        itemType: 'SERVICO',
                        defaultQty: participatingStudents.length || 17,
                        defaultUnit: '40.00',
                        description: 'Entrada individual no local do passeio',
                      })
                    }
                    className="px-2.5 py-1 bg-[#151515] hover:bg-[#242424] border border-[#303030] rounded-lg text-[11px] text-[#D4D4D8] cursor-pointer whitespace-nowrap"
                  >
                    + Ingresso
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyPresetExpense({
                        name: 'Lanche',
                        category: 'Lanche',
                        itemType: 'PRODUTO_FISICO',
                        defaultQty: participatingStudents.length || 17,
                        defaultUnit: '12.00',
                        description: 'Kit lanche individual para a viagem',
                      })
                    }
                    className="px-2.5 py-1 bg-[#151515] hover:bg-[#242424] border border-[#303030] rounded-lg text-[11px] text-[#D4D4D8] cursor-pointer whitespace-nowrap"
                  >
                    + Lanche
                  </button>
                </div>
              </div>

              {/* Add / Edit Item Form Box */}
              {userPermissions.canAddExpenses && (
                <div className="p-4 rounded-xl bg-[#151515] border border-[#262626] space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium text-[#F5F5F5] mb-1">
                        Natureza do Gasto
                      </label>
                      <select
                        value={itemType}
                        onChange={e => setItemType(e.target.value as TripExpenseItemType)}
                        className="w-full p-2.5 bg-[#1E1E1E] border border-[#323232] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="SERVICO">Serviço / Ingresso / Atividade</option>
                        <option value="DESPESA_OPERACIONAL">Despesa Operacional / Transporte / Refeição</option>
                        <option value="PRODUTO_FISICO">Produto Físico (Avulso ou da Lojinha)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-[#F5F5F5] mb-1">
                        Categoria da Despesa
                      </label>
                      <select
                        value={itemCategory}
                        onChange={e => setItemCategory(e.target.value)}
                        className="w-full p-2.5 bg-[#1E1E1E] border border-[#323232] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                      >
                        {EXPENSE_CATEGORIES.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-[#F5F5F5] mb-1">
                        Nome do Produto ou Despesa *
                      </label>
                      <input
                        type="text"
                        value={itemName}
                        onChange={e => setItemName(e.target.value)}
                        placeholder="Ex: Alimentação, Transporte, Ingresso..."
                        className="w-full p-2.5 bg-[#1E1E1E] border border-[#323232] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Optional Store Inventory Link when PRODUTO_FISICO is selected */}
                  {itemType === 'PRODUTO_FISICO' && (
                    <div className="p-3 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <label className="block font-medium text-[#D4D4D8] mb-1">
                          Vincular a produto existente do estoque da Lojinha (Opcional — deixe em branco para item avulso)
                        </label>
                        <select
                          value={itemStoreProductId}
                          onChange={e => {
                            const pid = e.target.value;
                            setItemStoreProductId(pid);
                            const prod = products.find(p => p.id === pid);
                            if (prod) {
                              setItemName(prod.name);
                              setItemUnitPrice(prod.price.toFixed(2));
                            }
                          }}
                          className="w-full p-2 bg-[#141414] border border-[#323232] rounded-lg text-xs text-[#F5F5F5]"
                        >
                          <option value="">-- Produto Avulso do Passeio (Não afeta estoque da lojinha) --</option>
                          {products
                            .filter(p => p.status === 'ACTIVE')
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} — {formatCurrency(p.price)} (Estoque: {p.currentStock} {p.unit})
                              </option>
                            ))}
                        </select>
                      </div>

                      {itemStoreProductId && (
                        <label className="flex items-center gap-2 cursor-pointer shrink-0 pt-2 sm:pt-4">
                          <input
                            type="checkbox"
                            checked={itemDeductStock}
                            onChange={e => setItemDeductStock(e.target.checked)}
                            className="rounded border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className="text-xs text-emerald-400 font-medium">
                            Baixar do estoque da Lojinha
                          </span>
                        </label>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-2">
                      <label className="block font-medium text-[#F5F5F5] mb-1">
                        Quantidade *
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={itemQuantity}
                        onChange={e => setItemQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full p-2.5 bg-[#1E1E1E] border border-[#323232] rounded-xl text-[#F5F5F5] font-mono tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block font-medium text-[#F5F5F5] mb-1">
                        Valor Unitário (R$) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={itemUnitPrice}
                        onChange={e => setItemUnitPrice(e.target.value)}
                        placeholder="0,00"
                        className="w-full p-2.5 bg-[#1E1E1E] border border-[#323232] rounded-xl text-[#F5F5F5] font-mono tabular-nums focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block font-medium text-[#A1A1AA] mb-1">
                        Subtotal Calculado
                      </label>
                      <div className="w-full p-2.5 bg-[#121212] border border-[#282828] rounded-xl text-emerald-400 font-mono font-bold tabular-nums">
                        {formatCurrency(
                          (Math.max(1, Number(itemQuantity) || 1) *
                            Math.round((parseFloat(itemUnitPrice.replace(',', '.')) || 0) * 100)) /
                            100
                        )}
                      </div>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block font-medium text-[#F5F5F5] mb-1">
                        Descrição / Observação do Item
                      </label>
                      <input
                        type="text"
                        value={itemDescription}
                        onChange={e => setItemDescription(e.target.value)}
                        placeholder="Detalhe opcional para a conta do aluno"
                        className="w-full p-2.5 bg-[#1E1E1E] border border-[#323232] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {editingItemId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItemId(null);
                          setItemName('');
                          setItemDescription('');
                          setItemUnitPrice('');
                        }}
                        className="px-3.5 py-2 bg-[#262626] hover:bg-[#303030] text-xs font-medium text-[#D4D4D8] rounded-xl cursor-pointer"
                      >
                        Cancelar Edição
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleAddOrUpdateItem}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{editingItemId ? 'Salvar Alteração no Item' : 'Adicionar Item / Despesa ao Passeio'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Registered Expense Items Table */}
              {items.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#A1A1AA] bg-[#151515] rounded-xl border border-[#262626]">
                  Nenhum produto ou despesa adicionado ainda. Utilize o formulário acima ou os botões rápidos (+ Alimentação, + Transporte, + Ingresso, + Lanche).
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#282828] rounded-xl bg-[#151515]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#262626] text-[#A1A1AA] bg-[#1A1A1A]">
                        <th className="py-3 px-4 font-semibold">Produto ou Despesa</th>
                        <th className="py-3 px-3 font-semibold">Tipo / Categoria</th>
                        <th className="py-3 px-3 font-semibold text-right">Qtd</th>
                        <th className="py-3 px-3 font-semibold text-right">Valor Unit.</th>
                        <th className="py-3 px-4 font-semibold text-right">Valor Total</th>
                        <th className="py-3 px-3 font-semibold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222222]">
                      {items.map(it => (
                        <tr key={it.id} className="hover:bg-[#1C1C1C] transition">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#F5F5F5]">{it.name}</div>
                            {it.description && (
                              <div className="text-[11px] text-[#A1A1AA] mt-0.5">{it.description}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-[#D4D4D8]">
                            <span>{it.category}</span>
                            <span className="mx-1.5 text-[#52525B]">·</span>
                            <span className="text-[11px] text-[#A1A1AA]">
                              {it.itemType === 'PRODUTO_FISICO'
                                ? it.deductFromStock
                                  ? 'Produto Estoque'
                                  : 'Produto Avulso'
                                : it.itemType === 'SERVICO'
                                ? 'Serviço / Ingresso'
                                : 'Despesa Operacional'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-[#F5F5F5]">
                            {it.quantity}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-[#D4D4D8]">
                            {formatCurrency(it.unitPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-400">
                            {formatCurrency(it.totalAmount)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditItem(it)}
                                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-[#262626] cursor-pointer"
                                title="Editar item"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(it.id)}
                                className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/40 cursor-pointer"
                                title="Remover item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#1A1A1A] border-t border-[#282828] font-bold">
                        <td colSpan={4} className="py-3 px-4 text-right text-[#D4D4D8]">
                          Total das Despesas do Passeio ({items.length} {items.length === 1 ? 'item' : 'itens'}):
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-base text-emerald-400">
                          {formatCurrency(totalExpensesReais)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* STEP 3: SELEÇÃO DOS ALUNOS (OPÇÃO A: TODOS OS ALUNOS | OPÇÃO B: SELECIONAR ESPECÍFICOS) */}
            <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#262626] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#F5F5F5]">
                    03. Seleção dos Alunos Participantes
                  </h3>
                  <p className="text-xs text-[#A1A1AA]">
                    Escolha se o lançamento será distribuído para todos os alunos elegíveis ou apenas para alunos selecionados.
                  </p>
                </div>

                <div className="text-xs font-mono tabular-nums text-emerald-400 font-bold">
                  {participatingStudents.length} de {eligibleStudents.length} alunos selecionados
                </div>
              </div>

              {/* Opção A vs Opção B Prominent Selector Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <button
                  type="button"
                  disabled={!userPermissions.canSelectStudents}
                  onClick={() => {
                    setSelectionMode('ALL_STUDENTS');
                    setSelectedStudentIds(eligibleStudents.map(s => s.id));
                  }}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer flex items-start justify-between gap-3 ${
                    selectionMode === 'ALL_STUDENTS'
                      ? 'bg-gradient-to-br from-emerald-950/60 to-[#16241E] border-emerald-500 ring-1 ring-emerald-500/40'
                      : 'bg-[#151515] border-[#282828] hover:border-[#3A3A3A]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-bold text-sm text-[#F5F5F5]">
                        Lançar para todos os alunos
                      </span>
                    </div>
                    <p className="text-xs text-[#A1A1AA]">
                      Carrega automaticamente todos os {eligibleStudents.length} alunos ativos e elegíveis da 10ª Turma.
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      selectionMode === 'ALL_STUDENTS'
                        ? 'border-emerald-400 bg-emerald-500 text-black'
                        : 'border-zinc-600'
                    }`}
                  >
                    {selectionMode === 'ALL_STUDENTS' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!userPermissions.canSelectStudents}
                  onClick={() => setSelectionMode('SPECIFIC_STUDENTS')}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer flex items-start justify-between gap-3 ${
                    selectionMode === 'SPECIFIC_STUDENTS'
                      ? 'bg-gradient-to-br from-emerald-950/60 to-[#16241E] border-emerald-500 ring-1 ring-emerald-500/40'
                      : 'bg-[#151515] border-[#282828] hover:border-[#3A3A3A]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-bold text-sm text-[#F5F5F5]">
                        Selecionar alunos específicos
                      </span>
                    </div>
                    <p className="text-xs text-[#A1A1AA]">
                      Pesquise pelo nome e marque individualmente apenas os alunos que participaram do passeio.
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      selectionMode === 'SPECIFIC_STUDENTS'
                        ? 'border-emerald-400 bg-emerald-500 text-black'
                        : 'border-zinc-600'
                    }`}
                  >
                    {selectionMode === 'SPECIFIC_STUDENTS' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>
              </div>

              {/* OPÇÃO A PREVIEW BANNER */}
              {selectionMode === 'ALL_STUDENTS' && (
                <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] space-y-3 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[#A1A1AA] block text-[11px]">Quantidade de Alunos</span>
                      <strong className="text-sm text-[#F5F5F5] font-mono tabular-nums">
                        {participatingStudents.length} alunos ativos
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#A1A1AA] block text-[11px]">Valor Total das Despesas</span>
                      <strong className="text-sm text-[#F5F5F5] font-mono tabular-nums">
                        {formatCurrency(totalExpensesReais)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#A1A1AA] block text-[11px]">Valor Médio por Aluno</span>
                      <strong className="text-sm text-emerald-400 font-mono tabular-nums">
                        {participatingStudents.length > 0
                          ? formatCurrency(totalDistributedReais / participatingStudents.length)
                          : formatCurrency(0)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#A1A1AA] block text-[11px]">Total Geral a Lançar</span>
                      <strong className="text-sm text-emerald-400 font-mono tabular-nums">
                        {formatCurrency(totalDistributedReais)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* OPÇÃO B SPECIFIC STUDENT PICKER */}
              {selectionMode === 'SPECIFIC_STUDENTS' && (
                <div className="space-y-3.5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                        placeholder="Pesquisar aluno por nome ou matrícula..."
                        className="w-full pl-8 pr-3 py-2 bg-[#151515] border border-[#303030] rounded-xl text-xs text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const filteredIds = filteredSearchStudents.map(s => s.id);
                          setSelectedStudentIds(prev => Array.from(new Set([...prev, ...filteredIds])));
                        }}
                        className="px-3 py-2 bg-[#222222] hover:bg-[#2C2C2C] border border-[#323232] rounded-xl text-xs font-medium text-[#F5F5F5] cursor-pointer whitespace-nowrap"
                      >
                        Selecionar todos os resultados ({filteredSearchStudents.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds([])}
                        className="px-3 py-2 bg-[#1A1A1A] hover:bg-red-950/40 border border-[#2C2C2C] rounded-xl text-xs font-medium text-red-400 cursor-pointer whitespace-nowrap"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                  </div>

                  {/* Grid of selectable students */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {filteredSearchStudents.map(st => {
                      const isChecked = selectedStudentIds.includes(st.id);
                      return (
                        <label
                          key={st.id}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition ${
                            isChecked
                              ? 'bg-emerald-950/30 border-emerald-500/50 text-[#F5F5F5]'
                              : 'bg-[#151515] border-[#262626] text-[#A1A1AA] hover:border-[#363636]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedStudentIds(prev => [...prev, st.id]);
                                } else {
                                  setSelectedStudentIds(prev => prev.filter(id => id !== st.id));
                                }
                              }}
                              className="rounded border-zinc-600 text-emerald-500 focus:ring-emerald-500 shrink-0"
                            />
                            <div className="truncate">
                              <div className="font-semibold text-[#F5F5F5] truncate">{st.name}</div>
                              <div className="text-[10px] font-mono text-[#71717A]">
                                {st.registrationNumber}
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chosen Students Removable List */}
              <div className="pt-2 border-t border-[#242424] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#D4D4D8]">
                    Participantes Confirmados ({participatingStudents.length}):
                  </span>
                  {participatingStudents.length === 0 && (
                    <span className="text-amber-400 text-[11px]">
                      Nenhum aluno selecionado
                    </span>
                  )}
                </div>

                {participatingStudents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {participatingStudents.map(st => (
                      <div
                        key={st.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#151515] border border-[#2C2C2C] text-xs text-[#E4E4E7]"
                      >
                        <span className="truncate max-w-[160px]">{st.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectionMode('SPECIFIC_STUDENTS');
                            setSelectedStudentIds(prev => prev.filter(id => id !== st.id));
                          }}
                          className="text-[#71717A] hover:text-red-400 cursor-pointer"
                          title={`Remover ${st.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* STEP 4: DISTRIBUIÇÃO DOS VALORES ENTRE OS ALUNOS */}
            <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
              <div className="border-b border-[#262626] pb-3">
                <h3 className="text-sm font-bold text-[#F5F5F5]">
                  04. Mecanismo de Distribuição Financeira & Rateio em Centavos
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  Escolha como os valores serão atribuídos aos alunos selecionados. O sistema calcula em centavos sem diferenças silenciosas.
                </p>
              </div>

              {/* 4 Distribution Method Selector Tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDistributionMethod('IGUALITARIA')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    distributionMethod === 'IGUALITARIA'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white'
                      : 'bg-[#151515] border-[#282828] text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <div className="font-bold text-xs">A. Divisão Igualitária</div>
                  <p className="text-[11px] text-[#A1A1AA] mt-1">
                    Divide o total igualmente entre os participantes com centavos determinísticos.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDistributionMethod('PERSONALIZADA');
                    if (Object.keys(customStudentAmounts).length === 0) {
                      handleDistributeRemainderInCustomMode();
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    distributionMethod === 'PERSONALIZADA'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white'
                      : 'bg-[#151515] border-[#282828] text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <div className="font-bold text-xs">B. Valor Personalizado</div>
                  <p className="text-[11px] text-[#A1A1AA] mt-1">
                    Defina manualmente um valor individual para cada aluno participante.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDistributionMethod('POR_ITEM')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    distributionMethod === 'POR_ITEM'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white'
                      : 'bg-[#151515] border-[#282828] text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <div className="font-bold text-xs">C. Lançamento por Item</div>
                  <p className="text-[11px] text-[#A1A1AA] mt-1">
                    Escolha quais produtos ou despesas cada aluno consumiu individualmente.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDistributionMethod('VALOR_FIXO')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    distributionMethod === 'VALOR_FIXO'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white'
                      : 'bg-[#151515] border-[#282828] text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <div className="font-bold text-xs">D. Valor Específico Fixo</div>
                  <p className="text-[11px] text-[#A1A1AA] mt-1">
                    Lance uma cota fixa determinada por aluno participante.
                  </p>
                </button>
              </div>

              {/* Mode D: VALOR_FIXO Input Controls */}
              {distributionMethod === 'VALOR_FIXO' && (
                <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-xs">
                  <div className="space-y-1 flex-1">
                    <label className="block font-semibold text-[#F5F5F5]">
                      Valor Determinado por Aluno (R$)
                    </label>
                    <p className="text-[11px] text-[#A1A1AA]">
                      Ao definir R$ {fixedValueInput || '0,00'} para {participatingStudents.length} aluno(s), o total lançado será de{' '}
                      <strong className="text-emerald-400 font-mono">
                        {formatCurrency(totalDistributedReais)}
                      </strong>.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={fixedValueInput}
                      onChange={e => setFixedValueInput(e.target.value)}
                      placeholder="Ex: 50.00"
                      className="w-36 p-2.5 bg-[#1E1E1E] border border-[#323232] rounded-xl text-[#F5F5F5] font-mono tabular-nums focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSyncExpensesToFixedValue}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Sincronizar Despesa Total
                    </button>
                  </div>
                </div>
              )}

              {/* Mode B: PERSONALIZADA Helper Bar */}
              {distributionMethod === 'PERSONALIZADA' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#151515] border border-[#282828] text-xs">
                  <span className="text-[#A1A1AA]">
                    Ajuste o valor individual de cada participante na tabela abaixo.
                  </span>
                  <button
                    type="button"
                    onClick={handleDistributeRemainderInCustomMode}
                    className="px-3 py-1.5 bg-[#242424] hover:bg-[#303030] text-emerald-400 rounded-lg font-semibold cursor-pointer"
                  >
                    Preencher Igualmente ({formatCurrency(totalExpensesReais)})
                  </button>
                </div>
              )}

              {/* Mode C: POR_ITEM Assignment Matrix */}
              {distributionMethod === 'POR_ITEM' && items.length > 0 && participatingStudents.length > 0 && (
                <div className="overflow-x-auto border border-[#282828] rounded-xl bg-[#151515]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#262626] bg-[#1A1A1A] text-[#A1A1AA]">
                        <th className="py-2.5 px-3 font-semibold">Aluno Participante</th>
                        {items.map(it => (
                          <th key={it.id} className="py-2.5 px-3 font-semibold text-center">
                            <div className="text-[#F5F5F5]">{it.name}</div>
                            <div className="text-[10px] font-mono text-emerald-400">
                              {formatCurrency(it.totalAmount)}
                            </div>
                          </th>
                        ))}
                        <th className="py-2.5 px-3 font-semibold text-right">Total do Aluno</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222222]">
                      {computedAllocations.map(alloc => (
                        <tr key={alloc.studentId} className="hover:bg-[#1C1C1C]">
                          <td className="py-2.5 px-3 font-medium text-[#F5F5F5]">
                            {alloc.studentName}
                          </td>
                          {items.map(it => {
                            const checked = (studentItemMatrix[alloc.studentId] || []).includes(it.id);
                            const studentItem = alloc.items.find(ai => ai.expenseItemId === it.id);
                            return (
                              <td key={it.id} className="py-2.5 px-3 text-center">
                                <label className="inline-flex flex-col items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      setStudentItemMatrix(prev => {
                                        const curr = prev[alloc.studentId] || [];
                                        const nextList = e.target.checked
                                          ? Array.from(new Set([...curr, it.id]))
                                          : curr.filter(id => id !== it.id);
                                        return { ...prev, [alloc.studentId]: nextList };
                                      });
                                    }}
                                    className="rounded border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                                  />
                                  <span className="text-[10px] font-mono tabular-nums text-[#A1A1AA]">
                                    {checked && studentItem ? formatCurrency(studentItem.amount) : '—'}
                                  </span>
                                </label>
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                            {formatCurrency(alloc.allocatedAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Preview Table of Individual Allocations & Detailed Items */}
              {computedAllocations.length > 0 && (
                <div className="overflow-x-auto border border-[#282828] rounded-xl bg-[#151515] max-h-96">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#1A1A1A] border-b border-[#262626] text-[#A1A1AA]">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Aluno</th>
                        <th className="py-2.5 px-3 font-semibold">Detalhamento na Conta do Aluno</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Valor Individual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222222]">
                      {computedAllocations.map(alloc => (
                        <tr key={alloc.studentId} className="hover:bg-[#1C1C1C]">
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-[#F5F5F5]">{alloc.studentName}</div>
                            <div className="text-[10px] font-mono text-[#71717A]">
                              {alloc.registrationNumber}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-[#D4D4D8]">
                            {alloc.items.length === 0 ? (
                              <span className="text-amber-400">Nenhum item atribuído</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                {alloc.items.map((ai, i) => (
                                  <React.Fragment key={ai.expenseItemId + i}>
                                    {i > 0 && <span className="text-[#52525B]">·</span>}
                                    <span>
                                      {ai.name}:{' '}
                                      <strong className="font-mono tabular-nums text-[#F5F5F5]">
                                        {formatCurrency(ai.amount)}
                                      </strong>
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {distributionMethod === 'PERSONALIZADA' ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={customStudentAmounts[alloc.studentId] ?? alloc.allocatedAmount.toFixed(2)}
                                onChange={e =>
                                  setCustomStudentAmounts(prev => ({
                                    ...prev,
                                    [alloc.studentId]: e.target.value,
                                  }))
                                }
                                className="w-28 p-1.5 bg-[#1E1E1E] border border-[#363636] rounded-lg text-right font-mono tabular-nums text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                              />
                            ) : (
                              <span className="font-mono tabular-nums font-bold text-emerald-400">
                                {formatCurrency(alloc.allocatedAmount)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right 4 Columns: Live Financial Summary & Action Panel */}
          <div className="xl:col-span-4 space-y-6 xl:sticky xl:top-20">
            <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-5">
              <div className="border-b border-[#262626] pb-3">
                <span className="text-[11px] text-emerald-400 font-semibold block">
                  Conferência em Tempo Real
                </span>
                <h3 className="text-base font-bold text-[#F5F5F5]">
                  Resumo Financeiro do Passeio
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-[#242424]">
                  <span className="text-[#A1A1AA]">Passeio:</span>
                  <strong className="text-[#F5F5F5] truncate max-w-[200px]">
                    {tripName.trim() || 'Não informado'}
                  </strong>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-[#242424]">
                  <span className="text-[#A1A1AA]">Data & Destino:</span>
                  <span className="text-[#D4D4D8] font-mono tabular-nums">
                    {formatDate(tripDate)} · {tripDestination.trim() || 'ICEVES'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-[#242424]">
                  <span className="text-[#A1A1AA]">Alunos Selecionados:</span>
                  <strong className="text-[#F5F5F5] font-mono tabular-nums">
                    {participatingStudents.length} participante(s)
                  </strong>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-[#242424]">
                  <span className="text-[#A1A1AA]">Itens / Despesas:</span>
                  <strong className="text-[#F5F5F5] font-mono tabular-nums">
                    {items.length} item(ns)
                  </strong>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-[#242424]">
                  <span className="text-[#A1A1AA]">Método de Rateio:</span>
                  <span className="text-emerald-400 font-semibold">
                    {distributionMethod === 'IGUALITARIA'
                      ? 'Divisão Igualitária'
                      : distributionMethod === 'PERSONALIZADA'
                      ? 'Valor Personalizado'
                      : distributionMethod === 'POR_ITEM'
                      ? 'Por Item Consumido'
                      : 'Valor Específico Fixo'}
                  </span>
                </div>
              </div>

              {/* Financial Math Comparison Box */}
              <div className="p-4 rounded-xl bg-[#151515] border border-[#282828] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#A1A1AA]">Total Original das Despesas:</span>
                  <span className="font-mono tabular-nums font-bold text-[#F5F5F5]">
                    {formatCurrency(totalExpensesReais)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#A1A1AA]">Total Distribuído aos Alunos:</span>
                  <span className="font-mono tabular-nums font-bold text-emerald-400 text-sm">
                    {formatCurrency(totalDistributedReais)}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#242424] flex items-center justify-between">
                  <span className="text-[#A1A1AA]">Conferência de Centavos:</span>
                  {divergenceCents === 0 && totalExpensesCents > 0 ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      100% Exato (R$ 0,00 dif.)
                    </span>
                  ) : totalExpensesCents === 0 ? (
                    <span className="text-[#71717A]">Aguardando itens</span>
                  ) : (
                    <span className="text-red-400 font-mono font-bold">
                      Divergência: {formatCurrency(divergenceCents / 100)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {userPermissions.canConfirmLaunches && (
                  <button
                    type="button"
                    onClick={handleOpenConfirmScreen}
                    className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>REVISAR E LANÇAR NAS CONTAS</span>
                  </button>
                )}

                {userPermissions.canCreatePasseios && (
                  <button
                    type="button"
                    disabled={isSavingDraft}
                    onClick={handleSaveDraft}
                    className="w-full py-2.5 px-4 bg-[#222222] hover:bg-[#2A2A2A] border border-[#323232] text-[#F5F5F5] font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 text-emerald-400" />
                    <span>{isSavingDraft ? 'Salvando...' : 'Salvar Passeio como Rascunho'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: HISTÓRICO E CONTROLE DE PASSEIOS                               */}
      {/* ===================================================================== */}
      {activeSubTab === 'history' && (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#262626] pb-3">
            <div>
              <h3 className="text-base font-bold text-[#F5F5F5]">
                Histórico e Controle de Operações — PDV de Passeios
              </h3>
              <p className="text-xs text-[#A1A1AA]">
                Consulte todas as operações realizadas, rascunhos salvos, lançamentos individuais por participante e histórico de estornos.
              </p>
            </div>
          </div>

          {/* 5 Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs bg-[#151515] p-3.5 rounded-xl border border-[#262626]">
            <div>
              <label className="block text-[11px] text-[#A1A1AA] mb-1">Buscar Passeio / Destino</label>
              <input
                type="text"
                value={historySearchName}
                onChange={e => setHistorySearchName(e.target.value)}
                placeholder="Nome ou código..."
                className="w-full p-2 bg-[#1E1E1E] border border-[#303030] rounded-lg text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#A1A1AA] mb-1">Filtrar por Aluno</label>
              <input
                type="text"
                value={historyFilterStudent}
                onChange={e => setHistoryFilterStudent(e.target.value)}
                placeholder="Nome ou matrícula do aluno..."
                className="w-full p-2 bg-[#1E1E1E] border border-[#303030] rounded-lg text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#A1A1AA] mb-1">Data do Passeio</label>
              <input
                type="date"
                value={historyFilterDate}
                onChange={e => setHistoryFilterDate(e.target.value)}
                className="w-full p-2 bg-[#1E1E1E] border border-[#303030] rounded-lg text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#A1A1AA] mb-1">Situação</label>
              <select
                value={historyFilterStatus}
                onChange={e => setHistoryFilterStatus(e.target.value)}
                className="w-full p-2 bg-[#1E1E1E] border border-[#303030] rounded-lg text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">Todas as Situações</option>
                <option value="LANCADO">Lançado nas Contas</option>
                <option value="RASCUNHO">Rascunho Pendente</option>
                <option value="PARCIALMENTE_ESTORNADO">Parcialmente Estornado</option>
                <option value="ESTORNADO">Estornado</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[#A1A1AA] mb-1">Responsável</label>
              <input
                type="text"
                value={historyFilterResponsible}
                onChange={e => setHistoryFilterResponsible(e.target.value)}
                placeholder="Nome do responsável..."
                className="w-full p-2 bg-[#1E1E1E] border border-[#303030] rounded-lg text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Operations Table */}
          {isLoadingOps ? (
            <div className="space-y-2 py-6">
              {[1, 2, 3].map(n => (
                <div key={n} className="h-12 bg-[#151515] rounded-xl animate-pulse border border-[#242424]" />
              ))}
            </div>
          ) : filteredOperations.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#A1A1AA] bg-[#151515] rounded-xl border border-[#262626] space-y-3">
              <p>Nenhuma operação de passeio encontrada para os filtros selecionados.</p>
              {userPermissions.canCreatePasseios && (
                <button
                  type="button"
                  onClick={() => setActiveSubTab('new_operation')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Registrar Primeiro Lançamento de Passeio
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#282828] rounded-xl bg-[#151515]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#262626] bg-[#1A1A1A] text-[#A1A1AA]">
                    <th className="py-3 px-4 font-semibold">Passeio / Código</th>
                    <th className="py-3 px-3 font-semibold">Data do Passeio</th>
                    <th className="py-3 px-3 font-semibold text-right">Participantes</th>
                    <th className="py-3 px-3 font-semibold text-right">Valor Total</th>
                    <th className="py-3 px-3 font-semibold text-right">Valor Distribuído</th>
                    <th className="py-3 px-3 font-semibold">Responsável</th>
                    <th className="py-3 px-3 font-semibold">Situação</th>
                    <th className="py-3 px-3 font-semibold">Criação</th>
                    <th className="py-3 px-4 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222222]">
                  {filteredOperations.map(op => (
                    <tr key={op.id} className="hover:bg-[#1C1C1C] transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#F5F5F5]">{op.name}</div>
                        <div className="text-[11px] text-[#71717A] font-mono">
                          {op.id} · {op.destination}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[#D4D4D8]">
                        {formatDate(op.tripDate)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#F5F5F5]">
                        {op.participants.length} aluno(s)
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#D4D4D8]">
                        {formatCurrency(op.totalExpenses)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                        {formatCurrency(op.totalDistributed)}
                      </td>
                      <td className="py-3 px-3 text-[#D4D4D8]">
                        {op.responsibleUserName}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold ${
                            op.status === 'LANCADO'
                              ? 'text-emerald-400'
                              : op.status === 'RASCUNHO'
                              ? 'text-amber-400'
                              : op.status === 'PARCIALMENTE_ESTORNADO'
                              ? 'text-blue-400'
                              : 'text-red-400'
                          }`}
                        >
                          {op.status === 'LANCADO'
                            ? 'Lançado nas Contas'
                            : op.status === 'RASCUNHO'
                            ? 'Rascunho'
                            : op.status === 'PARCIALMENTE_ESTORNADO'
                            ? 'Parcialmente Estornado'
                            : 'Estornado'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[11px] text-[#A1A1AA]">
                        {formatDateTime(op.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingOperation(op)}
                            className="px-2.5 py-1.5 bg-[#242424] hover:bg-[#303030] text-[#F5F5F5] rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Detalhes</span>
                          </button>

                          {op.status === 'RASCUNHO' && userPermissions.canCreatePasseios && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleLoadDraftIntoForm(op)}
                                className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium cursor-pointer"
                              >
                                Editar / Lançar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDraft(op)}
                                className="p-1.5 text-red-400 hover:bg-red-950/40 rounded-lg cursor-pointer"
                                title="Descartar rascunho"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: PERMISSÕES DE ACESSO (ADMIN ONLY)                              */}
      {/* ===================================================================== */}
      {activeSubTab === 'permissions' && isAdmin && (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-6 max-w-3xl space-y-5">
          <div className="border-b border-[#262626] pb-3">
            <h3 className="text-base font-bold text-[#F5F5F5]">
              Controle de Permissões do Módulo — PDV de Passeios
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              Administradores possuem acesso total. Por segurança, operadores de caixa não recebem permissões administrativas automaticamente — habilite abaixo apenas o que desejar delegar.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            {[
              {
                key: 'cashierCanViewPasseios' as const,
                title: 'Visualizar PDV de Passeios',
                desc: 'Permite que operadores de caixa visualizem a aba PDV de Passeios no menu lateral.',
              },
              {
                key: 'cashierCanCreatePasseios' as const,
                title: 'Criar Passeios e Salvar Rascunhos',
                desc: 'Permite iniciar novas operações de passeio e salvar rascunhos.',
              },
              {
                key: 'cashierCanAddExpenses' as const,
                title: 'Adicionar Produtos e Despesas',
                desc: 'Permite cadastrar e editar itens, serviços e despesas operacionais no passeio.',
              },
              {
                key: 'cashierCanSelectStudents' as const,
                title: 'Selecionar Alunos Participantes',
                desc: 'Permite alternar entre todos os alunos ou selecionar alunos específicos.',
              },
              {
                key: 'cashierCanConfirmLaunches' as const,
                title: 'Confirmar Lançamentos nas Contas Individuais',
                desc: 'Permite efetivar o lançamento financeiro coletivo nas contas mensais dos alunos.',
              },
              {
                key: 'cashierCanViewHistory' as const,
                title: 'Consultar Histórico de Passeios',
                desc: 'Permite acessar o histórico de operações e lançamentos individuais.',
              },
              {
                key: 'cashierCanReverseLaunches' as const,
                title: 'Realizar Estornos Auditáveis',
                desc: 'Permite estornar lançamentos de passeios mediante justificativa obrigatória.',
              },
            ].map(item => (
              <label
                key={item.key}
                className="p-3.5 rounded-xl bg-[#151515] border border-[#282828] flex items-center justify-between gap-4 cursor-pointer hover:border-[#363636]"
              >
                <div>
                  <span className="font-semibold text-[#F5F5F5] block">{item.title}</span>
                  <span className="text-[11px] text-[#A1A1AA]">{item.desc}</span>
                </div>
                <input
                  type="checkbox"
                  checked={permsForm[item.key]}
                  onChange={e =>
                    setPermsForm(prev => ({
                      ...prev,
                      [item.key]: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-zinc-600 text-emerald-500 focus:ring-emerald-500 shrink-0"
                />
              </label>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={isSavingPerms}
              onClick={handleSavePermissions}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {isSavingPerms ? 'Salvando Permissões...' : 'Salvar Permissões de Acesso'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: TELA DE CONFERÊNCIA ANTES DA CONFIRMAÇÃO                     */}
      {/* ===================================================================== */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#161616] rounded-2xl border border-[#2C2C2C] shadow-2xl max-w-3xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#282828] pb-3">
              <div>
                <span className="text-[11px] text-emerald-400 font-semibold block">
                  Conferência Obrigatória Antes do Lançamento
                </span>
                <h3 className="text-lg font-bold text-[#F5F5F5]">
                  Resumo Financeiro da Operação — {tripName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-[#A1A1AA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Key Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#121212] p-4 rounded-xl border border-[#262626]">
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Data do Passeio</span>
                <strong className="text-[#F5F5F5] font-mono tabular-nums">{formatDate(tripDate)}</strong>
              </div>
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Alunos Selecionados</span>
                <strong className="text-[#F5F5F5] font-mono tabular-nums">
                  {computedAllocations.length} participante(s)
                </strong>
              </div>
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Quantidade de Itens</span>
                <strong className="text-[#F5F5F5] font-mono tabular-nums">{items.length} item(ns)</strong>
              </div>
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Método de Distribuição</span>
                <strong className="text-emerald-400">
                  {distributionMethod === 'IGUALITARIA'
                    ? 'Divisão Igualitária'
                    : distributionMethod === 'PERSONALIZADA'
                    ? 'Valor Personalizado'
                    : distributionMethod === 'POR_ITEM'
                    ? 'Por Item'
                    : 'Valor Fixo'}
                </strong>
              </div>
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Valor Total das Despesas</span>
                <strong className="text-[#F5F5F5] font-mono tabular-nums">
                  {formatCurrency(totalExpensesReais)}
                </strong>
              </div>
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Valor Médio Individual</span>
                <strong className="text-[#F5F5F5] font-mono tabular-nums">
                  {computedAllocations.length > 0
                    ? formatCurrency(totalDistributedReais / computedAllocations.length)
                    : formatCurrency(0)}
                </strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[#A1A1AA] block text-[11px]">Total Geral que Será Lançado nas Contas</span>
                <strong className="text-base text-emerald-400 font-mono tabular-nums">
                  {formatCurrency(totalDistributedReais)}
                </strong>
              </div>
            </div>

            {/* Participant & Itemized Breakdown List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#D4D4D8]">
                Lista dos Alunos Participantes e Lançamentos Individuais ({computedAllocations.length}):
              </h4>
              <div className="border border-[#282828] rounded-xl overflow-hidden bg-[#121212] max-h-64 overflow-y-auto divide-y divide-[#222222]">
                {computedAllocations.map(alloc => (
                  <div key={alloc.studentId} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-semibold text-[#F5F5F5]">
                        {alloc.studentName}{' '}
                        <span className="font-mono text-[11px] text-[#71717A]">
                          ({alloc.registrationNumber})
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A1A1AA] mt-0.5">
                        {alloc.items.map(i => `${i.name}: ${formatCurrency(i.amount)}`).join(' · ')}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums font-bold text-emerald-400 shrink-0">
                      {formatCurrency(alloc.allocatedAmount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-[#282828]">
              <button
                type="button"
                disabled={isLaunching}
                onClick={() => setShowConfirmModal(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#242424] hover:bg-[#303030] text-[#F5F5F5] rounded-xl text-xs font-semibold cursor-pointer"
              >
                Voltar e editar
              </button>

              <button
                type="button"
                disabled={isLaunching}
                onClick={handleConfirmAndLaunch}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isLaunching ? 'Lançando nas Contas...' : 'CONFIRMAR E LANÇAR NAS CONTAS'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: RECIBO DE RESULTADO PÓS-CONFIRMAÇÃO                          */}
      {/* ===================================================================== */}
      {launchResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#161616] rounded-2xl border border-emerald-500/40 shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[#282828] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-emerald-400 block">
                    Operação Concluída com Sucesso
                  </span>
                  <h3 className="text-lg font-bold text-[#F5F5F5]">
                    {launchResult.operation.name} ({launchResult.operation.id})
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLaunchResult(null)}
                className="text-[#A1A1AA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs bg-[#121212] p-4 rounded-xl border border-[#262626]">
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Contas Debitadas</span>
                <strong className="text-sm text-[#F5F5F5] font-mono tabular-nums">
                  {launchResult.salesCreated.length} aluno(s)
                </strong>
              </div>
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Total Lançado</span>
                <strong className="text-sm text-emerald-400 font-mono tabular-nums">
                  {formatCurrency(launchResult.operation.totalDistributed)}
                </strong>
              </div>
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">Origem Financeira</span>
                <strong className="text-sm text-[#F5F5F5]">PDV de Passeios</strong>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#D4D4D8]">
                Lançamentos Individuais Gerados nas Contas Mensais:
              </h4>
              <div className="border border-[#282828] rounded-xl bg-[#121212] max-h-60 overflow-y-auto divide-y divide-[#222222] text-xs">
                {launchResult.salesCreated.map(sale => (
                  <div key={sale.id} className="p-3 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-emerald-400 font-semibold">{sale.id}</span>
                      <span className="mx-2 text-[#52525B]">·</span>
                      <strong className="text-[#F5F5F5]">{sale.studentName}</strong>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-[#F5F5F5]">
                      {formatCurrency(sale.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const op = launchResult.operation;
                  setLaunchResult(null);
                  setViewingOperation(op);
                  setActiveSubTab('history');
                }}
                className="px-4 py-2 bg-[#242424] hover:bg-[#303030] text-[#F5F5F5] rounded-xl text-xs font-semibold cursor-pointer"
              >
                Ver Detalhes no Histórico
              </button>
              <button
                type="button"
                onClick={() => setLaunchResult(null)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: DETALHES DA OPERAÇÃO, PARTICIPANTES E AUDITORIA              */}
      {/* ===================================================================== */}
      {viewingOperation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#161616] rounded-2xl border border-[#2C2C2C] shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#282828] pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                  <span>{viewingOperation.id}</span>
                  <span>·</span>
                  <span>{formatDate(viewingOperation.tripDate)}</span>
                  <span>·</span>
                  <span>{viewingOperation.destination}</span>
                </div>
                <h3 className="text-lg font-bold text-[#F5F5F5] mt-0.5">
                  {viewingOperation.name}
                </h3>
                {viewingOperation.description && (
                  <p className="text-xs text-[#A1A1AA] mt-0.5">{viewingOperation.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {viewingOperation.status !== 'RASCUNHO' &&
                  viewingOperation.status !== 'ESTORNADO' &&
                  userPermissions.canReverseLaunches && (
                    <button
                      type="button"
                      onClick={() => {
                        setReversingTarget({
                          operation: viewingOperation,
                          amount: viewingOperation.totalDistributed,
                        });
                        setReverseReason('');
                        setReverseError(null);
                      }}
                      className="px-3.5 py-2 bg-red-950/50 hover:bg-red-900/60 border border-red-500/30 text-red-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Estornar Operação Completa</span>
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => setViewingOperation(null)}
                  className="p-2 text-[#A1A1AA] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Items of this Trip */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#D4D4D8]">
                Produtos e Despesas Registrados ({viewingOperation.items.length}):
              </h4>
              <div className="border border-[#282828] rounded-xl bg-[#121212] overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#242424] bg-[#181818] text-[#A1A1AA]">
                      <th className="py-2 px-3">Item / Despesa</th>
                      <th className="py-2 px-3">Categoria</th>
                      <th className="py-2 px-3 text-right">Qtd</th>
                      <th className="py-2 px-3 text-right">Unitário</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222222]">
                    {viewingOperation.items.map(it => (
                      <tr key={it.id}>
                        <td className="py-2 px-3 font-medium text-[#F5F5F5]">{it.name}</td>
                        <td className="py-2 px-3 text-[#A1A1AA]">{it.category}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-[#D4D4D8]">
                          {it.quantity}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-[#D4D4D8]">
                          {formatCurrency(it.unitPrice)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                          {formatCurrency(it.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Individual Participant Launches */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#D4D4D8]">
                Lançamentos Individuais por Aluno Participante ({viewingOperation.participants.length}):
              </h4>
              <div className="border border-[#282828] rounded-xl bg-[#121212] overflow-hidden max-h-72 overflow-y-auto divide-y divide-[#222222]">
                {viewingOperation.participants.map(part => {
                  const linkedSale = sales.find(s => s.id === part.saleId);
                  return (
                    <div key={part.studentId} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-[#F5F5F5]">{part.studentName}</strong>
                          <span className="font-mono text-[11px] text-[#71717A]">
                            ({part.registrationNumber})
                          </span>
                          {part.saleId && (
                            <span className="font-mono text-[11px] text-emerald-400">
                              · Doc: {part.saleId}
                            </span>
                          )}
                          {linkedSale?.invoiceId && (
                            <span className="font-mono text-[11px] text-blue-400">
                              · Fatura: {linkedSale.invoiceId}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-[#A1A1AA]">
                          {part.items.map(i => `${i.name}: ${formatCurrency(i.amount)}`).join(' · ')}
                        </div>

                        {part.status === 'ESTORNADO' && (
                          <div className="text-[11px] text-red-400">
                            Estornado por {part.reversedByUserName} — Motivo: {part.reversedReason}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span
                            className={`font-mono tabular-nums font-bold block ${
                              part.status === 'ESTORNADO'
                                ? 'line-through text-[#71717A]'
                                : 'text-emerald-400'
                            }`}
                          >
                            {formatCurrency(part.allocatedAmount)}
                          </span>
                          <span className="text-[10px] text-[#A1A1AA]">
                            {part.status === 'LANCADO'
                              ? 'Lançado na Conta'
                              : part.status === 'ESTORNADO'
                              ? 'Estornado'
                              : 'Rascunho'}
                          </span>
                        </div>

                        {part.status === 'LANCADO' && userPermissions.canReverseLaunches && (
                          <button
                            type="button"
                            onClick={() => {
                              setReversingTarget({
                                operation: viewingOperation,
                                studentId: part.studentId,
                                studentName: part.studentName,
                                amount: part.allocatedAmount,
                              });
                              setReverseReason('');
                              setReverseError(null);
                            }}
                            className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 rounded-lg text-[11px] font-semibold cursor-pointer"
                          >
                            Estornar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Operation Audit History */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#D4D4D8]">
                Trilha de Auditoria e Histórico de Alterações ({viewingOperation.history.length}):
              </h4>
              <div className="border border-[#282828] rounded-xl bg-[#121212] p-3 space-y-2 max-h-48 overflow-y-auto text-xs">
                {viewingOperation.history.map(h => (
                  <div key={h.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#1E1E1E] last:border-0 pb-2 last:pb-0">
                    <div>
                      <span className="font-mono text-[11px] text-emerald-400 font-semibold">
                        {h.action}
                      </span>
                      <span className="mx-1.5 text-[#52525B]">·</span>
                      <span className="text-[#D4D4D8]">{h.details}</span>
                    </div>
                    <div className="text-[11px] text-[#71717A] font-mono shrink-0">
                      {h.userName} · {formatDateTime(h.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: CONFIRMAÇÃO DE ESTORNO COM JUSTIFICATIVA OBRIGATÓRIA         */}
      {/* ===================================================================== */}
      {reversingTarget && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#181818] rounded-2xl border border-red-500/40 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#282828] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-red-400" />
                <span>
                  {reversingTarget.studentId
                    ? 'Estornar Lançamento Individual'
                    : 'Estornar Operação de Passeio'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setReversingTarget(null)}
                className="text-[#A1A1AA] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#121212] border border-[#282828] text-xs space-y-1">
              <p className="text-[#A1A1AA]">
                Passeio: <strong className="text-white">{reversingTarget.operation.name}</strong>
              </p>
              {reversingTarget.studentName && (
                <p className="text-[#A1A1AA]">
                  Aluno: <strong className="text-white">{reversingTarget.studentName}</strong>
                </p>
              )}
              <p className="text-[#A1A1AA]">
                Valor a Estornar:{' '}
                <strong className="text-red-400 font-mono tabular-nums">
                  {formatCurrency(reversingTarget.amount)}
                </strong>
              </p>
            </div>

            {reverseError && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
                {reverseError}
              </div>
            )}

            <form onSubmit={handleExecuteReversal} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#F5F5F5] mb-1">
                  Justificativa Obrigatória para Auditoria *
                </label>
                <textarea
                  rows={3}
                  required
                  value={reverseReason}
                  onChange={e => setReverseReason(e.target.value)}
                  placeholder="Informe o motivo do estorno (ex: Aluno não compareceu ao passeio por atestado médico)..."
                  className="w-full p-2.5 bg-[#121212] border border-[#323232] rounded-xl text-[#F5F5F5] focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReversingTarget(null)}
                  className="px-4 py-2 bg-[#242424] hover:bg-[#303030] text-[#D4D4D8] rounded-xl font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReversing}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold cursor-pointer disabled:opacity-50"
                >
                  {isReversing ? 'Estornando...' : 'Confirmar Estorno Auditável'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
