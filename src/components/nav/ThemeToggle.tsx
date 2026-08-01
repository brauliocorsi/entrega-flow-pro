import { Moon, Sun, Laptop } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolved } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="Mudar tema">
          {resolved === "dark" ? <Moon className="h-[1.1rem] w-[1.1rem]" /> : <Sun className="h-[1.1rem] w-[1.1rem]" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => setTheme("light")} className={theme === "light" ? "font-semibold" : ""}>
          <Sun className="mr-2 h-4 w-4" /> Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className={theme === "dark" ? "font-semibold" : ""}>
          <Moon className="mr-2 h-4 w-4" /> Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className={theme === "system" ? "font-semibold" : ""}>
          <Laptop className="mr-2 h-4 w-4" /> Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
