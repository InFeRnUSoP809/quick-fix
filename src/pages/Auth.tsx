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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import logo from "@/assets/logo.svg";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const validate = (): string | null => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password.length > 100) return "Password is too long (max 100 characters).";
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (mode === "signUp") {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      navigate(redirect);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Supabase error mapping → friendly, honest messages.
      if (/already registered/i.test(raw)) {
        setError("An account with this email already exists. Try signing in.");
      } else if (/invalid login|email not confirmed/i.test(raw)) {
        setError("Incorrect email or password.");
      } else if (/rate limit/i.test(raw)) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else {
        setError(raw || "Sign-in failed. Please check your details and try again.");
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Theme toggle */}
      <div className="flex justify-end px-4 pt-4">
        <ThemeToggle />
      </div>

      {/* Auth Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <Card className="w-full max-w-sm border shadow-md">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <img
                src={logo}
                alt="QuickFix AI"
                width={64}
                height={64}
                className="rounded-lg mb-4 mt-4 cursor-pointer"
                onClick={() => navigate("/")}
              />
            </div>
            <CardTitle className="text-xl">
              {mode === "signUp" ? "Create your account" : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {mode === "signUp"
                ? "Sign up with your email and a password."
                : "Sign in with your email and password."}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <Tabs
                value={mode}
                onValueChange={(v) => {
                  setMode(v as "signIn" | "signUp");
                  setError(null);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signIn">Sign in</TabsTrigger>
                  <TabsTrigger value="signUp">Sign up</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  placeholder="name@example.com"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    placeholder={mode === "signUp" ? "At least 8 characters" : "Your password"}
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                    className="pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                    minLength={8}
                    maxLength={100}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                {mode === "signUp" ? "Create account" : "Sign in"}
                {!isLoading && <ArrowRight className="ml-1 size-4" />}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
