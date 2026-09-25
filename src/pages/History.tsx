import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, USER_NAV } from "@/pages/Dashboard";
import {
  HistoryRowCard,
  ProblemDetailDialog,
} from "@/components/problems";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { History as HistoryIcon } from "lucide-react";

export default function History() {
  const [selectedId, setSelectedId] = useState<Id<"problems"> | null>(null);
  const history = useQuery(api.problems.listMine, { limit: 100 });

  return (
    <AppShell navItems={USER_NAV}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">My history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every problem you've submitted, with its AI Quick Fix. Only you can
          see this page.
        </p>

        <div className="mt-6 space-y-2">
          {history === undefined ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))
          ) : history.length === 0 ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <HistoryIcon className="size-5 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  Nothing here yet — your first Quick Fix is one problem away.
                </p>
              </CardContent>
            </Card>
          ) : (
            history.map((row) => (
              <HistoryRowCard
                key={row._id}
                row={row}
                onOpen={() => setSelectedId(row._id)}
              />
            ))
          )}
        </div>
      </div>

      <ProblemDetailDialog
        problemId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </AppShell>
  );
}
