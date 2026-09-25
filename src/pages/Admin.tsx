import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useNavItems } from "@/pages/Dashboard";
import {
  ProblemDetailDialog,
  ResultBody,
} from "@/components/problems";
import {
  adminActivatePrompt,
  adminListAllProblems,
  adminListRecentRequests,
  adminListUsers,
  adminResetTokensUsed,
  adminSavePromptVersion,
  adminSetUserRole,
  adminTestConnection,
  adminTestPrompt,
  adminUpdateApiSettings,
  adminUpdateSetting,
  getApiSettingsInfo,
  getBudgetStatus,
  listMyProblems,
  listPrompts,
  getSystemSettings,
  type AdminProblemRow,
  type AdminUserRow,
  type MyProblemRow,
  type PromptRow,
  type UsageRow,
} from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
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

function timeLabel(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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
  const [stats, setStats] = useState<{
    users: number;
    problems: number;
    requests: number;
    failed: number;
    activeVersion: string;
  } | null>(null);
  const [budget, setBudget] = useState<Awaited<ReturnType<typeof getBudgetStatus>> | null>(null);
  const [recent, setRecent] = useState<MyProblemRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [b, prompts, users, problems, requests, mine] = await Promise.all([
          getBudgetStatus(),
          listPrompts(),
          adminListUsers(),
          adminListAllProblems(),
          adminListRecentRequests(200),
          listMyProblems(8),
        ]);
        setBudget(b);
        setRecent(mine);
        setStats({
          users: users.length,
          problems: problems.length,
          requests: requests.length,
          failed: requests.filter((r) => r.status === "failed").length,
          activeVersion: prompts.find((p) => p.is_active)
            ? `v${prompts.find((p) => p.is_active)!.version}`
            : "none",
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load overview.",
        );
      }
    })();
  }, []);

  if (!stats || !budget) {
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
        <StatCard label="Users" value={stats.users} icon={Users} />
        <StatCard label="Problems" value={stats.problems} icon={FileText} />
        <StatCard
          label="AI requests"
          value={stats.requests}
          hint={`${stats.failed} failed`}
          icon={Activity}
        />
        <StatCard label="Active prompt" value={stats.activeVersion} icon={MessageSquareCode} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
            <Progress value={budget.percent} className="mt-3 h-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              {budget.remaining.toLocaleString()} tokens remaining
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="size-4 text-muted-foreground" />
              DeepSeek connection
            </CardTitle>
            <CardDescription>
              The key lives server-side — as a Supabase Edge Function secret.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Run <code className="font-mono">supabase functions deploy quickfix-ai</code>{" "}
              and set the key with{" "}
              <code className="font-mono">supabase secrets set DEEPSEEK_API_KEY=sk-…</code>.
              The Settings tab's "Test connection" verifies the real thing.
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent problems (all users)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No problems submitted yet.
              </p>
            ) : (
              recent.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{p.problem_text}</span>
                  <StatusBadge status={p.status} />
                  <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:inline">
                    {timeLabel(p.created_at)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function UsersTab() {
  const [users, setUsers] = useState<AdminUserRow[] | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setUsers(await adminListUsers());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load users.");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await adminSetUserRole(userId, role === "admin" ? "admin" : "user");
      toast.success(`Role updated to ${role}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role.");
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Users</CardTitle>
        <CardDescription>
          Role changes are validated server-side; only admins can change them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {users === undefined ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-32">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeLabel(u.created_at)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      onValueChange={(v) => void handleRoleChange(u.id, v)}
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
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Problems                                                            */
/* ------------------------------------------------------------------ */

function ProblemsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rows, setRows] = useState<AdminProblemRow[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setRows(await adminListAllProblems());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load problems.");
        setRows([]);
      }
    })();
  }, []);

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => statusFilter === "all" || r.status === statusFilter),
    [rows, statusFilter],
  );

  return (
    <>
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Submitted problems</CardTitle>
            <CardDescription>All users, newest first.</CardDescription>
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
          {rows === undefined ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : filtered.length === 0 ? (
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
                {filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <TableCell className="max-w-64 truncate font-medium">
                      {p.problem_text}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(p as { owner_email?: string }).owner_email ?? "unknown"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeLabel(p.created_at)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {p.total_tokens > 0 ? p.total_tokens.toLocaleString() : "—"}
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

      <ProblemDetailDialog problemId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* AI usage                                                            */
/* ------------------------------------------------------------------ */

function UsageTab() {
  const [budget, setBudget] = useState<Awaited<ReturnType<typeof getBudgetStatus>> | null>(null);
  const [requests, setRequests] = useState<UsageRow[] | undefined>(undefined);
  const [resetValue, setResetValue] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([getBudgetStatus(), adminListRecentRequests(25)]);
      setBudget(b);
      setRequests(r);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load usage.");
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReset = async () => {
    const n = Number(resetValue);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a non-negative number.");
      return;
    }
    try {
      await adminResetTokensUsed(n);
      toast.success(`Token counter set to ${n.toLocaleString()}`);
      setResetValue("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset.");
    }
  };

  return (
    <div className="space-y-4">
      {budget && (
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Used</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {budget.used.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Remaining</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {budget.remaining.toLocaleString()}
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
          <CardDescription>Last 25 calls, including admin prompt tests.</CardDescription>
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
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {timeLabel(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          r.is_test ? "border-amber-500/40 text-amber-700" : "text-muted-foreground",
                        )}
                      >
                        {r.is_test ? "test" : "problem"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.model}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.input_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.output_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.total_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.response_time_ms > 0 ? `${(r.response_time_ms / 1000).toFixed(1)}s` : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.status === "failed" && r.error_message && (
                        <p className="mt-1 max-w-40 truncate text-[11px] text-destructive">
                          {r.error_message}
                        </p>
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
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

function PromptsTab() {
  const [prompts, setPrompts] = useState<PromptRow[] | undefined>(undefined);
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

  const load = useCallback(async () => {
    try {
      setPrompts(await listPrompts());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load prompts.");
      setPrompts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activePrompt = useMemo(
    () => prompts?.find((p) => p.is_active),
    [prompts],
  );

  const draftIsValid = draftText.includes("{{problem}}");

  const handleSave = async () => {
    try {
      const version = await adminSavePromptVersion(
        name || "QuickFix prompt",
        draftText,
      );
      toast.success(`Saved prompt v${version} — now active`);
      setName("");
      setDraftText("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save prompt.");
    }
  };

  const handleActivate = async (promptId: string) => {
    try {
      await adminActivatePrompt(promptId);
      toast.success("Prompt version activated");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to activate.");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const outcome = await adminTestPrompt(
        testProblem,
        draftText.trim() || undefined,
      );
      if (outcome.ok) {
        setTestResult({ ...outcome.result, tokens: outcome.tokens });
      } else {
        toast.error(outcome.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareCode className="size-4 text-muted-foreground" />
              Edit prompt
            </CardTitle>
            <CardDescription>
              Saving creates a NEW version and activates it — old versions are
              never overwritten. Must include{" "}
              <code className="font-mono">{"{{problem}}"}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Prompt name (e.g. "Tighter word limits")'
            />
            <Textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={
                activePrompt
                  ? `Current active prompt (v${activePrompt.version}):\n\n${activePrompt.prompt_text}`
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
              Runs a real AI call against the draft (or the active version if
              the editor is empty). Tokens count against the budget; nothing is
              saved as a user problem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={testProblem}
              onChange={(e) => setTestProblem(e.target.value)}
              className="min-h-20 resize-none"
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void handleTest()}
              disabled={testing || testProblem.trim().length < 10}
            >
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {testing ? "Running test…" : "Run test"}
            </Button>

            {testResult && (
              <div className="rounded-xl border border-border p-4">
                <ResultBody
                  result={{
                    summary: testResult.summary,
                    causes: testResult.causes,
                    fixes: testResult.fixes,
                    model: "deepseek-chat (test)",
                    promptLabel: draftText.trim() ? "draft" : activePrompt ? `v${activePrompt.version}` : null,
                    tokens: {
                      input: 0,
                      output: testResult.tokens,
                      total: testResult.tokens,
                    },
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                key={p.id}
                className={cn(
                  "rounded-xl border px-4 py-3",
                  p.is_active ? "border-emerald-500/40 bg-emerald-500/5" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      v{p.version} · {p.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {p.prompt_text}
                    </p>
                  </div>
                  {p.is_active ? (
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
                      onClick={() => void handleActivate(p.id)}
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
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function SettingsTab() {
  const [apiInfo, setApiInfo] = useState<Awaited<ReturnType<typeof getApiSettingsInfo>> | null>(null);
  const [system, setSystem] = useState<Awaited<ReturnType<typeof getSystemSettings>> | null>(null);
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

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([getApiSettingsInfo(), getSystemSettings()]);
      setApiInfo(a);
      setSystem(s);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleModelChange = async (model: string) => {
    if (!apiInfo) return;
    try {
      await adminUpdateApiSettings(model, apiInfo.isEnabled);
      toast.success(`Model set to ${model}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update model.");
    }
  };

  const handleEnabledChange = async (isEnabled: boolean) => {
    if (!apiInfo) return;
    try {
      await adminUpdateApiSettings(apiInfo.model, isEnabled);
      toast.success(isEnabled ? "AI enabled" : "AI disabled");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update.");
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminTestConnection();
      setTestResult(res);
      if (res.ok) toast.success("DeepSeek connection OK");
      else toast.error(res.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed.");
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
      await adminUpdateSetting(key, value);
      toast.success("Setting updated");
      clear();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update.");
    }
  };

  if (!apiInfo || !system) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="size-4 text-muted-foreground" />
            DeepSeek configuration
          </CardTitle>
          <CardDescription>
            The API key is a server-side secret and is never displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-muted-foreground" />
              API key
            </div>
            <Badge variant="outline" className="border-border text-muted-foreground">
              Set via Supabase secrets
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model-select">Model</Label>
            <Select value={apiInfo.model} onValueChange={(v) => void handleModelChange(v)}>
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {apiInfo.availableModels.map((m) => (
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
              checked={apiInfo.isEnabled}
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
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
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
                  {testResult.latencyMs !== undefined && ` (${testResult.latencyMs}ms)`}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
              current: system.budget,
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
            Rate limits (server-side): 10 problems/hour per user, minimum 5s
            between requests, enforced inside the Edge Function.
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
  const navItems = useNavItems();

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
