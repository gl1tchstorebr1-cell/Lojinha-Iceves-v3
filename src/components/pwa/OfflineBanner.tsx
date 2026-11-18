import React from 'react';
import { WifiOff, RefreshCw, Sparkles } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface OfflineBannerProps {
  lastSyncedAt?: string | null;
  onSyncNow?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ lastSyncedAt, onSyncNow }) => {
  const { isOnline, justReconnected } = useOnlineStatus();
  const { updateAvailable, applyUpdate } = usePWAInstall();

  if (isOnline && !justReconnected && !updateAvailable) return null;

  return (
    <div className="space-y-2 mb-4">
      {!isOnline && (
        <div className="rounded-xl bg-amber-500/15 border border-amber-500/35 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5 text-amber-200">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <strong className="font-bold text-amber-300">Modo Offline Ativo</strong> — Exibindo dados em cache local
              {lastSyncedAt ? ` (última sincronização: ${new Date(lastSyncedAt).toLocaleString('pt-BR')})` : ''}.
              <span className="text-amber-200/80 ml-1">
                Vendas, pagamentos e baixas de estoque ficam bloqueados até reconectar ao servidor.
              </span>
            </div>
          </div>
        </div>
      )}

      {isOnline && justReconnected && (
        <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-emerald-200">
          <div className="flex items-center gap-2 font-semibold">
            <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Conexão restabelecida — Dados sincronizados com o servidor.</span>
          </div>
          {onSyncNow && (
            <button
              type="button"
              onClick={onSyncNow}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
            >
              Atualizar Agora
            </button>
          )}
        </div>
      )}

      {updateAvailable && (
        <div className="rounded-xl bg-sky-500/15 border border-sky-500/35 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-sky-200">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Uma nova versão do Lojinha Iceves está pronta para uso.</span>
          </div>
          <button
            type="button"
            onClick={applyUpdate}
            className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold cursor-pointer shrink-0"
          >
            Atualizar Aplicativo
          </button>
        </div>
      )}
    </div>
  );
};
