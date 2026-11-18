import { useEffect, useState, useCallback } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let swUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swInitialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(fn => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    cachedDeferredPrompt = null;
    notifyListeners();
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    cachedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };

    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const syncPrompt = () => {
      setDeferredPrompt(cachedDeferredPrompt);
      checkStandalone();
    };
    listeners.add(syncPrompt);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = () => checkStandalone();
    mediaQuery.addEventListener?.('change', handleDisplayChange);

    if (!swInitialized) {
      swInitialized = true;
      try {
        swUpdateFn = registerSW({
          immediate: true,
          onNeedRefresh() {
            setUpdateAvailable(true);
          },
          onOfflineReady() {
            // App essential shell cached cleanly for offline opening
          }
        });
      } catch {
        // Ignore registration errors in restricted preview contexts
      }
    }

    return () => {
      listeners.delete(syncPrompt);
      mediaQuery.removeEventListener?.('change', handleDisplayChange);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEvent = cachedDeferredPrompt || deferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      cachedDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      notifyListeners();
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const applyUpdate = useCallback(async () => {
    if (swUpdateFn) {
      await swUpdateFn(true);
    } else {
      window.location.reload();
    }
  }, []);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    updateAvailable,
    install,
    applyUpdate
  };
}
