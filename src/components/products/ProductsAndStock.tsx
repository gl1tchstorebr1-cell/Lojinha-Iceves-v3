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
  Filter,
  Image as ImageIcon,
  Upload,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon
} from 'lucide-react';
import { Product, StockMovement, ProductCategory } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { 
  getProductImages, 
  compressProductImageFileToDataUrl, 
  getCategoryBadgeColor 
} from '../../utils/productImages';

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

  // Modals & Gallery
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);

  // Form states for Product (até 3 imagens)
  const [formData, setFormData] = useState<Partial<Product> & { images: string[] }>({
    name: '',
    category: 'Alimentícios',
    price: 0,
    internalCode: '',
    barcode: '',
    currentStock: 0,
    minStock: 5,
    unit: 'un',
    status: 'ACTIVE',
    images: ['', '', '']
  });
  const [urlInputSlot, setUrlInputSlot] = useState<number | null>(null);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [isCompressingSlot, setIsCompressingSlot] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for Stock Adjust
  const [adjustType, setAdjustType] = useState<'ENTRADA' | 'AJUSTE_MANUAL'>('ENTRADA');
  const [adjustQty, setAdjustQty] = useState<number>(10);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // 4 categorias exclusivas solicitadas pela coordenação
  const categories: (ProductCategory | 'TODAS')[] = [
    'TODAS',
    'Alimentícios',
    'Papelaria',
    'Produtos de Limpeza',
    'Cosméticos'
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
      category: 'Alimentícios',
      price: 0,
      internalCode: `INT-${Math.floor(Math.random() * 9000 + 1000)}`,
      barcode: '',
      currentStock: 10,
      minStock: 5,
      unit: 'un',
      status: 'ACTIVE',
      images: ['', '', '']
    });
    setFormError(null);
    setUrlInputSlot(null);
    setUrlInputValue('');
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    const existingImgs = getProductImages(product);
    const paddedImgs = [
      existingImgs[0] || '',
      existingImgs[1] || '',
      existingImgs[2] || ''
    ];
    setFormData({
      ...product,
      category: (product.category as ProductCategory) || 'Alimentícios',
      images: paddedImgs
    });
    setFormError(null);
    setUrlInputSlot(null);
    setUrlInputValue('');
    setIsProductModalOpen(true);
  };

  const handleSlotImageUpload = async (slotIdx: number, file: File) => {
    try {
      setIsCompressingSlot(slotIdx);
      const dataUrl = await compressProductImageFileToDataUrl(file, 600, 0.85);
      const newImages = [...formData.images];
      newImages[slotIdx] = dataUrl;
      setFormData(prev => ({ ...prev, images: newImages }));
    } catch (err: any) {
      alert(err.message || 'Erro ao processar imagem');
    } finally {
      setIsCompressingSlot(null);
    }
  };

  const handleSlotApplyUrl = (slotIdx: number) => {
    if (!urlInputValue.trim()) return;
    const newImages = [...formData.images];
    newImages[slotIdx] = urlInputValue.trim();
    setFormData(prev => ({ ...prev, images: newImages }));
    setUrlInputSlot(null);
    setUrlInputValue('');
  };

  const handleSlotImageRemove = (slotIdx: number) => {
    const newImages = [...formData.images];
    newImages[slotIdx] = '';
    setFormData(prev => ({ ...prev, images: newImages }));
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
      const finalImages = formData.images.filter(img => Boolean(img && img.trim()));
      const payload: Partial<Product> = {
        ...formData,
        images: finalImages,
        imageUrl: finalImages[0] || undefined
      };

      if (editingProduct) {
        const updated = await api.updateProduct(editingProduct.id, payload);
        onProductSaved(updated);
      } else {
        const created = await api.createProduct(payload);
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
            <Package className="w-5 h-5 text-emerald-400" />
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
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-emerald-500"
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
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setGalleryProduct(product);
                              setActiveGalleryIndex(0);
                            }}
                            className="relative w-12 h-12 rounded-xl overflow-hidden bg-[#161616] border border-[#2E2E2E] shrink-0 group/img cursor-pointer hover:border-emerald-500 transition"
                            title="Clique para abrir galeria de fotos do produto"
                          >
                            {getProductImages(product).length > 0 ? (
                              <img
                                src={getProductImages(product)[0]}
                                alt={product.name}
                                className="w-full h-full object-cover group-hover/img:scale-105 transition duration-200"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-[#555]">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                            )}
                            {getProductImages(product).length > 0 && (
                              <span className="absolute bottom-0 right-0 bg-black/80 text-white font-mono text-[9px] px-1 rounded-tl font-bold">
                                {getProductImages(product).length}/3
                              </span>
                            )}
                          </button>
                          <div>
                            <button
                              type="button"
                              onClick={() => openEditProductModal(product)}
                              className="font-bold text-[#F5F5F5] block text-xs hover:text-emerald-400 transition text-left cursor-pointer"
                            >
                              {product.name}
                            </button>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[#71717A] font-mono">
                                {product.unit}
                              </span>
                              {getProductImages(product).length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGalleryProduct(product);
                                    setActiveGalleryIndex(0);
                                  }}
                                  className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                                >
                                  <ImageIcon className="w-2.5 h-2.5" />
                                  {getProductImages(product).length === 1 ? '1 foto' : `${getProductImages(product).length} fotos`}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openEditProductModal(product)}
                                  className="text-[10px] text-amber-400/80 hover:text-amber-300 flex items-center gap-0.5 cursor-pointer"
                                >
                                  + Adicionar fotos
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const badge = getCategoryBadgeColor(product.category);
                          return (
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                              {product.category}
                            </span>
                          );
                        })()}
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
                              onClick={() => openEditProductModal(product)}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#1C1C1C] hover:bg-[#252525] text-emerald-400 border border-[#2E2E2E] transition cursor-pointer inline-flex items-center gap-1"
                              title="Gerenciar até 3 fotos deste produto"
                            >
                              <ImageIcon className="w-3 h-3" />
                              Fotos ({getProductImages(product).length}/3)
                            </button>
                            <button
                              onClick={() => openAdjustStockModal(product)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#222222] hover:bg-[#2A2A2A] text-[#F5F5F5] border border-[#303030] transition cursor-pointer"
                              title="Ajustar ou dar entrada no estoque"
                            >
                              Estoque
                            </button>
                            <button
                              onClick={() => openEditProductModal(product)}
                              className="p-1 rounded-lg text-[#A1A1AA] hover:text-emerald-400 hover:bg-[#222222] transition cursor-pointer inline-block"
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Venda Caixa
                        </span>
                      )}
                      {mov.type === 'ENTRADA' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                          Entrada / Compra
                        </span>
                      )}
                      {mov.type === 'ESTORNO_VENDA' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-xl w-full p-6 animate-in fade-in zoom-in-95 my-8">
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <div>
                <h3 className="font-extrabold text-[#F5F5F5] text-base flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-400" />
                  {editingProduct ? 'Editar Produto e Fotos' : 'Novo Produto na Lojinha'}
                </h3>
                <p className="text-[11px] text-[#A1A1AA]">
                  Configure os dados, estoque e até 3 imagens por produto.
                </p>
              </div>
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

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              
              {/* Gestão das 3 Fotos do Produto */}
              <div className="bg-[#141414] border border-[#282828] rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-bold text-[#F5F5F5] text-xs">
                        Fotos do Produto (Até 3 Imagens)
                      </span>
                      <p className="text-[10px] text-[#A1A1AA]">
                        A Foto 1 será a capa do PDV e catálogo. Adicione ângulos ou embalagem nas fotos 2 e 3.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#242424] text-[#A1A1AA] border border-[#303030]">
                    {formData.images.filter(Boolean).length}/3 fotos
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[0, 1, 2].map((slotIdx) => {
                    const slotImg = formData.images[slotIdx];
                    const slotLabels = ['Foto 1 (Principal)', 'Foto 2 (Detalhe)', 'Foto 3 (Embalagem)'];
                    const isCompressing = isCompressingSlot === slotIdx;
                    const isInputtingUrl = urlInputSlot === slotIdx;

                    return (
                      <div key={slotIdx} className="bg-[#1A1A1A] border border-[#2C2C2C] rounded-xl p-2.5 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-[#D4D4D8]">
                            {slotLabels[slotIdx]}
                          </span>
                          {slotImg && (
                            <button
                              type="button"
                              onClick={() => handleSlotImageRemove(slotIdx)}
                              className="text-rose-400 hover:text-rose-300 p-0.5 rounded hover:bg-rose-500/10 cursor-pointer"
                              title="Remover esta foto"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Preview quadrado */}
                        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-[#101010] border border-[#242424] flex items-center justify-center group mb-2">
                          {slotImg ? (
                            <>
                              <img
                                src={slotImg}
                                alt={`Foto ${slotIdx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-2">
                                <label className="px-2 py-1 bg-[#282828] hover:bg-[#333] text-white rounded text-[10px] font-bold cursor-pointer">
                                  Trocar
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleSlotImageUpload(slotIdx, file);
                                    }}
                                  />
                                </label>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-2 text-center text-[#555]">
                              <ImageIcon className="w-6 h-6 mb-1 text-[#444]" />
                              <span className="text-[9px] text-[#71717A]">Vazio</span>
                            </div>
                          )}
                        </div>

                        {/* Botões de Ação */}
                        {!slotImg ? (
                          <div className="space-y-1">
                            <label className="w-full py-1.5 px-2 bg-[#262626] hover:bg-[#323232] text-[#F5F5F5] rounded-lg font-bold text-[10px] flex items-center justify-center gap-1.5 cursor-pointer transition border border-[#353535]">
                              <Upload className="w-3 h-3 text-emerald-400" />
                              {isCompressing ? 'Compactando...' : 'Enviar Foto'}
                              <input
                                type="file"
                                accept="image/*"
                                disabled={isCompressing}
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleSlotImageUpload(slotIdx, file);
                                }}
                              />
                            </label>

                            {isInputtingUrl ? (
                              <div className="flex gap-1 pt-0.5">
                                <input
                                  type="url"
                                  placeholder="Link..."
                                  value={urlInputValue}
                                  onChange={(e) => setUrlInputValue(e.target.value)}
                                  className="flex-1 py-0.5 px-1.5 text-[10px] bg-[#111] border border-[#333] rounded text-white focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSlotApplyUrl(slotIdx)}
                                  className="py-0.5 px-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setUrlInputSlot(null); setUrlInputValue(''); }}
                                  className="py-0.5 px-1 bg-[#222] text-[#777] rounded text-[10px] cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setUrlInputSlot(slotIdx); setUrlInputValue(''); }}
                                className="w-full text-center text-[10px] text-[#A1A1AA] hover:text-[#F5F5F5] py-0.5 cursor-pointer flex items-center justify-center gap-1 transition"
                              >
                                <LinkIcon className="w-2.5 h-2.5" />
                                Colar link
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-medium text-center flex items-center justify-center gap-1">
                            <Check className="w-3 h-3" /> Foto carregada
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Nome do Produto</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Suco de Uva Integral 300ml"
                  className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#D4D4D8] mb-1">Categoria (Apenas 4)</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as ProductCategory })}
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none font-bold"
                  >
                    <option value="Alimentícios">Alimentícios</option>
                    <option value="Papelaria">Papelaria</option>
                    <option value="Produtos de Limpeza">Produtos de Limpeza</option>
                    <option value="Cosméticos">Cosméticos</option>
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
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none font-mono font-bold"
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
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
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
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
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
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none font-mono"
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
                    className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none font-mono"
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
              Item: <strong className="text-white">{adjustingProduct.name}</strong> • Estoque atual no sistema: <strong className="text-emerald-400 font-mono">{adjustingProduct.currentStock} {adjustingProduct.unit}</strong>
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
                  className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono font-bold text-sm focus:border-emerald-500 focus:outline-none"
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
                  className="w-full p-2 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
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

      {/* Product Image Gallery Modal (até 3 fotos) */}
      {galleryProduct && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[#181818] rounded-2xl shadow-2xl border border-[#303030] max-w-lg w-full overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[#282828] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Galeria de Fotos do Produto ({getProductImages(galleryProduct).length}/3)
                </span>
                <h3 className="font-extrabold text-[#F5F5F5] text-base">
                  {galleryProduct.name}
                </h3>
              </div>
              <button
                onClick={() => setGalleryProduct(null)}
                className="text-[#71717A] hover:text-white text-2xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Imagem Principal em Destaque */}
            <div className="relative aspect-square w-full bg-[#111111] flex items-center justify-center overflow-hidden">
              {getProductImages(galleryProduct).length > 0 ? (
                <img
                  src={getProductImages(galleryProduct)[activeGalleryIndex] || getProductImages(galleryProduct)[0]}
                  alt={galleryProduct.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-[#555]">
                  <ImageIcon className="w-12 h-12 mb-2" />
                  <span className="text-xs">Nenhuma foto cadastrada</span>
                </div>
              )}

              {/* Botões de navegação se houver mais de 1 foto */}
              {getProductImages(galleryProduct).length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveGalleryIndex((prev) => (prev > 0 ? prev - 1 : getProductImages(galleryProduct).length - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full cursor-pointer transition border border-white/10"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGalleryIndex((prev) => (prev < getProductImages(galleryProduct).length - 1 ? prev + 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full cursor-pointer transition border border-white/10"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Miniaturas das até 3 fotos */}
            {getProductImages(galleryProduct).length > 0 && (
              <div className="p-3 bg-[#141414] border-t border-[#242424] flex items-center justify-center gap-3">
                {getProductImages(galleryProduct).map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveGalleryIndex(idx)}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition cursor-pointer ${
                      activeGalleryIndex === idx
                        ? 'border-emerald-500 scale-105'
                        : 'border-[#2C2C2C] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 right-0 bg-black/80 text-white font-mono text-[9px] px-1 font-bold">
                      {idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Rodapé com detalhes do produto */}
            <div className="p-4 bg-[#181818] border-t border-[#282828] flex items-center justify-between text-xs">
              <div>
                <span className="text-[#A1A1AA] block text-[11px]">
                  Código: <strong className="text-white font-mono">{galleryProduct.internalCode}</strong> • Estoque: <strong className="text-white font-mono">{galleryProduct.currentStock} {galleryProduct.unit}</strong>
                </span>
                <span className="text-base font-extrabold text-[#F5F5F5] font-mono">
                  {formatCurrency(galleryProduct.price)}
                </span>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const p = galleryProduct;
                      setGalleryProduct(null);
                      openEditProductModal(p);
                    }}
                    className="py-1.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar / Trocar Fotos
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setGalleryProduct(null)}
                  className="py-1.5 px-3 bg-[#242424] hover:bg-[#2C2C2C] text-[#D4D4D8] rounded-xl font-semibold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
