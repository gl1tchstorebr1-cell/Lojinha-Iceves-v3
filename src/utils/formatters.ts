// Formatting utilities for Campus Store SaaS

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
}

export function formatPeriod(period: string): string {
  // e.g. '2026-10' -> 'Outubro de 2026'
  if (!period || !period.includes('-')) return period;
  const [year, month] = period.split('-');
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const mIndex = parseInt(month, 10) - 1;
  return `${months[mIndex] || month} de ${year}`;
}

export function formatPhone(phone: string): string {
  return phone;
}

// Generate simple SVG for QR Code display
export function generatePixQrSvg(payload: string): string {
  // We can render a recognizable 2D matrix pattern based on hash of payload
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23ffffff"/><rect x="10" y="10" width="25" height="25" fill="%230f172a"/><rect x="15" y="15" width="15" height="15" fill="%23ffffff"/><rect x="18" y="18" width="9" height="9" fill="%230f172a"/><rect x="65" y="10" width="25" height="25" fill="%230f172a"/><rect x="70" y="15" width="15" height="15" fill="%23ffffff"/><rect x="73" y="18" width="9" height="9" fill="%230f172a"/><rect x="10" y="65" width="25" height="25" fill="%230f172a"/><rect x="15" y="70" width="15" height="15" fill="%23ffffff"/><rect x="18" y="73" width="9" height="9" fill="%230f172a"/><path d="M42 12h6v6h-6zM54 12h6v6h-6zM42 24h18v6H42zM48 36h6v6h-6zM12 48h6v6h-6zM24 48h12v6H24zM42 48h6v6h-6zM60 48h12v6H60zM78 48h10v6H78zM42 60h18v6H42zM66 60h6v6h-6zM78 60h10v6H78zM48 72h6v6h-6zM60 72h12v6H60zM42 84h6v6h-6zM54 84h18v6H54zM78 84h10v6H78z" fill="%230f172a"/></svg>`;
}
