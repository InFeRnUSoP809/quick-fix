import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createProblem,
  deleteProblem,
  getProblemWithResult,
  listMyProblems,
  runAiPipeline,
  type MyProblemRow,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Trash2,
} from "lucide-react";

export const MIN_PROBLEM_LEN = 10;
export const FALLBACK_MAX_PROBLEM_LEN = 1000;

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

/* ------------------------------------------------------------------ */
/* New problem form: input -> loading -> result dialog                 */
/* ------------------------------------------------------------------ */

export function NewProblemForm({
  maxLength = FALLBACK_MAX_PROBLEM_LEN,
}: {
  maxLength?: number;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const charCount = text.length;
  const canSubmit =
    text.trim().length >= MIN_PROBLEM_LEN && charCount <= maxLength && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // 1) Create the problem row (RLS: owner-only insert).
      const problemId = await createProblem(text.trim());
      // 2) Run the AI pipeline (Edge Function: budget + DeepSeek + persist).
      const outcome = await runAiPipeline(problemId, text.trim());
      if (outcome.ok) {
        toast.success("Quick Fix ready");
        setSelectedId(problemId);
        setText("");
      } else {
        toast.error(outcome.error ?? "Something went wrong.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
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
                charCount > maxLength - 100 ? "text-amber-600" : "text-muted-foreground",
              )}
            >
              {charCount.toLocaleString()} / {maxLength.toLocaleString()} characters
            </span>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2 sm:min-w-44">
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

      <ProblemDetailDialog problemId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* History row                                                         */
/* ------------------------------------------------------------------ */

export function HistoryRowCard({
  row,
  onOpen,
  onDelete,
  deleting,
}: {
  row: MyProblemRow;
  onOpen: () => void;
  onDelete?: () => void;
  deleting?: boolean;
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
    <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/20">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {statusIcon}
        <span className="min-w-0 flex-1 truncate text-sm">{row.problem_text}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {timeLabel(row.created_at)}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
          {row.status}
        </span>
      </button>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete problem"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail dialog                                                       */
/* ------------------------------------------------------------------ */

export function ProblemDetailDialog({
  problemId,
  onClose,
}: {
  problemId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof getProblemWithResult>
  > | undefined>(undefined);

  const fetchDetail = useCallback(async () => {
    if (!problemId) return;
    setDetail(undefined);
    try {
      setDetail(await getProblemWithResult(problemId));
    } catch {
      setDetail(null);
    }
  }, [problemId]);

  useEffect(() => {
    if (problemId) void fetchDetail();
  }, [problemId, fetchDetail]);

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
          <p className="py-6 text-sm text-muted-foreground">Problem not found.</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-base leading-6">
                {detail.problem_text}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 text-xs">
                <Clock className="size-3" />
                {timeLabel(detail.created_at)} ·{" "}
                {detail.status === "completed"
                  ? "Completed"
                  : detail.status === "failed"
                    ? "Failed"
                    : "Processing"}
              </DialogDescription>
            </DialogHeader>

            {detail.result ? (
              detail.result.error_message ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {detail.result.error_message}
                </div>
              ) : detail.result.summary ? (
                <ResultBody
                  result={{
                    summary: detail.result.summary,
                    causes: detail.result.causes,
                    fixes: detail.result.fixes,
                    model: detail.result.model,
                    promptLabel:
                      detail.result.prompt_version != null
                        ? `v${detail.result.prompt_version}`
                        : null,
                    tokens: {
                      input: detail.result.input_tokens,
                      output: detail.result.output_tokens,
                      total: detail.result.total_tokens,
                    },
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI result is attached to this problem yet.
                </p>
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

export function ResultBody({
  result,
}: {
  result: {
    summary: string;
    causes: string[];
    fixes: string[];
    model: string;
    promptLabel: string | null;
    tokens: { input: number; output: number; total: number };
  };
}) {
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
        <span>Prompt: {result.promptLabel ?? "—"}</span>
        <span>
          Tokens: {result.tokens.input} in / {result.tokens.output} out /{" "}
          {result.tokens.total} total
        </span>
      </div>
    </div>
  );
}
