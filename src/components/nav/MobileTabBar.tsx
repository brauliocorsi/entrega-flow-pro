import { Link } from "@tanstack/react-router";
import { Plus, MoreHorizontal } from "lucide-react";
import { visibleItems, type Role } from "@/lib/nav-items";

export function MobileTabBar({
  role,
  isActive,
  onMore,
  moreActive,
}: {
  role: Role;
  isActive: (p: string) => boolean;
  onMore: () => void;
  moreActive: boolean;
}) {
  const items = visibleItems(role).filter((i) => i.group === "principal" && i.to !== "/agendar");
  const tabs = items.slice(0, 3);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="relative mx-auto flex h-16 max-w-lg items-stretch justify-around px-2">
        {tabs.slice(0, 2).map((item) => (
          <Tab key={item.to} to={item.to} label={item.short ?? item.label} Icon={item.icon} active={isActive(item.to)} />
        ))}

        <div className="flex w-20 shrink-0 items-start justify-center">
          <Link
            to="/agendar"
            aria-label="Agendar entrega"
            className="-mt-6 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </Link>
        </div>

        {tabs.slice(2).map((item) => (
          <Tab key={item.to} to={item.to} label={item.short ?? item.label} Icon={item.icon} active={isActive(item.to)} />
        ))}

        <button
          onClick={onMore}
          className={`flex min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors ${
            moreActive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          Mais
        </button>
      </div>
    </nav>
  );
}

function Tab({
  to,
  label,
  Icon,
  active,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-primary/10" : ""}`}>
        <Icon className="h-5 w-5" />
      </span>
      {label}
    </Link>
  );
}
