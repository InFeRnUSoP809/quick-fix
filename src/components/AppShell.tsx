import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { LogOut, Menu, Wrench } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

/**
 * Shared authenticated shell with sidebar (desktop) / sheet (mobile).
 * Used by both the user dashboard and the admin console.
 */
export function AppShell({
  navItems,
  children,
  badge,
}: {
  navItems: NavItem[];
  children: React.ReactNode;
  badge?: string;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )
          }
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <Link to="/" className="flex items-center gap-2.5 px-6 py-5">
      <img src={logo} alt="QuickFix AI" className="size-8 rounded-lg" />
      <span className="text-[15px] font-semibold tracking-tight">
        QuickFix AI
      </span>
      {badge && (
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        {brand}
        {nav}
        <div className="mt-auto p-4">
          <p className="px-3 text-[11px] leading-4 text-muted-foreground">
            QuickFix AI suggests practical steps.
            <br />
            For emergencies, call your local services.
          </p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-col lg:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="size-5" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {brand}
              {nav}
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          <InstallAppButton />
          <ThemeToggle />

          {user?.role === "admin" && (
            <span className="hidden rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
              {user.email}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate sm:inline">
                  {user?.name ?? "Account"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                {user?.email ?? "Signed in"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                <LogOut className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border px-6 py-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="size-3" />
            QuickFix AI · general suggestions only — not a professional service
          </span>
        </footer>
      </div>
    </div>
  );
}
