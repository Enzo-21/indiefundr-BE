"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { NavGetStartedButton } from "@/components/swipe-buttons";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SwipeLogo } from "@/components/swipe-logo";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMarketingContent } from "@/components/marketing/marketing-content-provider";
import { cn } from "@/lib/utils";

export function Header() {
  const { navigationData } = useMarketingContent();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 56);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const featuresNav = navigationData.find((item) => item.title === "Features");

  return (
    <header className="sticky top-0 z-50 flex h-20 w-full items-end justify-center px-4 sm:px-6 lg:px-8">
      <div
        className={cn(
          "border-background relative flex h-14 w-full items-center justify-between gap-4 rounded-full border px-3 transition-all duration-700",
          "before:absolute before:inset-0 before:-z-1 before:rounded-full before:bg-linear-to-b before:from-white/50 before:to-white before:backdrop-blur-[6px] dark:before:from-black/50 dark:before:to-black",
          scrolled ? "max-w-4xl" : "max-w-7xl"
        )}
      >
        <Link href="#home" id="home" className="flex items-center gap-3 max-sm:[&_span]:text-xl">
          <SwipeLogo />
          <span className="text-2xl font-semibold">IndieFundr</span>
        </Link>

        <NavigationMenu className="max-lg:hidden">
          <NavigationMenuList className="flex-wrap gap-0">
            {featuresNav && "items" in featuresNav && (
              <NavigationMenuItem>
                <NavigationMenuTrigger>Features</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-140 gap-3 p-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-muted-foreground text-xs font-medium uppercase">Core Features</p>
                      {featuresNav.items?.map((item) => (
                        <NavigationMenuLink
                          key={item.href}
                          href={item.href}
                          className="hover:bg-accent block space-y-1 rounded-md p-3 no-underline outline-hidden transition-colors"
                        >
                          <div className="text-sm font-medium">{item.title}</div>
                          <p className="text-muted-foreground text-sm">{item.description}</p>
                        </NavigationMenuLink>
                      ))}
                    </div>
                    {featuresNav.imageSection && (
                      <Link
                        href={featuresNav.imageSection.href}
                        className="bg-muted flex flex-col justify-end rounded-lg p-4 no-underline"
                      >
                        <p className="text-sm font-medium">{featuresNav.imageSection.title}</p>
                        <p className="text-muted-foreground text-sm">
                          {featuresNav.imageSection.description}
                        </p>
                      </Link>
                    )}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            )}
            {navigationData
              .filter((item) => item.title !== "Features")
              .map((item) => (
                <NavigationMenuItem key={item.title}>
                  {"external" in item && item.external ? (
                    <NavigationMenuLink
                      href={item.href}
                      className={navigationMenuTriggerStyle()}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.title}
                    </NavigationMenuLink>
                  ) : (
                    <NavigationMenuLink href={item.href} className={navigationMenuTriggerStyle()}>
                      {item.title}
                    </NavigationMenuLink>
                  )}
                </NavigationMenuItem>
              ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NavGetStartedButton className="hidden sm:inline-flex" />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-80 gap-0">
              <SheetHeader className="pr-12">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-2">
                {navigationData.map((item) =>
                  "items" in item && item.items ? (
                    <div key={item.title} className="space-y-3">
                      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        {item.title}
                      </p>
                      <div className="flex flex-col gap-3">
                        {item.items.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className="text-foreground block text-base font-medium hover:text-primary"
                            onClick={() => setOpen(false)}
                          >
                            {sub.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : "external" in item && item.external ? (
                    <a
                      key={item.title}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-medium"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="text-base font-medium"
                      onClick={() => setOpen(false)}
                    >
                      {item.title}
                    </Link>
                  )
                )}
              </nav>
              <SheetFooter className="border-border border-t px-6">
                <NavGetStartedButton
                  className="inline-flex w-full justify-center"
                  onClick={() => setOpen(false)}
                />
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
