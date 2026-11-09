import React, { useState } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  AlertTriangle, 
  ArrowUpDown, 
  History, 
  Edit2, 
  Check, 
  X, 
  Boxes, 
  TrendingDown, 
  ArrowUp, 
  ArrowDown, 
  Filter 
} from 'lucide-react';
import { Product, StockMovement, ProductCategory } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface ProductsAndStockProps {
  products: Product[];
  stockMovements: StockMovement[];
  onProductSaved: (product: Product) => void;
  onStockAdjusted: (product: Product) => void;
}

export function ProductsAndStock({ 
  products, 
  stockMovements, 
  onProductSaved, 
  onStockAdjusted 
}: ProductsAndStockProps) {
  const { user, isAdmin } = useAuth();

  // Search & filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [filterStockStatus, setFilterStockStatus] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');
  const [activeTab, setActiveTab] = useState<'catalog' | 'movements'>('catalog');

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

  // Form states for Product
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    category: 'Salgados & Lanches',
    price: 0,
    internalCode: '',
    barcode: '',
    currentStock: 0,
    minStock: 5,
    unit: 'un',
    status: 'ACTIVE'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for Stock Adjust
  const [adjustType, setAdjustType] = useState<'ENTRADA' | 'AJUSTE_MANUAL'>('ENTRADA');
  const [adjustQty, setAdjustQty] = useState<number>(10);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const categories: (ProductCategory | 'TODAS')[] = [
    'TODAS',
    'Bebidas',
    'Salgados & Lanches',
    'Doces & Sobremesas',
    'Papelaria & Material',
    'Uniformes & Merch'
  ];

  // Filtered products
  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCategory === 'TODAS' || p.category === selectedCategory;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q || (
      p.name.toLowerCase().includes(q) ||
      p.internalCode.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
    let matchesStock = true;
    if (filterStockStatus === 'LOW') {
      matchesStock = p.currentStock > 0 && p.currentStock <= p.minStock;
    } else if (filterStockStatus === 'OUT') {
      matchesStock = p.currentStock === 0;
    }
    return matchesCat && matchesSearch && matchesStock;
  });

  const lowStockCount = products.filter(p => p.currentStock > 0 && p.currentStock <= p.minStock).length;
  const outOfStockCount = products.filter(p => p.currentStock === 0).length;

  const openNewProductModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      category: 'Salgados & Lanches',
      price: 0,
      internalCode: `INT-${Math.floor(Math.random() * 9000 + 1000)}`,
      barcode: '',
      currentStock: 10,
      minStock: 5,
      unit: 'un',
      status: 'ACTIVE'
    });
    setFormError(null);
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({ ...product });
    setFormError(null);
    setIsProductModalOpen(true);
  };

  const openAdjustStockModal = (product: Product) => {
    setAdjustingProduct(product);
    setAdjustType('ENTRADA');
    setAdjustQty(10);
    setAdjustReason('Reposição de estoque semanal');
    setAdjustError(null);
    setIsAdjustModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      setFormError('O nome do produto é obrigatório.');
      return;
    }
    if ((formData.price || 0) < 0) {
      setFormError('O preço não pode ser negativo.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingProduct) {
        const updated = await api.updateProduct(editingProduct.id, formData);
        onProductSaved(updated);
      } else {
        const created = await api.createProduct(formData);
        onProductSaved(created);
      }
      setIsProductModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar produto.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    if (!adjustReason.trim()) {
      setAdjustError('O motivo do ajuste é obrigatório para fins de auditoria.');
      return;
    }

    setIsAdjusting(true);
    setAdjustError(null);

    try {
      const updated = await api.adjustStock({
        productId: adjustingProduct.id,
        type: adjustType,
        quantity: Number(adjustQty),
        reason: adjustReason
      });
      onStockAdjusted(updated);
      setIsAdjustModalOpen(false);
    } catch (err: any) {
      setAdjustError(err.message || 'Erro ao ajustar estoque.');
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Banner and Summary */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#8B7CFF]" />
            <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
              Produtos & Controle de Estoque
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Cada venda no caixa reduz o estoque em tempo real. Histórico de preços preservado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={openNewProductModal}
              className="flex items-center gap-2 bg-[#F5F5F5] hover:bg-white text-[#101010] px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Novo Produto
            </button>
          )}

          <div className="flex bg-[#151515] p-1 rounded-xl border border-[#282828] text-xs">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === 'catalog' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
              }`}
            >
              Catálogo ({products.length})
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === 'movements' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
              }`}
            >
              Movimentações ({stockMovements.length})
            </button>
          </div>
        </div>
      </div>

      {/* Stock Health Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setFilterStockStatus('ALL')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            filterStockStatus === 'ALL' ? 'bg-[#242424] text-[#F5F5F5] border-[#404040]' : 'bg-[#181818] text-[#A1A1AA] border-[#262626]'
          }`}
        >
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#71717A]">Total Cadastrado</span>
          <span className="block text-xl font-black mt-0.5 text-[#F5F5F5]">{products.length} produtos</span>
        </button>

        <button
          onClick={() => setFilterStockStatus(filterStockStatus === 'LOW' ? 'ALL' : 'LOW')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            filterStockStatus === 'LOW' ? 'bg-[#2E2413] text-[#F5F5F5] border-amber-500/50' : 'bg-[#181818] text-[#A1A1AA] border-[#262626]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">Abaixo do Mínimo</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <span className="block text-xl font-black mt-0.5 text-amber-300">{lowStockCount} produtos</span>
        </button>

        <button
          onClick={() => setFilterStockStatus(filterStockStatus === 'OUT' ? 'ALL' : 'OUT')}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            filterStockStatus === 'OUT' ? 'bg-[#2E1616] text-[#F5F5F5] border-rose-500/50' : 'bg-[#181818] text-[#A1A1AA] border-[#262626]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400">Esgotados</span>
            <Boxes className="w-4 h-4 text-rose-400" />
          </div>
          <span className="block text-xl font-black mt-0.5 text-rose-300">{outOfStockCount} produtos</span>
        </button>
      </div>

      {activeTab === 'catalog' ? (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs p-4 space-y-4">
          
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por nome ou código..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-[#8B7CFF]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#282828] text-[#F5F5F5] border border-[#3A3A3A]'
                      : 'bg-[#151515] text-[#A1A1AA] hover:text-[#F5F5F5]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Código / Barras</th>
                  <th className="py-3 px-4">Preço Atual</th>
                  <th className="py-3 px-4">Estoque Atual</th>
                  <th className="py-3 px-4">Estoque Mínimo</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredProducts.map(product => {
                  const isOut = product.currentStock === 0;
                  const isLow = product.currentStock > 0 && product.currentStock <= product.minStock;

                  return (
                    <tr key={product.id} className="hover:bg-[#202020] transition">
                      <td className="py-3 px-4 font-bold text-[#F5F5F5]">
                        {product.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#222222] text-[#A1A1AA] border border-[#2E2E2E]">
                          {product.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#71717A]">
                        {product.internalCode}
                        {product.barcode && <span className="block text-[10px] text-[#555]">{product.barcode}</span>}
                      </td>
                      <td className="py-3 px-4 font-mono font-extrabold text-[#F5F5F5]">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs ${
                          isOut 
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                            : isLow 
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {product.currentStock} {product.unit}
                          {isOut && <span className="text-[10px] font-extrabold uppercase">(Esgotado)</span>}
                          {isLow && <span className="text-[10px] font-extrabold uppercase">(Baixo)</span>}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#71717A]">
                        {product.minStock} {product.unit}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => openAdjustStockModal(product)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#222222] hover:bg-[#2A2A2A] text-[#F5F5F5] border border-[#303030] transition cursor-pointer"
                              title="Ajustar ou dar entrada no estoque"
                            >
                              Ajustar Estoque
                            </button>
                            <button
                              onClick={() => openEditProductModal(product)}
                              className="p-1 rounded-lg text-[#A1A1AA] hover:text-[#8B7CFF] hover:bg-[#222222] transition cursor-pointer inline-block"
                              title="Editar detalhes do produto"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </>
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
        /* Movements Log Tab */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs p-5 space-y-4">
          <div>
            <h3 className="font-bold text-[#F5F5F5] text-base">Histórico de Movimentações de Estoque</h3>
            <p className="text-xs text-[#A1A1AA]">
              Trilha auditada de todas as saídas de vendas, estornos, compras e ajustes manuais
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Tipo Movimento</th>
                  <th className="py-3 px-4">Variação</th>
                  <th className="py-3 px-4">Estoque (Antes → Depois)</th>
                  <th className="py-3 px-4">Motivo / Cupom</th>
                  <th className="py-3 px-4">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {stockMovements.map(mov => (
                  <tr key={mov.id} className="hover:bg-[#202020] transition">
                    <td className="py-3 px-4 font-mono text-[#71717A]">
                      {formatDateTime(mov.timestamp)}
                    </td>
                    <td className="py-3 px-4 font-bold text-[#F5F5F5]">
                      {mov.productName}
                    </td>
                    <td className="py-3 px-4">
                      {mov.type === 'SAIDA_VENDA' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#8B7CFF]/10 text-[#8B7CFF] border border-[#8B7CFF]/20">
                          Venda Caixa
                        </span>
                      )}
                      {mov.type === 'ENTRADA' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Entrada / Compra
                        </span>
                      )}
                      {mov.type === 'ESTORNO_VENDA' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Estorno de Venda
                        </span>
                      )}
                      {mov.type === 'AJUSTE_MANUAL' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Ajuste de Inventário
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-extrabold">
                      <span className={mov.quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#A1A1AA] font-mono">
                      {mov.previousStock} → <strong className="text-white">{mov.newStock}</strong>
                    </td>
                    <td className="py-3 px-4 text-[#A1A1AA] max-w-xs truncate" title={mov.reason}>
                      {mov.reason}
                    </td>
                    <td className="py-3 px-4 text-[#71717A]">
                      {mov.performedByUserName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Create/Edit Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <h3 className="font-extrabold text-[#F5F5F5] text-base">
                {editingProduct ? 'Editar Produto' : 'Novo Produto na Lojinha'}
              </h3>
              <button 
                onClick={() => setIsProductModalOpen(false)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Nome do Produto</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Suco de Uva Integral 300ml"
                  className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#D4D4D8] mb-1">Categoria</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as ProductCategory })}
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                  >
                    <option value="Bebidas">Bebidas</option>
                    <option value="Salgados & Lanches">Salgados & Lanches</option>
                    <option value="Doces & Sobremesas">Doces & Sobremesas</option>
                    <option value="Papelaria & Material">Papelaria & Material</option>
                    <option value="Uniformes & Merch">Uniformes & Merch</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#D4D4D8] mb-1">Preço Atual (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price ?? 0}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#D4D4D8] mb-1">Código Interno</label>
                  <input
                    type="text"
                    value={formData.internalCode || ''}
                    onChange={(e) => setFormData({ ...formData, internalCode: e.target.value })}
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono focus:border-[#8B7CFF] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#D4D4D8] mb-1">Código de Barras</label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="789..."
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono focus:border-[#8B7CFF] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#D4D4D8] mb-1">Estoque Inicial / Atual</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.currentStock ?? 0}
                    onChange={(e) => setFormData({ ...formData, currentStock: parseInt(e.target.value, 10) || 0 })}
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#D4D4D8] mb-1">Estoque Mínimo</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.minStock ?? 5}
                    onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value, 10) || 1 })}
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 px-3 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-xl font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  {isSaving ? 'Gravando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {isAdjustModalOpen && adjustingProduct && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <h3 className="font-extrabold text-[#F5F5F5] text-base">
                Movimentação Manual de Estoque
              </h3>
              <button 
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-[#A1A1AA] mb-3">
              Item: <strong className="text-white">{adjustingProduct.name}</strong> • Estoque atual no sistema: <strong className="text-[#8B7CFF] font-mono">{adjustingProduct.currentStock} {adjustingProduct.unit}</strong>
            </p>

            {adjustError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustStock} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Tipo de Operação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('ENTRADA')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      adjustType === 'ENTRADA' ? 'bg-[#1D2B20] border-emerald-500 text-emerald-400' : 'bg-[#151515] border-[#282828] text-[#71717A]'
                    }`}
                  >
                    + Entrada / Compra
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('AJUSTE_MANUAL')}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      adjustType === 'AJUSTE_MANUAL' ? 'bg-[#2E2413] border-amber-500 text-amber-300' : 'bg-[#151515] border-[#282828] text-[#71717A]'
                    }`}
                  >
                    Contagem / Inventário
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">
                  {adjustType === 'ENTRADA' ? 'Quantidade a Adicionar (+):' : 'Nova Quantidade Real Contada:'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono font-bold text-sm focus:border-[#8B7CFF] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Motivo do Ajuste (Obrigatório para Auditoria)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ex: NF 9821 recebida / Quebra de mercadoria / Inventário"
                  className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                  required
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="flex-1 py-2 px-3 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-xl font-bold transition disabled:opacity-40 cursor-pointer"
                >
                  {isAdjusting ? 'Processando...' : 'Confirmar Ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
