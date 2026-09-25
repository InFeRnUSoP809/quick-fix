import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePwaInstall } from "@/hooks/use-pwa";
import { toast } from "sonner";
import { Download, Info } from "lucide-react";

/**
 * Always-visible install affordance.
 *
 * - When the browser fires `beforeinstallprompt` (Chrome/Edge/Android, HTTPS,
 *   outside iframes) the button triggers the real native install dialog.
 * - When it doesn't (Safari/iOS, or inside preview iframes), the button opens
 *   a small guide so users can always install via their browser menu.
 * - Hidden once the app is already running installed (standalone mode).
 */
export function InstallAppButton() {
  const { canInstall, isInstalled, install } = usePwaInstall();

  if (isInstalled) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
        <Download className="size-3" />
        Installed
      </span>
    );
  }

  if (canInstall) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={async () => {
          const accepted = await install();
          if (accepted) toast.success("QuickFix AI installed 🎉");
        }}
      >
        <Download className="size-4" />
        Install app
      </Button>
    );
  }

  // No native prompt available (iOS Safari, or restricted contexts).
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="size-4" />
          Install app
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Info className="size-4 text-muted-foreground" />
          Install QuickFix AI
        </div>
        <div className="mt-3 space-y-2.5 text-xs leading-5 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">iPhone / iPad:</span>{" "}
            in Safari, tap the <span className="text-foreground">Share</span> icon →{" "}
            <span className="text-foreground">Add to Home Screen</span>.
          </p>
          <p>
            <span className="font-medium text-foreground">Android / Chrome:</span>{" "}
            open the browser menu <span className="font-mono">⋮</span> →{" "}
            <span className="text-foreground">Install app</span> (or{" "}
            <span className="text-foreground">Add to Home screen</span>).
          </p>
          <p>
            <span className="font-medium text-foreground">Desktop Chrome/Edge:</span>{" "}
            click the install icon in the address bar, or menu → Install.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
