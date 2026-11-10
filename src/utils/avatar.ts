// Utilitários para geração de avatar com iniciais e compressão de foto de perfil em Canvas

const PALETTE = [
  ['#10B981', '#047857'], // Emerald vivo -> Esmeralda escuro
  ['#059669', '#064E3B'], // Verde ICEVES -> Floresta profundo
  ['#34D399', '#059669'], // Verde claro -> Esmeralda
  ['#14B8A6', '#0F766E'], // Jade -> Verde petróleo
  ['#22C55E', '#15803D'], // Verde folha -> Verde institucional
  ['#0D9488', '#115E59'], // Jade profundo -> Pinho escuro
  ['#10B981', '#065F46'], // Esmeralda -> Verde musgo
  ['#16A34A', '#14532D'], // Verde clássico -> Floresta
];

export function getStudentInitials(name: string): string {
  const parts = (name || 'Aluno')
    .trim()
    .split(/\s+/)
    .filter(p => !['de', 'da', 'do', 'dos', 'das', 'e'].includes(p.toLowerCase()));

  if (parts.length === 0) return 'EC';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getInitialsAvatar(name: string): string {
  const initials = getStudentInitials(name);
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const [c1, c2] = PALETTE[Math.abs(hash) % PALETTE.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="80" fill="url(#g)" />
    <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" font-size="56" letter-spacing="1">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function compressImageFileToDataUrl(file: File, maxSize = 320): Promise<string> {
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
        // Faz corte central quadrado (1:1) para foto de perfil perfeita
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        const targetSize = Math.min(maxSize, minSide || maxSize);
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Não foi possível processar a imagem selecionada.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}
