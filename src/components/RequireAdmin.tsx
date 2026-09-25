import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, UserCog } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Wraps a route that requires an ADMIN user.
 *
 * Must be rendered inside <RequireAuth> so the caller is signed in first —
 * this guard only handles the role check. Authorization is ALWAYS re-checked
 * server-side (every admin Convex function calls requireAdmin), so this UI
 * guard is a convenience, not the security boundary.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, user } = useAuth();
  const becomeFirstAdmin = useMutation(api.setup.becomeFirstAdmin);
  const [claiming, setClaiming] = useState(false);

  const handleClaimAdmin = async () => {
    setClaiming(true);
    try {
      const res = await becomeFirstAdmin({});
      if (res.ok) {
        toast.success("You are now the admin. Reloading…");
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.error(res.reason ?? "An admin already exists.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim admin");
    } finally {
      setClaiming(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-3 px-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </main>
    );
  }

  if (user?.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="size-5 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl">Admin access required</CardTitle>
            <CardDescription>
              This console is only available to administrator accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-center text-sm text-muted-foreground">
            <p>
              You are signed in as{" "}
              <span className="font-medium text-foreground">
                {user?.email ?? "a guest user"}
              </span>
              .
            </p>
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5">
              Setting up QuickFix AI for the first time? The first account can
              claim the admin role here. Afterwards, admins grant the role to
              others from the Users tab.
            </p>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button className="w-full" onClick={() => window.history.back()}>
              Go back
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => (window.location.href = "/dashboard")}
            >
              Open my dashboard
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-1.5 text-muted-foreground"
              onClick={() => void handleClaimAdmin()}
              disabled={claiming}
            >
              {claiming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserCog className="size-4" />
              )}
              Claim admin (first-time setup)
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return children;
}
