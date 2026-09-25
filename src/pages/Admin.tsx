import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, type NavItem } from "@/components/AppShell";
import { useNavItems } from "@/pages/Dashboard";
import {
  ProblemDetailDialog,
  ResultBody,
  timeLabel,
} from "@/components/problems";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  FlaskConical,
  Gauge,
  KeyRound,
  Loader2,
  MessageSquareCode,
  Play,
  Plug,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        status === "completed" || status === "success"
          ? "border-emerald-500/40 text-emerald-700"
          : status === "failed" || status === "error"
            ? "border-destructive/40 text-destructive"
            : "text-muted-foreground",
      )}
    >
      {status}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <Icon className="size-4 text-muted-foreground/70" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewTab() {
  const overview = useQuery(api.admin.getOverview, {});
  const budget = useQuery(api.aiBudget.getBudgetStatus, {});

  if (overview === undefined || budget === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={overview.totalUsers} icon={Users} />
        <StatCard
          label="Problems"
          value={overview.totalProblems}
          icon={FileText}
        />
        <StatCard
          label="AI requests"
          value={overview.aiRequests}
          hint={`${overview.failedRequests} failed`}
          icon={Activity}
        />
        <StatCard
          label="Active prompt"
          value={overview.activePromptVersion}
          icon={MessageSquareCode}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Token budget */}
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-muted-foreground" />
              AI token budget
            </CardTitle>
            <CardDescription>
              Hard cap enforced server-side before every AI call.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-semibold tabular-nums">
                {budget.used.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                of {budget.budget.toLocaleString()} tokens
              </span>
            </div>
            <Progress
              value={budget.percent}
              className="mt-3 h-2"
              aria-label="Token budget usage"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {budget.remaining.toLocaleString()} tokens remaining ·{" "}
              {budget.requestCount} requests logged
            </p>
          </CardContent>
        </Card>

        {/* Connection status */}
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="size-4 text-muted-foreground" />
              DeepSeek connection
            </CardTitle>
            <CardDescription>
              Key lives server-side only — never in the browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              {overview.deepseekConfigured ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  API key configured
                </>
              ) : (
                <>
                  <AlertTriangle className="size-4 text-amber-600" />
                  No API key configured
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              {overview.aiEnabled ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  AI enabled
                </>
              ) : (
                <>
                  <AlertTriangle className="size-4 text-amber-600" />
                  AI disabled by an administrator
                </>
              )}
            </div>
            {!overview.deepseekConfigured && (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                Add <code className="font-mono">DEEPSEEK_API_KEY</code> in the
                project's Keys settings, then run a connection test from the
                Settings tab.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent problems */}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Recent problems</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.recentProblems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No problems submitted yet.
            </p>
          ) : (
            overview.recentProblems.map((p) => (
              <div
                key={p._id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {p.problemText}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {p.ownerEmail}
                </span>
                <StatusBadge status={p.status} />
                <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:inline">
                  {timeLabel(p.createdAt)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function UsersTab() {
  const users = useQuery(api.admin.listUsers, {});
  const setUserRole = useMutation(api.admin.setUserRole);

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await setUserRole({
        userId: userId as Id<"users">,
        role: role === "admin" ? "admin" : "user",
      });
      toast.success(`Role updated to ${role}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    }
  };

  if (users === undefined) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Users</CardTitle>
        <CardDescription>
          Roles are enforced server-side on every request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-32">Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u._id}>
                <TableCell className="font-medium">
                  {u.name ?? "—"}
                  {u.isAnonymous && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (guest)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.email ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {timeLabel(u.createdAt)}
                </TableCell>
                <TableCell>
                  <Select
                    value={u.role}
                    onValueChange={(v) => void handleRoleChange(u._id, v)}
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">user</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Problems                                                            */
/* ------------------------------------------------------------------ */

function ProblemsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<Id<"problems"> | null>(null);

  const problems = useQuery(
    api.admin.listAllProblems,
    statusFilter === "all"
      ? { limit: 100 }
      : {
          limit: 100,
          status: statusFilter as
            | "pending"
            | "processing"
            | "completed"
            | "failed",
        },
  );

  return (
    <>
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Submitted problems</CardTitle>
            <CardDescription>
              Every problem across all users, newest first.
            </CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {problems === undefined ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : problems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No problems match this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Problem</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((p) => (
                  <TableRow
                    key={p._id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(p._id)}
                  >
                    <TableCell className="max-w-64 truncate font-medium">
                      {p.problemText}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.owner?.email ?? "unknown"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeLabel(p.createdAt)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {p.totalTokens > 0 ? p.totalTokens.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProblemDetailDialog
        problemId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* AI usage                                                            */
/* ------------------------------------------------------------------ */

function UsageTab() {
  const budget = useQuery(api.aiBudget.getBudgetStatus, {});
  const requests = useQuery(api.admin.listRecentAiRequests, { limit: 25 });
  const setTokensUsed = useMutation(api.aiBudget.adminSetTokensUsed);
  const [resetValue, setResetValue] = useState("");

  const handleReset = async () => {
    const n = Number(resetValue);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a non-negative number.");
      return;
    }
    try {
      await setTokensUsed({ used: n });
      toast.success(`Token counter set to ${n.toLocaleString()}`);
      setResetValue("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset");
    }
  };

  return (
    <div className="space-y-4">
      {budget === undefined ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-muted-foreground" />
              Budget breakdown
            </CardTitle>
            <CardDescription>
              Reservations are counted before each call; failures are refunded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Used
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {budget.used.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Remaining
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {budget.remaining.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Input tokens
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {budget.inputTokens.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Output tokens
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {budget.outputTokens.toLocaleString()}
                </p>
              </div>
            </div>
            <Progress value={budget.percent} className="h-2" />
            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
              <Label htmlFor="token-reset" className="text-xs text-muted-foreground">
                New budget cycle? Set the counter:
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="token-reset"
                  type="number"
                  min={0}
                  value={resetValue}
                  onChange={(e) => setResetValue(e.target.value)}
                  placeholder="0"
                  className="h-8 w-28"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void handleReset()}
                  disabled={resetValue === ""}
                >
                  <RotateCcw className="size-3.5" />
                  Apply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Recent AI requests</CardTitle>
          <CardDescription>
            Last 25 calls, including admin prompt tests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests === undefined ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : requests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No AI requests yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="text-muted-foreground">
                      {timeLabel(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          r.kind === "test"
                            ? "border-amber-500/40 text-amber-700"
                            : "text-muted-foreground",
                        )}
                      >
                        {r.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.model}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.inputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.outputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.totalTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.responseTimeMs > 0 ? `${(r.responseTimeMs / 1000).toFixed(1)}s` : "—"}
                    </TableCell>
                    <TableCell>
                      {r.status === "success" ? (
                        <StatusBadge status="success" />
                      ) : (
                        <span
                          className="text-xs text-destructive"
                          title={r.errorMessage ?? undefined}
                        >
                          failed
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prompts: edit, version, activate, test                              */
/* ------------------------------------------------------------------ */

function PromptsTab() {
  const prompts = useQuery(api.admin.listPrompts, {});
  const saveVersion = useMutation(api.admin.savePromptVersion);
  const activate = useMutation(api.admin.activatePrompt);
  const testPrompt = useAction(api.ai.testPrompt);

  const activePrompt = useMemo(
    () => prompts?.find((p) => p.isActive),
    [prompts],
  );

  const [name, setName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [testProblem, setTestProblem] = useState(
    "My laptop is overheating and the fan is always running.",
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    summary: string;
    causes: string[];
    fixes: string[];
    tokens: number;
  } | null>(null);

  const draftIsValid = draftText.includes("{{problem}}");

  const handleSave = async () => {
    try {
      const res = await saveVersion({ name: name || "QuickFix prompt", promptText: draftText });
      toast.success(`Saved prompt v${res.version} — now active`);
      setName("");
      setDraftText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save prompt");
    }
  };

  const handleActivate = async (promptId: Id<"aiPrompts">) => {
    try {
      await activate({ promptId });
      toast.success("Prompt version activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to activate");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const outcome = await testPrompt({
        problem: testProblem,
        draftPromptText: draftText.trim() || undefined,
      });
      if (outcome.ok) {
        setTestResult({ ...outcome.result, tokens: outcome.tokens });
      } else {
        toast.error(outcome.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Editor + tester */}
      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareCode className="size-4 text-muted-foreground" />
              Edit prompt
            </CardTitle>
            <CardDescription>
              Saving creates a NEW version and activates it. Old versions are
              never overwritten. Must include{" "}
              <code className="font-mono">{"{{problem}}"}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Prompt name (e.g. "Tighter word limits")`}
            />
            <Textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={
                activePrompt
                  ? `Current active prompt (v${activePrompt.version}):\n\n${activePrompt.promptText}`
                  : "You are QuickFix AI… {{problem}} …"
              }
              className="min-h-56 resize-y font-mono text-xs leading-5"
            />
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-xs",
                  draftText.length > 0 && !draftIsValid
                    ? "text-amber-600"
                    : "text-muted-foreground",
                )}
              >
                {draftText.length}/8000 characters
                {draftText.length > 0 && !draftIsValid && " · missing {{problem}}"}
              </span>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void handleSave()}
                disabled={!draftIsValid || draftText.length > 8000}
              >
                <Save className="size-3.5" />
                Save as new version
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="size-4 text-muted-foreground" />
              Test prompt
            </CardTitle>
            <CardDescription>
              Runs a real AI call against the draft above (or the active
              version if the editor is empty). Tokens count against the budget
              and are never saved as a user problem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={testProblem}
              onChange={(e) => setTestProblem(e.target.value)}
              className="min-h-20 resize-none"
              placeholder="Sample problem to test with…"
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void handleTest()}
              disabled={testing || testProblem.trim().length < 10}
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {testing ? "Running test…" : "Run test"}
            </Button>

            {testResult && (
              <div className="rounded-xl border border-border p-4">
                <ResultBody
                  result={{
                    summary: testResult.summary,
                    causes: testResult.causes,
                    fixes: testResult.fixes,
                    model: "test",
                    totalTokens: testResult.tokens,
                    inputTokens: 0,
                    outputTokens: testResult.tokens,
                    promptId: draftText.trim() ? "draft" : activePrompt ? `v${activePrompt.version}` : null,
                    status: "success",
                    errorMessage: null,
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Version history */}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Version history</CardTitle>
          <CardDescription>
            Activate any previous version to roll back instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {prompts === undefined ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : prompts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No prompts saved yet.
            </p>
          ) : (
            prompts.map((p) => (
              <div
                key={p._id}
                className={cn(
                  "rounded-xl border px-4 py-3",
                  p.isActive ? "border-emerald-500/40 bg-emerald-500/5" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      v{p.version} · {p.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {p.promptText}
                    </p>
                  </div>
                  {p.isActive ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-emerald-500/40 text-emerald-700"
                    >
                      Active
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void handleActivate(p._id)}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings: model, connection, system limits                          */
/* ------------------------------------------------------------------ */

function SettingsTab() {
  const settings = useQuery(api.admin.getApiSettings, {});
  const system = useQuery(api.admin.getSystemSettings, {});
  const updateApi = useMutation(api.admin.updateApiSettings);
  const updateSetting = useMutation(api.admin.updateSystemSetting);
  const testConnection = useAction(api.aiTest.testConnection);

  const [savingModel, setSavingModel] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: string;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [budgetValue, setBudgetValue] = useState("");
  const [outputValue, setOutputValue] = useState("");
  const [lengthValue, setLengthValue] = useState("");

  const handleModelChange = async (model: string) => {
    if (!settings) return;
    setSavingModel(true);
    try {
      await updateApi({ model, isEnabled: settings.isEnabled });
      toast.success(`Model set to ${model}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update model");
    } finally {
      setSavingModel(false);
    }
  };

  const handleEnabledChange = async (isEnabled: boolean) => {
    if (!settings) return;
    try {
      await updateApi({ model: settings.model, isEnabled });
      toast.success(isEnabled ? "AI enabled" : "AI disabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update");
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection({});
      setTestResult(res);
      if (res.ok) {
        toast.success("DeepSeek connection OK");
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const saveSetting = async (
    key: "ai_token_budget" | "max_output_tokens" | "max_problem_length",
    raw: string,
    clear: () => void,
  ) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a positive number.");
      return;
    }
    try {
      await updateSetting({ key, value });
      toast.success("Setting updated");
      clear();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update");
    }
  };

  if (settings === undefined || system === undefined) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* API settings */}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="size-4 text-muted-foreground" />
            DeepSeek configuration
          </CardTitle>
          <CardDescription>
            The API key is stored server-side only and is never displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-muted-foreground" />
              API key
            </div>
            {settings.hasApiKeyConfigured ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-700"
              >
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                Missing
              </Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model-select">Model</Label>
            <Select
              value={settings.model}
              onValueChange={(v) => void handleModelChange(v)}
              disabled={savingModel}
            >
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {settings.availableModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="ai-enabled" className="text-sm">
                AI enabled
              </Label>
              <p className="text-xs text-muted-foreground">
                When off, all AI requests are rejected before reaching DeepSeek.
              </p>
            </div>
            <Switch
              id="ai-enabled"
              checked={settings.isEnabled}
              onCheckedChange={(v) => void handleEnabledChange(v)}
            />
          </div>

          <div className="border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleTestConnection()}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plug className="size-3.5" />
              )}
              {testing ? "Testing…" : "Test connection"}
            </Button>
            {testResult && (
              <div
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
                  testResult.ok
                    ? "bg-emerald-500/10 text-emerald-800"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                )}
                <span>
                  {testResult.message}
                  {testResult.latencyMs !== undefined &&
                    ` (${testResult.latencyMs}ms)`}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* System settings */}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-muted-foreground" />
            System settings
          </CardTitle>
          <CardDescription>
            Limits can be tightened but never disabled — minimums are enforced
            server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              key: "ai_token_budget" as const,
              label: "AI token budget",
              hint: "Hard total-token cap (default 20,000)",
              current: system.aiTokenBudget,
              value: budgetValue,
              setValue: setBudgetValue,
            },
            {
              key: "max_output_tokens" as const,
              label: "Max output tokens",
              hint: "Per-request output cap (default 300)",
              current: system.maxOutputTokens,
              value: outputValue,
              setValue: setOutputValue,
            },
            {
              key: "max_problem_length" as const,
              label: "Max problem length",
              hint: "Characters per problem (default 1,000)",
              current: system.maxProblemLength,
              value: lengthValue,
              setValue: setLengthValue,
            },
          ].map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <Label className="text-sm">{row.label}</Label>
                <p className="text-xs text-muted-foreground">{row.hint}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-right text-sm font-medium tabular-nums">
                  {row.current.toLocaleString()}
                </span>
                <Input
                  type="number"
                  min={1}
                  value={row.value}
                  onChange={(e) => row.setValue(e.target.value)}
                  placeholder="New value"
                  className="h-8 w-28"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={row.value === ""}
                  onClick={() =>
                    void saveSetting(row.key, row.value, () => row.setValue(""))
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          ))}
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Rate limits (server-side only): {system.rateLimits.problemsPerHour}{" "}
            problems/hour per user, minimum{" "}
            {system.rateLimits.minIntervalSeconds}s between requests, and{" "}
            20 prompt tests/hour for admins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Admin() {
  const navItems: NavItem[] = useNavItems();

  return (
    <AppShell navItems={navItems} badge="Admin">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-6 text-emerald-600" />
          <h1 className="text-2xl font-semibold tracking-tight">Admin console</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Users, problems, AI usage, prompts, and system configuration.
        </p>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="flex w-full flex-wrap gap-1 sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="problems">Problems</TabsTrigger>
            <TabsTrigger value="usage">AI usage</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
          <TabsContent value="problems" className="mt-4">
            <ProblemsTab />
          </TabsContent>
          <TabsContent value="usage" className="mt-4">
            <UsageTab />
          </TabsContent>
          <TabsContent value="prompts" className="mt-4">
            <PromptsTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
