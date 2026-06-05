"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/investments", label: "Investments" },
  { href: "/admin/treasury", label: "Treasury" },
  { href: "/admin/history", label: "History" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-4">
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        IndieFundr Admin
      </p>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === link.href || pathname.startsWith(`${link.href}/`)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
