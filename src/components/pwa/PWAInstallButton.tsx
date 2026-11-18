import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle2, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'topbar' | 'sidebar' | 'settings';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'topbar' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed and running in standalone mode:
  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Aplicativo já instalado neste dispositivo</span>
        </div>
      );
    }
    return null;
  }

  // Chromium / Android / Desktop native beforeinstallprompt
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'settings'
            ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-extrabold shadow-md transition cursor-pointer'
            : variant === 'sidebar'
            ? 'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-extrabold transition cursor-pointer'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-[11px] font-extrabold shadow-sm transition cursor-pointer'
        }
        title="Instalar Lojinha Iceves no dispositivo (PWA)"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>INSTALAR APLICATIVO</span>
      </button>
    );
  }

  // iOS Safari (does not support beforeinstallprompt)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'settings'
              ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-extrabold shadow-md transition cursor-pointer'
              : variant === 'sidebar'
              ? 'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-extrabold transition cursor-pointer'
              : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-extrabold transition cursor-pointer'
          }
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>INSTALAR APLICATIVO</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#161616] border border-emerald-500/30 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Instalar no iPhone / iPad</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#111111] border border-white/[0.08]">
                  <Share className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>1.</strong> Toque no botão <strong>Compartilhar</strong> na barra do Safari.
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#111111] border border-white/[0.08]">
                  <PlusSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>2.</strong> Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>.
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#111111] border border-white/[0.08]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>3.</strong> Confirme tocando em <strong>Adicionar</strong>. O app abrirá como aplicativo independente.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Never show a fake install button in TopBar/Sidebar when browser doesn't expose install prompt
  if (variant === 'settings') {
    return (
      <div className="p-3 rounded-xl bg-[#141414] border border-white/[0.08] text-xs text-zinc-400 space-y-1">
        <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          Instalação Nativa PWA
        </div>
        <p className="text-[11px]">
          O botão <strong>INSTALAR APLICATIVO</strong> fica disponível automaticamente quando o aplicativo é aberto diretamente no Chrome, Edge ou Safari (fora de iframe) e ainda não está instalado.
        </p>
      </div>
    );
  }

  return null;
};
