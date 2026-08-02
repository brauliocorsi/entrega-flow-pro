import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { visibleItems, GROUP_LABEL, GROUP_ORDER, type Role } from "@/lib/nav-items";

export function MoreSheet({
  open,
  onOpenChange,
  role,
  isActive,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: Role;
  isActive: (p: string) => boolean;
  onSignOut: () => void;
}) {
  const items = visibleItems(role);
  const groups = GROUP_ORDER.map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter(
    (x) => x.list.length > 0,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader className="pb-0">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-2">
          {groups.map(({ g, list }) => (
            <div key={g}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{GROUP_LABEL[g]}</p>
              <div className="grid grid-cols-2 gap-2">
                {list.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => onOpenChange(false)}
                    className={`flex min-h-[64px] flex-col justify-center gap-1.5 rounded-2xl border p-3 text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-card-foreground hover:bg-accent"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => {
              onOpenChange(false);
              onSignOut();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 p-3 text-sm font-medium text-destructive"
          >
            <LogOut className="h-4 w-4" /> Terminar sessão
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
