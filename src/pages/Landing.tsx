import { Link } from "react-router";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { usePwaInstall } from "@/hooks/use-pwa";
import { ThemeToggle } from "@/components/ThemeToggle";
import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Download,
  Lightbulb,
  ListChecks,
  ShieldCheck,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const examples = [
  { icon: Wrench, text: "My laptop is overheating." },
  { icon: Wifi, text: "My WiFi keeps disconnecting." },
  { icon: BatteryCharging, text: "My phone battery drains quickly." },
  { icon: Zap, text: "My computer is running slowly." },
];

const steps = [
  {
    title: "Describe the problem",
    body: "Type what's going wrong in one or two sentences. No forms, no jargon.",
  },
  {
    title: "AI analyzes it",
    body: "QuickFix AI identifies likely causes and narrows them down to the essentials.",
  },
  {
    title: "Get 5 practical fixes",
    body: "Concise, actionable steps you can try immediately — saved to your history.",
  },
];

const principles = [
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Your problems are stored in your account only. AI runs server-side — no keys in your browser, ever.",
  },
  {
    icon: ListChecks,
    title: "Concise by default",
    body: "Every answer is exactly three likely causes and five practical fixes. No essays, no chat loops.",
  },
  {
    icon: Lightbulb,
    title: "Honest about limits",
    body: "General suggestions only. When a problem needs a professional, QuickFix says so.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const { canInstall, install } = usePwaInstall();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="QuickFix AI" className="size-8 rounded-lg" />
            <span className="text-[15px] font-semibold tracking-tight">
              QuickFix AI
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            {!isLoading && isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/dashboard">
                  Open dashboard
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">
                    Get started
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-dotted border-b border-border/60">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              AI-powered quick fixes · installable app
            </span>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              Everyday problems,{" "}
              <span className="text-muted-foreground">solved in three steps.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              Describe what's wrong. QuickFix AI returns a short summary, three
              likely causes, and five practical fixes — in seconds.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/auth">
                  Try QuickFix AI
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              {canInstall ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => void install()}
                >
                  <Download className="mr-2 size-4" />
                  Install QuickFix
                </Button>
              ) : (
                <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                  <a href="#how-to-install">
                    <Download className="mr-2 size-4" />
                    How to install
                  </a>
                </Button>
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free while in beta · no credit card · email sign-in
            </p>
          </motion.div>

          {/* Example problems */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {examples.map((example) => (
              <div
                key={example.text}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm transition-colors hover:border-foreground/20"
              >
                <example.icon className="size-4 shrink-0 text-emerald-600" />
                <span className="text-foreground/80">{example.text}</span>
                <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground/50" />
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            One problem in. One clear answer out.
          </h2>
          <p className="mt-3 text-muted-foreground">
            No chatbot, no back-and-forth. A single request gets you a complete,
            focused diagnosis.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
                {index + 1}
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Principles */}
      <section className="border-y border-border/60 bg-sidebar">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 md:grid-cols-3">
            {principles.map((item) => (
              <div key={item.title}>
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <item.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample output */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              What an answer looks like
            </h2>
            <p className="mt-4 max-w-md leading-7 text-muted-foreground">
              Every Quick Fix follows the same tight structure, so you can scan
              it in ten seconds and get on with your day.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Short summary of the likely situation",
                "Exactly three likely causes",
                "Exactly five practical fixes",
                "Saved to your history with model + prompt traceability",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span className="text-foreground/85">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Result preview card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_oklch(0_0_0/0.04)]"
          >
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <Wrench className="size-3.5 text-emerald-600" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AI Quick Fix
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Problem:</span>{" "}
              My laptop is overheating.
            </p>
            <p className="mt-3 text-sm leading-6 text-foreground/85">
              Your laptop is likely overheating due to blocked airflow or heavy
              background load.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Likely causes
                </p>
                <ol className="mt-2 space-y-1.5 text-sm text-foreground/85">
                  <li>1. Dust buildup in vents</li>
                  <li>2. Heavy background apps</li>
                  <li>3. Soft surfaces block airflow</li>
                </ol>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recommended fixes
                </p>
                <ol className="mt-2 space-y-1.5 text-sm text-foreground/85">
                  <li>1. Clean vents with compressed air</li>
                  <li>2. Close unused apps</li>
                  <li>3. Use on a hard, flat surface</li>
                  <li>4. Update drivers and firmware</li>
                  <li>5. Service fans if noise persists</li>
                </ol>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Install guide */}
      <section id="how-to-install" className="border-t border-border/60 bg-sidebar">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Install QuickFix AI on your device
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              It's a Progressive Web App — no app store needed.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "iPhone / iPad",
                body: "Open in Safari → tap the Share icon → “Add to Home Screen”.",
              },
              {
                title: "Android / Chrome",
                body: "Browser menu ⋮ → “Install app” or “Add to Home screen”.",
              },
              {
                title: "Desktop",
                body: "Chrome/Edge: install icon in the address bar, or menu → Install.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <h3 className="text-sm font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            Fix it in the next minute.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Sign in with your email and get your first Quick Fix right away.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link to="/auth">
                Get started — it's quick
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-10 text-xs leading-5 text-muted-foreground">
            QuickFix AI provides general suggestions only. It is not a doctor,
            lawyer, financial advisor, or emergency service. For urgent or
            dangerous situations, contact the appropriate professional or
            emergency number.
          </p>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <img src={logo} alt="" className="size-4 rounded" />
            QuickFix AI
          </span>
          <span>
            © {new Date().getFullYear()} · Practical fixes for everyday problems
            <span className="ml-2 opacity-40">· UI-3C5F</span>
</span>
        </div>
      </footer>
    </div>
  );
}
