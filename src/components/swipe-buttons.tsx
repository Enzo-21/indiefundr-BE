import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getAppOpenUrl } from "@/lib/marketing/appUrl";
import { cn } from "@/lib/utils";

const primaryClasses =
  "group relative inline-flex h-10 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full border-0 bg-primary px-6 text-base font-medium text-primary-foreground shadow-[inset_0_-3px_6px_0px_rgba(255,255,255,0.90)] ring-2 ring-primary/60 duration-500 hover:shadow-[inset_0_-3px_6px_-2px_rgba(255,255,255,0.90)] active:translate-y-0 dark:shadow-[inset_0_-3px_6px_0px_rgba(0,0,0,0.60)] dark:hover:shadow-[inset_0_-3px_6px_-2px_rgba(0,0,0,0.60)]";

const secondaryClasses =
  "group relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border-0 bg-primary/10 px-6 text-base font-medium text-primary shadow-[inset_0_-3px_6px_0px_rgba(0,180,255,0.30)] ring-2 ring-primary/70 duration-500 hover:bg-primary/10 hover:shadow-[inset_0_-3px_6px_-2px_rgba(0,180,255,0.10)]";

export function PrimarySwipeButton({
  href,
  requestHost,
  children,
  className,
}: {
  href?: string;
  requestHost?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const resolvedHref = href ?? getAppOpenUrl({ host: requestHost });
  return (
    <Link href={resolvedHref} className={cn(primaryClasses, className)}>
      {children}
      <ChevronRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export function SecondarySwipeButton({
  href,
  children,
  className,
  onClick,
  ...props
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className">) {
  const classes = cn(secondaryClasses, className);

  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick} {...props}>
      {children}
    </button>
  );
}

/** Navbar pill — smooth-scrolls to the landing CTA section. */
export function NavGetStartedButton({
  className,
  onClick,
}: {
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <a href="#cta" className={cn(primaryClasses, className)} onClick={onClick}>
      Get started
    </a>
  );
}
