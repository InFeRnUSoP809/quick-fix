import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, type NavItem } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { deleteProblem } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HistoryRowCard, NewProblemForm, ProblemDetailDialog } from "@/components/problems";
import { listMyProblems, type MyProblemRow } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  History,
  LayoutDashboard,
  ListPlus,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export const USER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/dashboard/new", label: "New Problem", icon: ListPlus },
  { to: "/dashboard/history", label: "History", icon: History },
];

/**
 * Sidebar nav for the authenticated shell. Admins additionally get the
 * admin console entry — the route itself is still guarded by RequireAdmin.
 */
export function useNavItems(): NavItem[] {
  const { user } = useAuth();
  return useMemo(
    () =>
      user?.role === "admin"
        ? [...USER_NAV, { to: "/admin", label: "Admin console", icon: ShieldCheck }]
        : USER_NAV,
    [user?.role],
  );
}

export default function Dashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<MyProblemRow[] | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MyProblemRow | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setRows(await listMyProblems(50));
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recent = useMemo(() => (rows ?? []).slice(0, 5), [rows]);

  return (
    <AppShell navItems={USER_NAV}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          What problem can we help with?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe it in a sentence or two — you'll get three likely causes and
          three practical fixes.
        </p>

        <div className="mt-6">
          <NewProblemForm />
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent problems
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => void load()}
              disabled={refreshing}
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {rows === undefined ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))
            ) : rows.length === 0 ? (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <Wrench className="size-5 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">
                    No problems yet. Your Quick Fixes will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              recent.map((row) => (
                <HistoryRowCard
                  key={row.id}
                  row={row}
                  onOpen={() => setSelectedId(row.id)}
                  onDelete={() => setPendingDelete(row)}
                  deleting={deletingId === row.id}
                />
              ))
            )}
          </div>
        </section>

        <div className="mt-10 flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          QuickFix AI offers general suggestions only — it isn't a professional
          service. For emergencies, contact your local emergency number.
        </div>
      </div>

      <ProblemDetailDialog problemId={selectedId} onClose={() => setSelectedId(null)} />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this problem?</AlertDialogTitle>
            <AlertDialogDescription>
              "
              {pendingDelete?.problem_text.slice(0, 80)}
              {pendingDelete && pendingDelete.problem_text.length > 80 ? "…" : ""}" and
              its AI result will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                setDeletingId(pendingDelete.id);
                try {
                  await deleteProblem(pendingDelete.id);
                  toast.success("Problem deleted");
                  // Optimistic removal, then reconcile with the database so
                  // dashboard, history and admin views all agree.
                  setRows((prev) => prev?.filter((r) => r.id !== pendingDelete.id));
                  void load();
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Failed to delete.",
                  );
                } finally {
                  setDeletingId(null);
                  setPendingDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
