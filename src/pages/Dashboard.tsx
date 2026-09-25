import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell, type NavItem } from "@/components/AppShell";
import {
  NewProblemForm,
  HistoryRowCard,
} from "@/components/problems";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History,
  LayoutDashboard,
  ListPlus,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { ProblemDetailDialog } from "@/components/problems";

export const USER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/dashboard/new", label: "New Problem", icon: ListPlus },
  { to: "/dashboard/history", label: "History", icon: History },
];

export default function Dashboard() {
  const [selectedId, setSelectedId] = useState<Id<"problems"> | null>(null);
  const history = useQuery(api.problems.listMine, { limit: 50 });

  const recent = useMemo(() => (history ?? []).slice(0, 5), [history]);

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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent problems
          </h2>
          <div className="mt-4 space-y-2">
            {history === undefined ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))
            ) : history.length === 0 ? (
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
                  key={row._id}
                  row={row}
                  onOpen={() => setSelectedId(row._id)}
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

      <ProblemDetailDialog
        problemId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </AppShell>
  );
}
