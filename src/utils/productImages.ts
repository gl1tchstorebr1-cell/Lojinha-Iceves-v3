// Utilitários para gestão de até 3 imagens por produto, compressão em Canvas e placeholders
import { ProductCategory, Product } from '../types';

export function getProductImages(product?: Partial<Product> | null): string[] {
  if (!product) return [];
  if (Array.isArray(product.images) && product.images.length > 0) {
    return product.images.filter((img): img is string => typeof img === 'string' && img.trim().length > 0).slice(0, 3);
  }
  if (product.imageUrl && product.imageUrl.trim()) {
    return [product.imageUrl.trim()];
  }
  return [];
}

export function getProductPrimaryImage(product?: Partial<Product> | null): string | undefined {
  const imgs = getProductImages(product);
  return imgs[0];
}

export function compressProductImageFileToDataUrl(file: File, maxSize = 600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem válido (JPG, PNG, WEBP).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Limita dimensão mantendo aspect ratio
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Não foi possível processar a imagem do produto.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo da imagem.'));
    reader.readAsDataURL(file);
  });
}

export const OFFICIAL_PRODUCT_CATEGORIES: ProductCategory[] = [
  'Livros e Literatura Cristã',
  'Alimentos e Snacks',
  'Produtos Naturais e Saúde',
  'Papelaria',
  'Higiene e Cuidados Pessoais',
  'Limpeza',
];

export function normalizeProductCategory(category?: string | null): ProductCategory {
  const raw = (category || '').trim();
  if ((OFFICIAL_PRODUCT_CATEGORIES as string[]).includes(raw)) {
    return raw as ProductCategory;
  }
  const lower = raw.toLowerCase();
  if (lower.includes('livro') || lower.includes('literatura') || lower.includes('crist')) {
    return 'Livros e Literatura Cristã';
  }
  if (lower.includes('natural') || lower.includes('saúde') || lower.includes('saude')) {
    return 'Produtos Naturais e Saúde';
  }
  if (lower.includes('papel')) {
    return 'Papelaria';
  }
  if (lower.includes('higiene') || lower.includes('cosm') || lower.includes('pessoal') || lower.includes('pessoais')) {
    return 'Higiene e Cuidados Pessoais';
  }
  if (lower.includes('limpeza')) {
    return 'Limpeza';
  }
  return 'Alimentos e Snacks';
}

export function getCategoryBadgeColor(category: ProductCategory | string): { bg: string; text: string; border: string } {
  switch (category) {
    case 'Livros e Literatura Cristã':
      return { bg: 'bg-indigo-500/15', text: 'text-indigo-300', border: 'border-indigo-500/30' };
    case 'Alimentos e Snacks':
    case 'Alimentícios':
      return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'Produtos Naturais e Saúde':
      return { bg: 'bg-lime-500/15', text: 'text-lime-300', border: 'border-lime-500/30' };
    case 'Papelaria':
      return { bg: 'bg-teal-500/15', text: 'text-teal-300', border: 'border-teal-500/30' };
    case 'Higiene e Cuidados Pessoais':
    case 'Cosméticos':
      return { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' };
    case 'Limpeza':
    case 'Produtos de Limpeza':
      return { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' };
    default:
      return { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' };
  }
}
