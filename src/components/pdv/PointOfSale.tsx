import React, { useState, useMemo, useDeferredValue, useRef, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Check, 
  RotateCcw, 
  Receipt, 
  User, 
  AlertCircle, 
  Printer, 
  Barcode, 
  Package, 
  Sparkles,
  ArrowRight,
  CreditCard,
  Building2,
  X,
  Image as ImageIcon,
  Download,
  Eye,
  FileCheck2
} from 'lucide-react';
import { Product, Student, Sale, ProductCategory, PaymentMethod, SalesReceipt, SystemSettings } from '../../types';
import { formatCurrency, formatDateTime, formatProductPrice, isProductPricePending } from '../../utils/formatters';
import { api, type SaleReversalBundle, type SaleTransactionBundle } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getProductImages, getCategoryBadgeColor, OFFICIAL_PRODUCT_CATEGORIES } from '../../utils/productImages';
import { ReceiptPreviewModal, triggerScopedReceiptPrint } from '../receipts/ReceiptPreviewModal';
import { ReceiptDocumentView } from '../receipts/ReceiptDocumentView';
import { downloadReceiptPdf, resolveEffectiveReceiptSettings } from '../../utils/receiptPdf';
import { getInitialsAvatar } from '../../utils/avatar';
import { createPortal } from 'react-dom';

interface PointOfSaleProps {
  products: Product[];
  students: Student[];
  sales: Sale[];
  receipts?: SalesReceipt[];
  settings?: SystemSettings | null;
  onSaleCompleted: (bundle: SaleTransactionBundle) => void;
  onSaleReversed: (bundle: SaleReversalBundle) => void;
  onReceiptUpdated?: (receipt: SalesReceipt) => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CONTA_ALUNO: 'Conta do Aluno (Faturamento Posterior)',
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão de Crédito',
  CARTAO_DEBITO: 'Cartão de Débito',
  MERCADO_PAGO: 'Mercado Pago',
};

