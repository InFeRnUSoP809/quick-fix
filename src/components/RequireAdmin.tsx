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
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Wraps a route that requires an ADMIN user.
 *
 * The role comes from the Supabase `profiles` table (promoted automatically
 * for the first signed-up user by the schema trigger). Server-side functions
 * must still re-verify the role — this guard is a UX layer, not the boundary.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, user } = useAuth();

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
              Setting up for the first time? The <strong>first account</strong>{" "}
              registered is promoted to admin automatically. If that wasn't you,
              ask an existing admin to change your role in the Users tab, or run
              an UPDATE on{" "}
              <code className="font-mono">public.profiles</code> in the Supabase
              SQL editor.
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
          </CardFooter>
        </Card>
      </main>
    );
  }

  return children;
}
