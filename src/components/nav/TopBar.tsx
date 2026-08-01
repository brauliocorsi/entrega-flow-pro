import { Link } from "@tanstack/react-router";
import { LogOut, Truck, ChevronLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Breakpoint } from "@/hooks/use-breakpoint";

export function TopBar({
  title,
  email,
  role,
  bp,
  onSignOut,
  canGoBack,
}: {
  title: string;
  email: string;
  role?: string | null;
  bp: Breakpoint;
  onSignOut: () => void;
  canGoBack: boolean;
}) {
  const router = useRouter();
  const initials = (email || "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        {bp === "mobile" ? (
          canGoBack ? (
            <button
              onClick={() => router.history.back()}
              aria-label="Voltar"
              className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Truck className="h-4 w-4" />
            </span>
          )
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-muted-foreground">{title}</p>
        </div>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Conta"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="truncate font-normal">
              <span className="block truncate text-sm font-medium">{email}</span>
              <span className="block text-xs text-muted-foreground">{role ?? "—"}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/rotas">Início</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {bp === "desktop" ? (
          <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sair" className="hidden lg:inline-flex">
            <LogOut className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