export function PointOfSale({ 
  products, 
  students, 
  sales, 
  receipts = [],
  settings = null,
  onSaleCompleted, 
  onSaleReversed,
  onReceiptUpdated
}: PointOfSaleProps) {
  const { user, canManage } = useAuth();
  const { isOnline } = useOnlineStatus();

  // State
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<'VALIDANDO' | 'PROCESSANDO' | 'CONFIRMANDO' | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<SalesReceipt | null>(null);
  const [isExportingCompletedPdf, setIsExportingCompletedPdf] = useState(false);
  const [previewModalState, setPreviewModalState] = useState<{
    receipt: SalesReceipt;
    isSecondCopy: boolean;
    mode: 'SALE' | 'REVERSAL';
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CONTA_ALUNO');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [saleNotes, setSaleNotes] = useState('');
  
  // Reversal modal state
  const [reversalSale, setReversalSale] = useState<Sale | null>(null);
  const [reversalMode, setReversalMode] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [partialQuantities, setPartialQuantities] = useState<Record<string, number>>({});
  const [reversalReason, setReversalReason] = useState('');
  const [reversalConfirmed, setReversalConfirmed] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [reversalSuccessMessage, setReversalSuccessMessage] = useState<string | null>(null);

  // Locks síncronos contra duplo clique e chave de idempotência vinculada ao checkout atual
  const submittingLockRef = useRef(false);
  const reversingLockRef = useRef(false);
  const pendingIdempotencyRef = useRef<{ signature: string; key: string } | null>(null);
  const pendingReversalKeyRef = useRef<{ saleId: string; key: string } | null>(null);

  // Active view tab in PDV: 'terminal' or 'history'
  const [pdvTab, setPdvTab] = useState<'terminal' | 'history'>('terminal');

  const deferredStudentSearch = useDeferredValue(studentSearch);
  const deferredProductSearch = useDeferredValue(productSearch);

  // Filter students (mostra todos os 17 alunos da 10ª Turma)
  const filteredStudents = useMemo(() => {
    const q = deferredStudentSearch.trim().toLowerCase();
    if (!q) return students.filter(s => s.status === 'ACTIVE');
    return students.filter(
      s => s.status === 'ACTIVE' && (
        s.name.toLowerCase().includes(q) || 
        s.registrationNumber.toLowerCase().includes(q)
      )
    );
  }, [students, deferredStudentSearch]);

  // 6 Categorias oficiais da Lojinha
  const categories = useMemo<(ProductCategory | 'TODAS')[]>(
    () => ['TODAS', ...OFFICIAL_PRODUCT_CATEGORIES],
    []
  );

  // Filter products (somente ativos e não arquivados)
  const filteredProducts = useMemo(() => {
    const q = deferredProductSearch.trim().toLowerCase();
    return products.filter(p => {
      if (p.archived || p.status !== 'ACTIVE') return false;
      const matchesCat = selectedCategory === 'TODAS' || p.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) || 
        p.internalCode.toLowerCase().includes(q) || 
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });
  }, [products, selectedCategory, deferredProductSearch]);

  // Cart operations
  const addToCart = (product: Product) => {
    if (product.archived || product.status !== 'ACTIVE') {
      setSaleError(`O produto "${product.name}" está inativo/arquivado e não pode ser vendido.`);
      return;
    }
    if (isProductPricePending(product)) {
      setSaleError('Este produto não possui preço definido e não pode ser vendido.');
      return;
    }
    if (product.currentStock <= 0) {
      setSaleError(`Estoque insuficiente para o produto "${product.name}". Disponível: ${product.currentStock}. Solicitado: 1.`);
      return;
    }
    setSaleError(null);
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          setSaleError(
            `Estoque insuficiente para o produto "${product.name}". Disponível: ${product.currentStock}. Solicitado: ${existing.quantity + 1}.`
          );
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.product.currentStock) return item;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSaleError(null);
  };

  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (Number(item.product.price || 0) * item.quantity), 0);
  }, [cart]);

  const parsedDiscount = useMemo(() => {
    if (!canManage) return 0;
    const raw = Number(discountAmount);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(raw, cartSubtotal);
  }, [canManage, discountAmount, cartSubtotal]);

  const cartTotal = useMemo(() => {
    return Math.max(0, Number((cartSubtotal - parsedDiscount).toFixed(2)));
  }, [cartSubtotal, parsedDiscount]);

  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = productSearch.trim().toLowerCase();
    if (!q) return;
    const exactMatch = products.find(
      p =>
        !p.archived &&
        p.status === 'ACTIVE' &&
        ((p.barcode && p.barcode.toLowerCase() === q) || p.internalCode.toLowerCase() === q)
    );
    if (exactMatch) {
      e.preventDefault();
      addToCart(exactMatch);
      setProductSearch('');
    }
  };

  // Assinatura determinística do carrinho atual para reutilizar a mesma chave de idempotência em retentativas/duplo clique
  const checkoutSignature = useMemo(() => {
    const itemsSig = cart
      .map(i => `${i.product.id}:${i.quantity}`)
      .sort()
      .join('|');
    return `${selectedStudent?.id || ''}|${paymentMethod}|${parsedDiscount}|${itemsSig}`;
  }, [cart, selectedStudent?.id, paymentMethod, parsedDiscount]);

  useEffect(() => {
    if (pendingIdempotencyRef.current && pendingIdempotencyRef.current.signature !== checkoutSignature) {
      pendingIdempotencyRef.current = null;
    }
  }, [checkoutSignature]);

  // Finalize Sale (Atômico + Idempotente + Trava Síncrona contra duplo clique)
  const handleFinalizeSale = async () => {
    if (submittingLockRef.current || isSubmitting) {
      return;
    }

    if (!isOnline) {
      setSaleError('Modo offline ativo: conecte-se ao servidor para registrar vendas e baixar estoque.');
      return;
    }

    if (!selectedStudent) {
      setSaleError('Por favor, identifique e selecione o aluno antes de finalizar a venda.');
      return;
    }

    if (selectedStudent.status !== 'ACTIVE') {
      setSaleError(`O aluno ${selectedStudent.name} está inativo e não pode realizar compras.`);
      return;
    }

    if (cart.length === 0) {
      setSaleError('O carrinho está vazio.');
      return;
    }

    // Pré-validação rigorosa antes de iniciar a transação
    setSubmitStage('VALIDANDO');
    for (const item of cart) {
      const freshProduct = products.find(p => p.id === item.product.id) || item.product;
      if (!freshProduct || freshProduct.archived || freshProduct.status !== 'ACTIVE') {
        setSubmitStage(null);
        setSaleError(`O produto "${item.product.name}" está inativo/arquivado e não pode ser vendido.`);
        return;
      }
      if (isProductPricePending(freshProduct) || !freshProduct.price || Number(freshProduct.price) <= 0) {
        setSubmitStage(null);
        setSaleError('Este produto não possui preço definido e não pode ser vendido.');
        return;
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        setSubmitStage(null);
        setSaleError('Quantidade inválida no carrinho. Todos os itens devem ter quantidade maior que zero.');
        return;
      }
      if (settings?.blockSaleWithoutStock !== false && freshProduct.currentStock < item.quantity) {
        setSubmitStage(null);
        setSaleError(
          `Estoque insuficiente para o produto "${freshProduct.name}". Disponível: ${freshProduct.currentStock}. Solicitado: ${item.quantity}.`
        );
        return;
      }
    }

    if (cartTotal <= 0) {
      setSubmitStage(null);
      setSaleError('O total da venda deve ser maior que zero.');
      return;
    }

    submittingLockRef.current = true;
    setIsSubmitting(true);
    setSubmitStage('PROCESSANDO');
    setSaleError(null);

    // Chave de idempotência estável por tentativa de venda (reutilizada em duplo clique ou retry)
    if (!pendingIdempotencyRef.current || pendingIdempotencyRef.current.signature !== checkoutSignature) {
      const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
      pendingIdempotencyRef.current = {
        signature: checkoutSignature,
        key: `IDEMP-${Date.now()}-${randomPart}`,
      };
    }
    const idempotencyKey = pendingIdempotencyRef.current.key;

    try {
      const parsedPaid = paymentMethod === 'DINHEIRO' && amountPaidInput.trim()
        ? Math.max(cartTotal, Number(amountPaidInput) || cartTotal)
        : undefined;

      const payload = {
        studentId: selectedStudent.id,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity
        })),
        paymentMethod,
        amountPaid: parsedPaid,
        discountAmount: parsedDiscount > 0 ? parsedDiscount : undefined,
        notes: saleNotes.trim() || undefined,
        idempotencyKey
      };

      const res = await api.createSale(payload);

      // Verificação explícita da confirmação completa antes de exibir sucesso
      setSubmitStage('CONFIRMANDO');
      if (!res?.sale || res.sale.status !== 'COMPLETED' || !res.receipt || res.receipt.saleId !== res.sale.id) {
        throw new Error('A persistência completa da venda e do recibo não foi confirmada. Nenhuma conclusão foi exibida.');
      }

      // Commit atômico no estado da aplicação + snapshot local (lança erro se falhar)
      onSaleCompleted(res);

      // Somente após persistência confirmada: limpar carrinho e exibir sucesso/recibo
      pendingIdempotencyRef.current = null;
      setCompletedSale(res.sale);
      setCompletedReceipt(res.receipt);
      setCart([]);
      setSelectedStudent(null);
      setStudentSearch('');
      setDiscountAmount('0');
      setAmountPaidInput('');
      setSaleNotes('');

      const eff = resolveEffectiveReceiptSettings(settings);
      if (eff.autoPrintOnSale && res.receipt) {
        setTimeout(() => {
          triggerScopedReceiptPrint(eff.defaultPrintFormat || '80mm');
        }, 180);
      }
    } catch (err: any) {
      setSaleError(err?.message || 'Erro ao registrar venda. Nenhuma alteração parcial foi confirmada.');
    } finally {
      submittingLockRef.current = false;
      setIsSubmitting(false);
      setSubmitStage(null);
    }
  };

  const openReceiptForSale = async (sale: Sale, isSecondCopy = false, mode: 'SALE' | 'REVERSAL' = 'SALE') => {
    const localMatch = receipts.find(r => r.saleId === sale.id || r.id === sale.receiptId);
    if (localMatch) {
      setPreviewModalState({ receipt: localMatch, isSecondCopy, mode });
      return;
    }
    try {
      const fetched = await api.getReceiptBySaleId(sale.id);
      if (onReceiptUpdated) onReceiptUpdated(fetched);
      setPreviewModalState({ receipt: fetched, isSecondCopy, mode });
    } catch (err: any) {
      setSaleError(err?.message || 'Não foi possível localizar o recibo desta venda.');
    }
  };

  // Handle Reversal of a Sale (Full or Partial, Atômico + Idempotente)
  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalSale || reversingLockRef.current || isReversing) return;

    const trimmedReason = reversalReason.trim();
    if (!trimmedReason) {
      setReversalError('Preencha este campo. O motivo do estorno é obrigatório.');
      return;
    }

    if (!reversalConfirmed) {
      setReversalError('Confirme que deseja estornar esta venda e reverter estoque, consumo e registros financeiros.');
      return;
    }

    reversingLockRef.current = true;
    setIsReversing(true);
    setReversalError(null);

    try {
      if (reversalMode === 'PARTIAL') {
        const itemsToReverse = Object.entries(partialQuantities)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }));

        if (itemsToReverse.length === 0) {
          setReversalError('Selecione ao menos 1 item e quantidade para estorno parcial.');
          return;
        }

        const res = await api.partialReverseSale(reversalSale.id, {
          items: itemsToReverse,
          reason: trimmedReason,
        });
        onSaleReversed({
          sale: res.sale,
          student: res.student,
          receipt: res.receipt,
        });
        setReversalSale(null);
        setReversalReason('');
        setReversalConfirmed(false);
        setPartialQuantities({});
        setReversalSuccessMessage('Venda estornada com sucesso. Estoque, consumo e registros financeiros foram revertidos.');
        if (res.receipt) {
          setPreviewModalState({ receipt: res.receipt, isSecondCopy: false, mode: 'REVERSAL' });
        }
      } else {
        if (!pendingReversalKeyRef.current || pendingReversalKeyRef.current.saleId !== reversalSale.id) {
          pendingReversalKeyRef.current = {
            saleId: reversalSale.id,
            key: `REV-IDEMP-${reversalSale.id}-${Date.now()}`,
          };
        }
        const res = await api.reverseSale(reversalSale.id, trimmedReason, pendingReversalKeyRef.current.key);
        onSaleReversed(res);
        pendingReversalKeyRef.current = null;
        setReversalSale(null);
        setReversalReason('');
        setReversalConfirmed(false);
        setPartialQuantities({});
        setReversalSuccessMessage('Venda estornada com sucesso. Estoque, consumo e registros financeiros foram revertidos.');
        if (res.receipt) {
          setPreviewModalState({ receipt: res.receipt, isSecondCopy: false, mode: 'REVERSAL' });
        }
      }
    } catch (err: any) {
      setReversalError(err?.message || 'Erro ao estornar venda.');
    } finally {
      reversingLockRef.current = false;
      setIsReversing(false);
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Header of PDV */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111111] p-4 rounded-xl border border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-white" />
            <h2 className="text-base font-semibold text-white tracking-tight">
              Ponto de Venda (PDV & Cupons)
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Lançamento rápido no balcão, emissão de cupom na conta mensal e baixa automática de estoque físico.
          </p>
        </div>

        <div className="flex bg-[#18181b] p-1 rounded-lg border border-white/[0.08] text-xs">
          <button
            onClick={() => setPdvTab('terminal')}
            className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              pdvTab === 'terminal' 
                ? 'bg-white text-black font-semibold shadow-sm' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Emitir Venda & Cupom
          </button>
          <button
            onClick={() => setPdvTab('history')}
            className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              pdvTab === 'history' 
                ? 'bg-white text-black font-semibold shadow-sm' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Histórico de Vendas & Cupons ({sales.length})
          </button>
        </div>
      </div>

      {pdvTab === 'terminal' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Left Column: Student Selection & Product Grid (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Step 1: Student Identification */}
            <div className="bg-[#1B1B1B] rounded-2xl p-4 border border-[#282828] shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold">1</span>
                  <h3 className="font-bold text-[#F5F5F5] text-xs uppercase tracking-wider">Identificação do Aluno</h3>
                </div>
                {selectedStudent && (
                  <button
                    onClick={() => {
                      setSelectedStudent(null);
                      setStudentSearch('');
                    }}
                    className="text-xs text-rose-400 hover:underline font-semibold cursor-pointer"
                  >
                    Trocar aluno
                  </button>
                )}
              </div>

              {!selectedStudent ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Pesquisar aluno da 10ª Turma por nome ou código (ex: EC10-001)..."
                      className="w-full pl-9 pr-4 py-2 bg-[#151515] border border-[#282828] rounded-xl text-xs text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                    {filteredStudents.map(student => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => {
                          setSelectedStudent(student);
                          setSaleError(null);
                        }}
                        className="p-3 text-left bg-[#151515] hover:bg-[#202020] border border-[#262626] hover:border-[#383838] rounded-xl flex items-center gap-3 transition cursor-pointer"
                      >
                        <img 
                          src={student.avatar || getInitialsAvatar(student.name)} 
                          alt={student.name}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover border border-[#303030]" 
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[#F5F5F5] truncate">{student.name}</p>
                          <p className="text-[11px] text-[#A1A1AA] font-mono">Código: {student.registrationNumber}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          Selecionar
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-[#171717] border border-[#2E2E2E] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img 
                      src={selectedStudent.avatar || getInitialsAvatar(selectedStudent.name)} 
                      alt={selectedStudent.name}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover border border-[#404040]" 
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-[#F5F5F5] text-sm">{selectedStudent.name}</span>
                        <span className="px-2 py-0.5 bg-[#252525] text-[#A1A1AA] text-[10px] font-mono font-bold rounded-md">
                          {selectedStudent.registrationNumber}
                        </span>
                      </div>
                      <p className="text-xs text-[#A1A1AA] mt-0.5">
                        10ª Turma • Escola de Cristo - ICEVES (Formatura: 27 a 30)
                      </p>
                      {selectedStudent.consumptionBlocked && (
                        <p className="text-[11px] text-rose-400 font-bold mt-1">
                          Consumo bloqueado{selectedStudent.consumptionBlockedReason ? `: ${selectedStudent.consumptionBlockedReason}` : ''}
                        </p>
                      )}
                      {typeof selectedStudent.consumptionLimit === 'number' && selectedStudent.consumptionLimit > 0 && (
                        <p className="text-[11px] text-amber-300 font-medium mt-0.5">
                          Limite de consumo: {formatCurrency(selectedStudent.consumptionLimit)}
                        </p>
                      )}
                      {selectedStudent.notes && (
                        <p className="text-[11px] text-amber-400 font-medium mt-1">
                          ⚠️ {selectedStudent.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[#71717A]">Consumo no Mês</span>
                    <span className="block text-base font-extrabold text-emerald-400 font-mono">
                      {formatCurrency(selectedStudent.currentConsumptionBalance)}
                    </span>
                    {Number(selectedStudent.creditBalance || 0) > 0 ? (
                      <span className="text-[10px] text-teal-300 font-semibold">
                        Crédito: {formatCurrency(selectedStudent.creditBalance || 0)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#71717A]">Lançamento direto</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Catalog & Products Grid */}
            <div className="bg-[#1B1B1B] rounded-2xl p-4 border border-[#282828] shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold">2</span>
                  <h3 className="font-bold text-[#F5F5F5] text-xs uppercase tracking-wider">Produtos Disponíveis</h3>
                </div>

                {/* Product Search & Barcode Scanner */}
                <div className="relative w-full sm:w-72">
                  <Barcode className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={handleProductSearchKeyDown}
                    placeholder="Buscar produto, código ou ler barras (Enter)..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-[#282828] text-[#F5F5F5] border border-[#3A3A3A]'
                        : 'bg-[#151515] text-[#A1A1AA] hover:text-[#F5F5F5] border border-transparent'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Grid of Products */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[460px] overflow-y-auto pr-1">
                {filteredProducts.map(product => {
                  const isOutOfStock = product.currentStock <= 0;
                  const isPendingPrice = isProductPricePending(product);
                  const isBlocked = isOutOfStock || isPendingPrice;
                  const isLowStock = product.currentStock > 0 && product.currentStock <= product.minStock;
                  const imgs = getProductImages(product);
                  const coverImg = imgs[0];
                  const badge = getCategoryBadgeColor(product.category);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={isBlocked}
                      onClick={() => addToCart(product)}
                      className={`text-left p-2.5 rounded-2xl border flex flex-col justify-between transition group ${
                        isBlocked 
                          ? 'bg-[#141414] border-[#222222] opacity-55 cursor-not-allowed'
                          : 'bg-[#151515] hover:bg-[#1E1E1E] border-[#262626] hover:border-[#383838] cursor-pointer'
                      }`}
                    >
                      <div>
                        {/* Imagem do Produto com tag da Categoria */}
                        <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden bg-[#101010] border border-[#222222] mb-2 flex items-center justify-center">
                          {coverImg ? (
                            <img
                              src={coverImg}
                              alt={product.name}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-[#444]">
                              <Package className="w-6 h-6 text-[#333]" />
                            </div>
                          )}

                          {/* Tag da categoria com cor correspondente */}
                          <span className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold border backdrop-blur-md ${badge.bg} ${badge.text} ${badge.border}`}>
                            {product.category}
                          </span>

                          {/* Indicador de fotos (até 3) */}
                          {imgs.length > 1 && (
                            <span className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-xs text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-white/10">
                              📷 {imgs.length}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-mono text-[#71717A]">
                            {product.internalCode}
                          </span>
                          {isPendingPrice ? (
                            <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                              Sem preço
                            </span>
                          ) : isOutOfStock ? (
                            <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                              Esgotado
                            </span>
                          ) : isLowStock ? (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                              {product.currentStock} rest.
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-[#A1A1AA] bg-[#202020] px-1.5 py-0.2 rounded">
                              {product.currentStock} {product.unit}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-[#F5F5F5] group-hover:text-emerald-400 transition line-clamp-2 leading-snug">
                          {product.name}
                        </h4>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-[#222222] flex items-center justify-between gap-1">
                        {isPendingPrice ? (
                          <span className="text-[11px] font-bold text-amber-300 leading-tight">
                            Preço não definido
                          </span>
                        ) : (
                          <span className="text-sm font-extrabold text-[#F5F5F5] font-mono">
                            {formatProductPrice(product.price, product.priceStatus)}
                          </span>
                        )}
                        <div className={`p-1.5 rounded-lg text-white transition ${
                          isBlocked ? 'bg-[#282828] text-[#555]' : 'bg-[#282828] group-hover:bg-gradient-to-r group-hover:from-emerald-500 group-hover:to-teal-600 group-hover:text-white'
                        }`}>
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Cart Panel (4 cols) */}
          <div className="lg:col-span-4">
            <div className="card-borda-conica sticky top-20 shadow-sm">
              <div className="conteudo bg-[#1B1B1B] border border-[#282828] p-4 space-y-4">
              
              <div className="flex items-center justify-between border-b border-[#242424] pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-extrabold text-[#F5F5F5] text-sm">Carrinho de Compras</h3>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-[#71717A] hover:text-rose-400 transition cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Student indicator in Cart */}
              <div className="p-2.5 rounded-xl bg-[#151515] border border-[#262626] text-xs flex items-center justify-between">
                <span className="text-[#A1A1AA]">Aluno no Caixa:</span>
                <span className="font-bold text-[#F5F5F5] truncate max-w-[170px]">
                  {selectedStudent ? selectedStudent.name : 'Nenhum selecionado'}
                </span>
              </div>

              {/* Forma de Pagamento / Lançamento */}
              <div className="space-y-1.5 text-xs">
                <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block">
                  Forma de Pagamento / Lançamento:
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { id: 'CONTA_ALUNO', label: 'Conta do Aluno' },
                    { id: 'DINHEIRO', label: 'Dinheiro' },
                    { id: 'PIX', label: 'PIX' },
                    { id: 'CARTAO_CREDITO', label: 'Cartão Crédito' },
                    { id: 'CARTAO_DEBITO', label: 'Cartão Débito' },
                    { id: 'MERCADO_PAGO', label: 'Mercado Pago' },
                  ] as Array<{ id: PaymentMethod; label: string }>).map(pm => (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`p-2 rounded-xl border text-center font-bold text-[11px] transition cursor-pointer ${
                        paymentMethod === pm.id
                          ? 'bg-[#222222] border-emerald-500 text-[#F5F5F5]'
                          : 'bg-[#151515] border-[#262626] text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>

                {paymentMethod === 'DINHEIRO' && cart.length > 0 && (
                  <div className="pt-1.5 flex items-center justify-between gap-2">
                    <label className="text-[10px] font-bold text-[#A1A1AA] uppercase">
                      Valor Recebido (R$):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={cartTotal}
                      value={amountPaidInput}
                      onChange={(e) => setAmountPaidInput(e.target.value)}
                      placeholder={cartTotal.toFixed(2)}
                      className="w-28 px-2.5 py-1 bg-[#151515] border border-[#282828] rounded-lg text-[#F5F5F5] font-mono text-xs focus:border-emerald-500 focus:outline-none text-right"
                    />
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {cart.length === 0 ? (
                  <div className="py-8 text-center text-[#71717A] space-y-2">
                    <Package className="w-8 h-8 mx-auto text-[#333333]" />
                    <p className="text-xs">Nenhum item adicionado ao carrinho.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div 
                      key={item.product.id}
                      className="p-2.5 bg-[#161616] rounded-xl border border-[#242424] flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#F5F5F5] truncate">{item.product.name}</p>
                        <p className="text-[11px] text-[#A1A1AA] font-mono">
                          {formatProductPrice(item.product.price, item.product.priceStatus)} un.
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="w-6 h-6 rounded-md bg-[#222222] text-[#F5F5F5] hover:bg-[#2A2A2A] flex items-center justify-center transition cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold text-[#F5F5F5]">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          disabled={item.quantity >= item.product.currentStock}
                          className="w-6 h-6 rounded-md bg-[#222222] text-[#F5F5F5] hover:bg-[#2A2A2A] flex items-center justify-center transition cursor-pointer disabled:opacity-40"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="w-6 h-6 text-[#71717A] hover:text-rose-400 flex items-center justify-center transition cursor-pointer ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-right min-w-[55px]">
                        <span className="text-xs font-bold text-[#F5F5F5] font-mono">
                          {formatCurrency(Number(item.product.price || 0) * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desconto autorizado (Admin/Gerente) e Observação */}
              {canManage && cart.length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-[#71717A] uppercase block mb-1">
                      Desconto (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={cartSubtotal}
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#71717A] uppercase block mb-1">
                      Observação
                    </label>
                    <input
                      type="text"
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      placeholder="Opcional..."
                      className="w-full px-2.5 py-1.5 bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="pt-3 border-t border-[#242424] space-y-1.5 text-xs">
                <div className="flex justify-between text-[#A1A1AA]">
                  <span>Itens no Carrinho:</span>
                  <span className="font-semibold text-[#F5F5F5]">{cart.reduce((acc, i) => acc + i.quantity, 0)} un.</span>
                </div>
                {parsedDiscount > 0 && (
                  <div className="flex justify-between text-amber-300">
                    <span>Desconto Autorizado:</span>
                    <span className="font-mono font-semibold">- {formatCurrency(parsedDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold text-[#F5F5F5] pt-1 border-t border-[#242424]">
                  <span>Total da Venda:</span>
                  <span className="text-emerald-400 font-mono">{formatCurrency(cartTotal)}</span>
                </div>
              </div>

              {!isOnline && (
                <div className="p-3 bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs rounded-xl">
                  Modo offline: vendas no caixa ficam bloqueadas até o restabelecimento da conexão com o servidor.
                </div>
              )}

              {/* Error box */}
              {saleError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{saleError}</span>
                </div>
              )}

              {/* Action Button: Confirm and Bill */}
              <button
                type="button"
                disabled={!isOnline || isSubmitting || cart.length === 0 || !selectedStudent}
                onClick={handleFinalizeSale}
                className="w-full py-3 px-4 rounded-xl font-extrabold text-xs text-[#101010] bg-[#F5F5F5] hover:bg-white active:scale-98 transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                    <span>
                      {submitStage === 'VALIDANDO'
                        ? 'Validando itens...'
                        : submitStage === 'CONFIRMANDO'
                          ? 'Confirmando persistência...'
                          : 'Processando venda...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Venda no Caixa</span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-[#71717A]">
                Operação atômica com idempotência e reversão automática em caso de falha.
              </p>

              </div>
            </div>
          </div>

        </div>
      ) : (
        /* History & Reversals Tab */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[#F5F5F5] text-base">Histórico de Vendas no Caixa</h3>
              <p className="text-xs text-[#A1A1AA]">
                Consulte cupons emitidos e realize estornos de vendas incorretas com reversão de estoque
              </p>
            </div>
            <button
              onClick={() => setPdvTab('terminal')}
              className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Voltar ao Terminal <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {reversalSuccessMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center justify-between gap-3">
              <span>{reversalSuccessMessage}</span>
              <button
                type="button"
                onClick={() => setReversalSuccessMessage(null)}
                className="text-emerald-400 hover:text-white font-bold cursor-pointer"
                aria-label="Fechar aviso"
              >
                &times;
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Cupom / Data</th>
                  <th className="py-3 px-4">Aluno / Matrícula</th>
                  <th className="py-3 px-4">Itens</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Operador</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {sales.map(sale => (
                  <tr key={sale.id} className="hover:bg-[#202020] transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#F5F5F5]">{sale.id}</span>
                        {sale.receiptCode && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-mono text-[10px] font-semibold">
                            {sale.receiptCode}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#71717A]">{formatDateTime(sale.createdAt)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-[#F5F5F5] block">{sale.studentName}</span>
                      <span className="text-[11px] font-mono text-[#A1A1AA]">{sale.registrationNumber}</span>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="truncate text-[#A1A1AA]" title={sale.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}>
                        {sale.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-mono font-extrabold ${sale.status === 'REVERSED' ? 'line-through text-[#71717A]' : 'text-[#F5F5F5]'}`}>
                        {formatCurrency(sale.total)}
                      </span>
                      {(sale.reversedAmount || 0) > 0 && sale.status !== 'REVERSED' && (
                        <span className="block text-[10px] text-amber-400 font-mono">
                          Estornado: -{formatCurrency(sale.reversedAmount || 0)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#A1A1AA]">{sale.operatorUserName}</td>
                    <td className="py-3 px-4">
                      {sale.status === 'COMPLETED' && !(sale.reversedAmount && sale.reversedAmount > 0) ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Concluída
                        </span>
                      ) : sale.status === 'COMPLETED' && (sale.reversedAmount || 0) > 0 ? (
                        <div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                            Estorno Parcial
                          </span>
                          {sale.reversedReason && (
                            <span className="block text-[10px] text-[#71717A] mt-0.5 truncate max-w-xs" title={sale.reversedReason}>
                              {sale.reversedReason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Estornada
                          </span>
                          {sale.reversedReason && (
                            <span className="block text-[10px] text-[#71717A] mt-0.5 truncate max-w-xs" title={sale.reversedReason}>
                              {sale.reversedReason}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openReceiptForSale(sale, false, 'SALE')}
                          title="Visualizar Recibo"
                          className="p-1.5 rounded-lg bg-[#242424] hover:bg-[#2E2E2E] text-zinc-200 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openReceiptForSale(sale, true, 'SALE')}
                          title="Reimprimir 2ª Via"
                          className="p-1.5 rounded-lg bg-[#242424] hover:bg-emerald-500/20 text-emerald-400 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {((sale.reversedAmount || 0) > 0 || sale.status === 'REVERSED') && (
                          <button
                            type="button"
                            onClick={() => openReceiptForSale(sale, false, 'REVERSAL')}
                            title="Comprovante de Estorno"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {sale.status === 'COMPLETED' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReversalSale(sale);
                              setReversalMode('FULL');
                              setPartialQuantities({});
                              setReversalReason('');
                              setReversalConfirmed(false);
                              setReversalError(null);
                              setReversalSuccessMessage(null);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition cursor-pointer flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Estornar
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#71717A] px-1">Estornado</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Post-Sale Automatic Receipt Confirmation Modal */}
      {completedSale && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-[#161618] rounded-2xl shadow-2xl border border-white/[0.12] max-w-lg w-full p-6 animate-modal-blur-in space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-white text-lg">Venda Concluída!</h3>
              <p className="text-xs text-zinc-400">
                Recibo oficial emitido e vinculado à operação do PDV
              </p>
            </div>

            {/* Summary KPI Cards required by spec */}
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-[#111113] p-3.5 rounded-xl border border-white/[0.08]">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Código Único da Venda</span>
                <span className="font-mono font-bold text-white">{completedSale.id}</span>
                {completedReceipt && (
                  <span className="block text-[10px] font-mono text-emerald-400">
                    Recibo: {completedReceipt.receiptCode}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Valor Total</span>
                <span className="font-mono font-extrabold text-base text-emerald-400">
                  {formatCurrency(completedSale.total)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Aluno</span>
                <span className="font-semibold text-white truncate block">{completedSale.studentName}</span>
                <span className="text-[10px] font-mono text-zinc-400">{completedSale.registrationNumber}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Forma de Pagamento</span>
                <span className="font-semibold text-zinc-200">
                  {PAYMENT_METHOD_LABELS[completedSale.paymentMethod || 'CONTA_ALUNO']}
                </span>
              </div>
            </div>

            {/* Live Compact Thermal Preview */}
            {completedReceipt && (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0B0B0D] p-3">
                <ReceiptDocumentView
                  receipt={completedReceipt}
                  settings={settings}
                  format={resolveEffectiveReceiptSettings(settings).defaultPrintFormat || '80mm'}
                  isSecondCopy={false}
                  mode="SALE"
                />
              </div>
            )}

            {/* Required 3 Action Buttons: IMPRIMIR RECIBO, BAIXAR PDF, NOVA VENDA */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (completedReceipt) {
                    try {
                      const updated = await api.recordReceiptAction(completedReceipt.id, 'PRINT');
                      setCompletedReceipt(updated);
                      if (onReceiptUpdated) onReceiptUpdated(updated);
                    } catch {
                      // non-blocking
                    }
                  }
                  const fmt = resolveEffectiveReceiptSettings(settings).defaultPrintFormat || '80mm';
                  triggerScopedReceiptPrint(fmt);
                }}
                className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <Printer className="w-3.5 h-3.5" />
                IMPRIMIR RECIBO
              </button>

              <button
                type="button"
                disabled={isExportingCompletedPdf || !completedReceipt}
                onClick={async () => {
                  if (!completedReceipt) return;
                  setIsExportingCompletedPdf(true);
                  try {
                    try {
                      const updated = await api.recordReceiptAction(completedReceipt.id, 'PDF');
                      setCompletedReceipt(updated);
                      if (onReceiptUpdated) onReceiptUpdated(updated);
                    } catch {
                      // non-blocking
                    }
                    await downloadReceiptPdf(completedReceipt, settings, {
                      isSecondCopy: false,
                      mode: 'SALE',
                    });
                  } finally {
                    setIsExportingCompletedPdf(false);
                  }
                }}
                className="py-2.5 px-3 bg-[#222227] hover:bg-[#2C2C33] border border-white/[0.12] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                {isExportingCompletedPdf ? 'GERANDO...' : 'BAIXAR PDF'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompletedSale(null);
                  setCompletedReceipt(null);
                }}
                className="py-2.5 px-3 bg-white hover:bg-zinc-200 text-black rounded-xl text-xs font-extrabold transition cursor-pointer"
              >
                NOVA VENDA
              </button>
            </div>
          </div>

          {/* Print Portal for Immediate Post-Sale Print */}
          {completedReceipt &&
            typeof document !== 'undefined' &&
            (() => {
              let root = document.getElementById('iceves-print-root');
              if (!root) {
                root = document.createElement('div');
                root.id = 'iceves-print-root';
                document.body.appendChild(root);
              }
              return createPortal(
                <ReceiptDocumentView
                  receipt={completedReceipt}
                  settings={settings}
                  format={resolveEffectiveReceiptSettings(settings).defaultPrintFormat || '80mm'}
                  isSecondCopy={false}
                  mode="SALE"
                />,
                root
              );
            })()}
        </div>
      )}

      {/* Sale Reversal Modal (Supports Full and Partial Item Reversal) */}
      {reversalSale && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-[#F5F5F5] text-base">Estorno de Venda ({reversalSale.id})</h3>
              </div>
              <button 
                onClick={() => setReversalSale(null)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="flex bg-[#121214] p-1 rounded-xl border border-[#282828] text-xs mb-3">
              <button
                type="button"
                onClick={() => setReversalMode('FULL')}
                className={`flex-1 py-1.5 rounded-lg font-semibold cursor-pointer ${
                  reversalMode === 'FULL' ? 'bg-rose-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Estorno Total ({formatCurrency(reversalSale.total - (reversalSale.reversedAmount || 0))})
              </button>
              <button
                type="button"
                onClick={() => setReversalMode('PARTIAL')}
                className={`flex-1 py-1.5 rounded-lg font-semibold cursor-pointer ${
                  reversalMode === 'PARTIAL' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Estorno Parcial (Por Item)
              </button>
            </div>

            <p className="text-xs text-[#A1A1AA] mb-3">
              O estorno irá atualizar o saldo de <strong>{reversalSale.studentName}</strong>, devolver os itens selecionados ao estoque físico e emitir o <strong>Comprovante de Estorno</strong> mantendo o recibo original no histórico.
            </p>

            {reversalError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleConfirmReversal} noValidate className="space-y-4">
              {reversalMode === 'PARTIAL' && (
                <div className="space-y-2 max-h-44 overflow-y-auto p-2.5 bg-[#141414] rounded-xl border border-[#282828]">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">
                    Selecione a quantidade a estornar de cada item:
                  </span>
                  {reversalSale.items.map((item) => {
                    const currentQty = partialQuantities[item.productId] || 0;
                    return (
                      <div key={item.productId} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-[#222] last:border-0">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-white block truncate">{item.name}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            Comprado: {item.quantity}x ({formatCurrency(item.unitPrice)})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={item.quantity}
                            value={currentQty}
                            onChange={(e) =>
                              setPartialQuantities((prev) => ({
                                ...prev,
                                [item.productId]: Math.max(0, Math.min(item.quantity, parseInt(e.target.value) || 0)),
                              }))
                            }
                            className="w-16 px-2 py-1 bg-[#1C1C1F] border border-[#333] rounded-lg text-white font-mono text-xs text-center"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#F5F5F5] mb-1">
                  Motivo Obrigatório do Estorno:
                </label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => {
                    setReversalReason(e.target.value);
                    if (reversalError) setReversalError(null);
                  }}
                  placeholder="Ex: Aluno desistiu do produto no balcão / Item registrado incorretamente..."
                  rows={3}
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-xs text-[#F5F5F5] focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#141414] border border-[#282828] text-xs text-[#D4D4D8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={reversalConfirmed}
                  onChange={(e) => {
                    setReversalConfirmed(e.target.checked);
                    if (reversalError) setReversalError(null);
                  }}
                  className="mt-0.5 accent-rose-500"
                />
                <span>
                  Confirmo o estorno desta venda e a reversão automática do estoque, consumo do aluno, recibo e registros financeiros.
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReversalSale(null);
                    setReversalConfirmed(false);
                    setReversalError(null);
                  }}
                  className="flex-1 py-2 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl text-xs font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReversing}
                  className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {isReversing ? 'Estornando...' : 'Confirmar & Gerar Comprovante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Receipt / 2nd Copy / Reversal Preview Modal */}
      {previewModalState && (
        <ReceiptPreviewModal
          receipt={previewModalState.receipt}
          settings={settings}
          isSecondCopy={previewModalState.isSecondCopy}
          initialMode={previewModalState.mode}
          onReceiptUpdated={onReceiptUpdated}
          onClose={() => setPreviewModalState(null)}
        />
      )}

    </div>
  );
}
