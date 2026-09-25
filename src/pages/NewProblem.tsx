import { AppShell, USER_NAV } from "@/pages/Dashboard";
import { NewProblemForm } from "@/components/problems";

export default function NewProblem() {
  return (
    <AppShell navItems={USER_NAV}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">New problem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One clear description is all it takes.
        </p>
        <div className="mt-6">
          <NewProblemForm />
        </div>
      </div>
    </AppShell>
  );
}
