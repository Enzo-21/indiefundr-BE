"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminThemeSwitch } from "@/components/admin/AdminThemeSwitch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatAdminPendingOrderBadgeCount } from "@/lib/admin/pendingOrderBadge";

const links = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Orders", showPendingCount: true },
  { href: "/admin/investments", label: "Investments" },
  { href: "/admin/treasury", label: "Treasury" },
  { href: "/admin/history", label: "History" },
];

export function AdminSidebar({
  pendingOrderCount = 0,
}: {
  pendingOrderCount?: number;
}) {
  const pathname = usePathname();
  const badgeLabel = formatAdminPendingOrderBadgeCount(pendingOrderCount);

  return (
    <nav className="flex h-full min-h-0 flex-col p-4">
      <div className="flex flex-col gap-1">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          IndieFundr Admin
        </p>
        {links.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          const showBadge =
            link.showPendingCount === true && pendingOrderCount > 0;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>{link.label}</span>
              {showBadge ? (
                <Badge
                  variant="destructive"
                  className="min-w-5 justify-center px-1.5"
                >
                  {badgeLabel}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto border-t pt-4">
        <AdminThemeSwitch />
      </div>
    </nav>
  );
}
