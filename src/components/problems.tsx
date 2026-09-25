import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
} from "lucide-react";

export const MIN_PROBLEM_LEN = 10;
export const FALLBACK_MAX_PROBLEM_LEN = 1000;

export type ProblemStatus = "pending" | "processing" | "completed" | "failed";

export interface HistoryRow {
  _id: Id<"problems">;
  problemText: string;
  status: ProblemStatus;
  createdAt: number;
}

export interface ProblemResult {
  summary: string;
  causes: string[];
  fixes: string[];
  model: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  promptId: string | null;
  status: string;
  errorMessage: string | null;
}

/** Friendly relative time label. */
export function timeLabel(ts: number): string {
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

/* ------------------------------------------------------------------ */
/* New problem form: input -> loading -> result dialog                 */
/* ------------------------------------------------------------------ */

export function NewProblemForm({ maxLength = FALLBACK_MAX_PROBLEM_LEN }: { maxLength?: number }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"problems"> | null>(null);

  const createProblem = useMutation(api.problems.create);
  // Actions are invoked through useMutation on the client.
  const runProblem = useMutation(api.ai.runProblem);

  const charCount = text.length;
  const canSubmit =
    text.trim().length >= MIN_PROBLEM_LEN &&
    charCount <= maxLength &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // 1) Create + validate server-side (rate limits, length, auth).
      const { problemId } = await createProblem({ problemText: text });
      // 2) Run the AI pipeline against the active prompt + budget.
      const outcome = await runProblem({ problemId });
      if (outcome.ok) {
        toast.success("Quick Fix ready");
        setSelectedId(problemId);
        setText("");
      } else {
        toast.error(outcome.error);
      }
    } catch (error) {
      // Server-side validation / rate limit errors land here with safe messages.
      toast.error(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-border/80 shadow-none">
        <CardContent className="pt-6">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, maxLength))}
            placeholder="e.g. My laptop gets very hot and the fan is always running…"
            className="min-h-28 resize-none border-border/80 text-[15px] leading-6"
            disabled={submitting}
            autoFocus
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span
              className={cn(
                "text-xs",
                charCount > maxLength - 100
                  ? "text-amber-600"
                  : "text-muted-foreground",
              )}
            >
              {charCount.toLocaleString()} / {maxLength.toLocaleString()} characters
            </span>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="gap-2 sm:min-w-44"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Analyzing your problem…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Get Quick Fix
                </>
              )}
            </Button>
          </div>
          {submitting && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Analyzing your problem — this usually takes a few seconds.
            </div>
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
/* History row                                                         */
/* ------------------------------------------------------------------ */

export function HistoryRowCard({
  row,
  onOpen,
}: {
  row: HistoryRow;
  onOpen: () => void;
}) {
  const statusIcon =
    row.status === "completed" ? (
      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
    ) : row.status === "failed" ? (
      <AlertTriangle className="size-4 shrink-0 text-destructive" />
    ) : (
      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
    );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/20"
    >
      {statusIcon}
      <span className="min-w-0 flex-1 truncate text-sm">{row.problemText}</span>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {timeLabel(row.createdAt)}
      </span>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
        {row.status}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detail dialog (owner-scoped fetch via getWithResult)                */
/* ------------------------------------------------------------------ */

export function ProblemDetailDialog({
  problemId,
  onClose,
}: {
  problemId: Id<"problems"> | null;
  onClose: () => void;
}) {
  const detail = useQuery(
    api.problems.getWithResult,
    problemId ? { problemId } : "skip",
  );

  return (
    <Dialog open={!!problemId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {detail === undefined ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : detail === null ? (
          <p className="py-6 text-sm text-muted-foreground">
            Problem not found.
          </p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-base leading-6">
                {detail.problemText}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 text-xs">
                <Clock className="size-3" />
                {timeLabel(detail.createdAt)} ·{" "}
                {detail.status === "completed"
                  ? "Completed"
                  : detail.status === "failed"
                    ? "Failed"
                    : "Processing"}
              </DialogDescription>
            </DialogHeader>

            {detail.result ? (
              detail.result.status === "success" ? (
                <ResultBody result={detail.result} />
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {detail.result.errorMessage ?? "This request failed."}
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                No AI result is attached to this problem yet.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Result rendering — safe text nodes only, never HTML injection       */
/* ------------------------------------------------------------------ */

export function ResultBody({ result }: { result: ProblemResult }) {
  return (
    <div className="mt-2 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </p>
        <p className="mt-1.5 text-sm leading-6">{result.summary}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Likely causes
          </p>
          <ol className="mt-2 space-y-1.5">
            {result.causes.map((cause, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                  {i + 1}
                </span>
                {cause}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recommended fixes
          </p>
          <ol className="mt-2 space-y-1.5">
            {result.fixes.map((fix, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[11px] font-medium text-emerald-700">
                  {i + 1}
                </span>
                {fix}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span>Model: {result.model}</span>
        <span>Prompt: {result.promptId ?? "—"}</span>
        <span>
          Tokens: {result.inputTokens} in / {result.outputTokens} out /{" "}
          {result.totalTokens} total
        </span>
      </div>
    </div>
  );
}
