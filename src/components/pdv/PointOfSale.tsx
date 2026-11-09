import React, { useState, useMemo } from 'react';
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
  X
} from 'lucide-react';
import { Product, Student, Sale, ProductCategory } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface PointOfSaleProps {
  products: Product[];
  students: Student[];
  sales: Sale[];
  onSaleCompleted: (sale: Sale, student: Student) => void;
  onSaleReversed: (sale: Sale, student: Student) => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export function PointOfSale({ 
  products, 
  students, 
  sales, 
  onSaleCompleted, 
  onSaleReversed 
}: PointOfSaleProps) {
  const { user } = useAuth();

  // State
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [billingMethod, setBillingMethod] = useState<'MONTHLY_ACCOUNT' | 'IMMEDIATE_CASH'>('MONTHLY_ACCOUNT');
  
  // Reversal modal state
  const [reversalSale, setReversalSale] = useState<Sale | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [isReversing, setIsReversing] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Active view tab in PDV: 'terminal' or 'history'
  const [pdvTab, setPdvTab] = useState<'terminal' | 'history'>('terminal');

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students.filter(s => s.status === 'ACTIVE').slice(0, 5);
    const q = studentSearch.toLowerCase();
    return students.filter(
      s => s.status === 'ACTIVE' && (
        s.name.toLowerCase().includes(q) || 
        s.registrationNumber.toLowerCase().includes(q) ||
        s.classGroup.toLowerCase().includes(q)
      )
    );
  }, [students, studentSearch]);

  // Categories
  const categories: (ProductCategory | 'TODAS')[] = [
    'TODAS',
    'Bebidas',
    'Salgados & Lanches',
    'Doces & Sobremesas',
    'Papelaria & Material',
    'Uniformes & Merch'
  ];

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCat = selectedCategory === 'TODAS' || p.category === selectedCategory;
      const q = productSearch.toLowerCase();
      const matchesSearch = !q || (
        p.name.toLowerCase().includes(q) || 
        p.internalCode.toLowerCase().includes(q) || 
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
      return matchesCat && matchesSearch && p.status === 'ACTIVE';
    });
  }, [products, selectedCategory, productSearch]);

  // Cart operations
  const addToCart = (product: Product) => {
    if (product.currentStock <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          return prev; // cannot exceed stock
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

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
  }, [cart]);

  // Finalize Sale
  const handleFinalizeSale = async () => {
    if (!selectedStudent) {
      setSaleError('Por favor, identifique e selecione o aluno antes de finalizar a venda.');
      return;
    }

    if (cart.length === 0) {
      setSaleError('O carrinho está vazio.');
      return;
    }

    setIsSubmitting(true);
    setSaleError(null);

    // Double-click idempotency key
    const idempotencyKey = `IDEMP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    try {
      const payload = {
        studentId: selectedStudent.id,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity
        })),
        idempotencyKey
      };

      const res = await api.createSale(payload);
      onSaleCompleted(res.sale, res.student);
      setCompletedSale(res.sale);
      setCart([]);
      setSelectedStudent(null);
      setStudentSearch('');
    } catch (err: any) {
      setSaleError(err.message || 'Erro ao registrar venda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reversal of a Sale
  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalSale) return;
    if (!reversalReason.trim()) {
      setReversalError('O motivo do estorno é obrigatório.');
      return;
    }

    setIsReversing(true);
    setReversalError(null);

    try {
      const res = await api.reverseSale(reversalSale.id, reversalReason);
      onSaleReversed(res.sale, res.student);
      setReversalSale(null);
      setReversalReason('');
    } catch (err: any) {
      setReversalError(err.message || 'Erro ao estornar venda.');
    } finally {
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
                  <span className="w-5 h-5 rounded-full bg-[#8B7CFF]/20 text-[#8B7CFF] border border-[#8B7CFF]/30 flex items-center justify-center text-[10px] font-bold">1</span>
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
                      placeholder="Pesquisar por nome, matrícula (ex: 2024-0412) ou turma..."
                      className="w-full pl-9 pr-4 py-2 bg-[#151515] border border-[#282828] rounded-xl text-xs text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-[#8B7CFF] transition"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
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
                          src={student.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                          alt={student.name}
                          className="w-9 h-9 rounded-full object-cover border border-[#303030]" 
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[#F5F5F5] truncate">{student.name}</p>
                          <p className="text-[11px] text-[#A1A1AA] font-mono">Matrícula: {student.registrationNumber}</p>
                          <p className="text-[10px] text-[#71717A] truncate">{student.classGroup}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-[#8B7CFF] bg-[#8B7CFF]/10 border border-[#8B7CFF]/20 px-2 py-0.5 rounded-full">
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
                      src={selectedStudent.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                      alt={selectedStudent.name}
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
                        {selectedStudent.classGroup} • Responsável: {selectedStudent.guardians[0]?.relationship || 'Cadastrado'}
                      </p>
                      {selectedStudent.notes && (
                        <p className="text-[11px] text-amber-400 font-medium mt-1">
                          ⚠️ {selectedStudent.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[#71717A]">Consumo no Mês</span>
                    <span className="block text-base font-extrabold text-[#8B7CFF] font-mono">
                      {formatCurrency(selectedStudent.currentConsumptionBalance)}
                    </span>
                    <span className="text-[10px] text-[#71717A]">Lançamento direto</span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Catalog & Products Grid */}
            <div className="bg-[#1B1B1B] rounded-2xl p-4 border border-[#282828] shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#8B7CFF]/20 text-[#8B7CFF] border border-[#8B7CFF]/30 flex items-center justify-center text-[10px] font-bold">2</span>
                  <h3 className="font-bold text-[#F5F5F5] text-xs uppercase tracking-wider">Produtos Disponíveis</h3>
                </div>

                {/* Product Search */}
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar produto ou código..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-[#8B7CFF]"
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
                  const isLowStock = product.currentStock > 0 && product.currentStock <= product.minStock;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => addToCart(product)}
                      className={`text-left p-3 rounded-2xl border flex flex-col justify-between transition cursor-pointer group ${
                        isOutOfStock 
                          ? 'bg-[#141414] border-[#222222] opacity-50 cursor-not-allowed'
                          : 'bg-[#151515] hover:bg-[#1E1E1E] border-[#262626] hover:border-[#383838]'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="text-[10px] font-semibold text-[#71717A] uppercase tracking-wider">
                            {product.category.split(' ')[0]}
                          </span>
                          {isOutOfStock ? (
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
                        <h4 className="text-xs font-bold text-[#F5F5F5] group-hover:text-[#8B7CFF] transition line-clamp-2">
                          {product.name}
                        </h4>
                        <span className="text-[10px] font-mono text-[#71717A] block mt-0.5">
                          {product.internalCode}
                        </span>
                      </div>

                      <div className="mt-3 pt-2 border-t border-[#222222] flex items-center justify-between">
                        <span className="text-sm font-extrabold text-[#F5F5F5] font-mono">
                          {formatCurrency(product.price)}
                        </span>
                        <div className={`p-1.5 rounded-lg text-white transition ${
                          isOutOfStock ? 'bg-[#282828] text-[#555]' : 'bg-[#282828] group-hover:bg-[#8B7CFF] group-hover:text-white'
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
            <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-sm p-4 sticky top-20 space-y-4">
              
              <div className="flex items-center justify-between border-b border-[#242424] pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-[#8B7CFF]" />
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

              {/* Forma de Lançamento (Section 6 Requirement) */}
              <div className="space-y-1 text-xs">
                <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block">
                  Forma de Lançamento da Venda:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingMethod('MONTHLY_ACCOUNT')}
                    className={`p-2 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                      billingMethod === 'MONTHLY_ACCOUNT'
                        ? 'bg-[#222222] border-[#8B7CFF] text-[#F5F5F5]'
                        : 'bg-[#151515] border-[#262626] text-[#71717A]'
                    }`}
                  >
                    Conta Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingMethod('IMMEDIATE_CASH')}
                    className={`p-2 rounded-xl border text-center font-bold text-xs transition cursor-pointer ${
                      billingMethod === 'IMMEDIATE_CASH'
                        ? 'bg-[#222222] border-[#8B7CFF] text-[#F5F5F5]'
                        : 'bg-[#151515] border-[#262626] text-[#71717A]'
                    }`}
                  >
                    Pagamento Direto
                  </button>
                </div>
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
                          {formatCurrency(item.product.price)} un.
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
                          {formatCurrency(item.product.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Totals */}
              <div className="pt-3 border-t border-[#242424] space-y-1.5 text-xs">
                <div className="flex justify-between text-[#A1A1AA]">
                  <span>Itens no Carrinho:</span>
                  <span className="font-semibold text-[#F5F5F5]">{cart.reduce((acc, i) => acc + i.quantity, 0)} un.</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-[#F5F5F5] pt-1 border-t border-[#242424]">
                  <span>Total da Venda:</span>
                  <span className="text-[#8B7CFF] font-mono">{formatCurrency(cartTotal)}</span>
                </div>
              </div>

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
                disabled={isSubmitting || cart.length === 0 || !selectedStudent}
                onClick={handleFinalizeSale}
                className="w-full py-3 px-4 rounded-xl font-extrabold text-xs text-[#101010] bg-[#F5F5F5] hover:bg-white active:scale-98 transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                    <span>Gravando e Baixando Estoque...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Venda no Caixa</span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-[#71717A]">
                🔒 Proteção contra duplicidade ativa. Estoque atualizado no backend.
              </p>

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
              className="text-xs font-bold text-[#8B7CFF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Voltar ao Terminal <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

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
                      <span className="font-mono font-bold text-[#F5F5F5] block">{sale.id}</span>
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
                    </td>
                    <td className="py-3 px-4 text-[#A1A1AA]">{sale.operatorUserName}</td>
                    <td className="py-3 px-4">
                      {sale.status === 'COMPLETED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Concluída
                        </span>
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
                      {sale.status === 'COMPLETED' ? (
                        <button
                          onClick={() => {
                            setReversalSale(sale);
                            setReversalReason('');
                            setReversalError(null);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition cursor-pointer flex items-center gap-1 ml-auto"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Estornar
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#71717A]">Estornado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sale Voucher / Receipt Modal */}
      {completedSale && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-sm w-full p-6 animate-in fade-in zoom-in-95">
            <div className="text-center space-y-1 mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-[#F5F5F5] text-lg">Venda Confirmada!</h3>
              <p className="text-xs text-[#A1A1AA]">Lançada na conta mensal do aluno</p>
            </div>

            {/* Receipt Box */}
            <div className="bg-[#141414] p-4 rounded-xl border border-[#262626] font-mono text-xs space-y-2 text-[#D4D4D8]">
              <div className="text-center border-b border-dashed border-[#333333] pb-2">
                <p className="font-bold text-[#F5F5F5]">LOJINHA DO CAMPUS</p>
                <p className="text-[10px] text-[#71717A]">COMPROVANTE DE CONSUMO ESCOLAR</p>
              </div>

              <div className="space-y-0.5 text-[11px]">
                <p>Cupom: <strong className="text-white">{completedSale.id}</strong></p>
                <p>Data: {formatDateTime(completedSale.createdAt)}</p>
                <p>Aluno: <strong className="text-white">{completedSale.studentName}</strong></p>
                <p>Matrícula: {completedSale.registrationNumber}</p>
                <p>Operador: {completedSale.operatorUserName}</p>
              </div>

              <div className="border-t border-b border-dashed border-[#333333] py-2 space-y-1">
                {completedSale.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <span>{i.quantity}x {i.name}</span>
                    <span>{formatCurrency(i.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-sm font-bold text-[#F5F5F5] pt-1">
                <span>TOTAL A FATURAR:</span>
                <span className="text-[#8B7CFF]">{formatCurrency(completedSale.total)}</span>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 px-3 border border-[#303030] hover:bg-[#242424] rounded-xl text-xs font-semibold text-[#F5F5F5] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="flex-1 py-2 px-3 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Próxima Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Reversal Modal */}
      {reversalSale && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-[#F5F5F5] text-base">Estorno de Venda no PDV</h3>
              </div>
              <button 
                onClick={() => setReversalSale(null)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-[#A1A1AA] mb-3">
              O estorno irá reverter o consumo de <strong>{reversalSale.studentName}</strong> ({formatCurrency(reversalSale.total)}) e devolver os itens ao estoque físico da lojinha com registro de auditoria.
            </p>

            {reversalError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F5F5F5] mb-1">
                  Motivo Obrigatório do Estorno:
                </label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Ex: Aluno desistiu do produto no balcão / Item registrado incorretamente..."
                  rows={3}
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-xs text-[#F5F5F5] focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReversalSale(null)}
                  className="flex-1 py-2 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl text-xs font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReversing}
                  className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {isReversing ? 'Estornando...' : 'Confirmar Estorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
