import {
  Invoice,
  Passeio,
  PixPayment,
  Product,
  Sale,
  Student,
  SystemSettings,
  WhatsAppNotification
} from '../types';

const SNAPSHOT_KEY = 'iceves_offline_snapshot_v1';

export interface OfflineDataSnapshot {
  syncedAt: string;
  settings: SystemSettings | null;
  products: Product[];
  students: Student[];
  sales: Sale[];
  invoices: Invoice[];
  pixPayments: PixPayment[];
  whatsappNotifications: WhatsAppNotification[];
  passeios: Passeio[];
}

export function saveOfflineSnapshot(snapshot: OfflineDataSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors silently
  }
}

export function loadOfflineSnapshot(): OfflineDataSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as OfflineDataSnapshot;
  } catch {
    return null;
  }
}
