import { useCallback, useEffect, useState } from "react";

/*
 * PWA support hooks (build prompts #54, #57, #60).
 *
 * - usePwaInstall: exposes the real install capability when the browser
 *   provides it (never a fake install).
 * - useServiceWorkerUpdate: registers /sw.js and detects waiting workers so
 *   users can refresh into a new version instead of getting stuck.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "dismissed") setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  return { canInstall: !!deferredPrompt, isInstalled, install };
}

export function useServiceWorkerRegistration() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;

    const onControllerChange = () => {
      // A new worker took control — this is a version switch.
      // (kept silent; the UI offers an explicit refresh)
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        // If a worker is already waiting, offer the update immediately.
        if (reg.waiting) setUpdateReady(true);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });

    window.addEventListener("controllerchange", onControllerChange);
    return () => {
      window.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    const waiting = navigator.serviceWorker.controller;
    if (waiting) {
      waiting.postMessage("SKIP_WAITING");
    }
    window.location.reload();
  }, []);

  return { updateReady, applyUpdate };
}
