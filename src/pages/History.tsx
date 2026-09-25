import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useNavItems } from "@/pages/Dashboard";
import { HistoryRowCard, ProblemDetailDialog } from "@/components/problems";
import { listMyProblems, type MyProblemRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { History as HistoryIcon, RefreshCw } from "lucide-react";

export default function History() {
  const navItems = useNavItems();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<MyProblemRow[] | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setRows(await listMyProblems(100));
    } catch {
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell navItems={navItems}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">My history</h1>
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
        <p className="mt-1 text-sm text-muted-foreground">
          Every problem you've submitted, with its AI Quick Fix. Only you can
          see this page.
        </p>

        <div className="mt-6 space-y-2">
          {rows === undefined ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))
          ) : rows.length === 0 ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <HistoryIcon className="size-5 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  Nothing here yet — your first Quick Fix is one problem away.
                </p>
              </CardContent>
            </Card>
          ) : (
            rows.map((row) => (
              <HistoryRowCard key={row.id} row={row} onOpen={() => setSelectedId(row.id)} />
            ))
          )}
        </div>
      </div>

      <ProblemDetailDialog problemId={selectedId} onClose={() => setSelectedId(null)} />
    </AppShell>
  );
}
