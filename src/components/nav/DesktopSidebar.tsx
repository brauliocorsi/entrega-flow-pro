import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Truck, PanelLeftClose, PanelLeft, ChevronDown } from "lucide-react";
import { visibleItems, GROUP_LABEL, GROUP_ORDER, type Role, type NavItem } from "@/lib/nav-items";

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
  const groups = GROUP_ORDER.map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter(
    (x) => x.list.length > 0,
  );

  const [openConfig, setOpenConfig] = useState(false);

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
          className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto p-2">
        {groups.map(({ g, list }) => {
          const collapsibleGroup = g === "config" && !collapsed;
          const groupActive = list.some((i) => isActive(i.to));
          const show = !collapsibleGroup || openConfig || groupActive;

          return (
            <div key={g}>
              {!collapsed &&
                (collapsibleGroup ? (
                  <button
                    onClick={() => setOpenConfig((v) => !v)}
                    className="flex w-full items-center gap-1 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    {GROUP_LABEL[g]}
                    <ChevronDown
                      className={`ml-auto h-3.5 w-3.5 transition-transform ${show ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {GROUP_LABEL[g]}
                  </p>
                ))}
              {show && (
                <div className="space-y-1">
                  {list.map((item) => (
                    <SidebarLink
                      key={item.to}
                      item={item}
                      active={isActive(item.to)}
                      collapsed={collapsed}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      to={item.to}
      title={item.label}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}
