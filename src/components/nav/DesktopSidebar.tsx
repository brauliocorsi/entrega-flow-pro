import { Link } from "@tanstack/react-router";
import { Truck, PanelLeftClose, PanelLeft } from "lucide-react";
import { visibleItems, GROUP_LABEL, type Role, type NavItem } from "@/lib/nav-items";

export function DesktopSidebar({
  role,
  isActive,
  collapsed,
  onToggle,
}: {
  role: Role;
  isActive: (p: string) => boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const items = visibleItems(role);
  const groups = (["principal", "operacao", "comercial", "acessos", "dados"] as NavItem["group"][])
    .map((g) => ({ g, list: items.filter((i) => i.group === g) }))
    .filter((x) => x.list.length > 0);

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <Truck className="h-4 w-4" />
        </span>
        {!collapsed && <span className="truncate font-bold tracking-tight">UP Agenda</span>}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu" : "Colapsar menu"}
          className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {groups.map(({ g, list }) => (
          <div key={g}>
            {!collapsed && (
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {GROUP_LABEL[g]}
              </p>
            )}
            <div className="space-y-1">
              {list.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(item.to)
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
