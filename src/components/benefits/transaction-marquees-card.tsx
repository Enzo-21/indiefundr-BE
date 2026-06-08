"use client";

import {
  Bus,
  ChartSpline,
  CircleDollarSign,
  Coffee,
  CreditCard,
  HandCoins,
  House,
  MoreHorizontal,
  Plane,
  Repeat,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { Marquee } from "@/components/marquee";
import { MotionPreset } from "@/components/motion-preset";
import { Card, CardContent } from "@/components/ui/card";
import { benefitMarqueeRows, benefits, type BenefitTransactionIcon } from "@/lib/content";
import { cn } from "@/lib/utils";

const iconMap: Record<BenefitTransactionIcon, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  "circle-dollar-sign": CircleDollarSign,
  coffee: Coffee,
  "chart-spline": ChartSpline,
  bus: Bus,
  "hand-coins": HandCoins,
  house: House,
  plane: Plane,
  repeat: Repeat,
  "more-horizontal": MoreHorizontal,
  "credit-card": CreditCard,
};

export function TransactionMarqueesCard() {
  return (
    <Card className="bg-muted group/palette h-full gap-6 py-6 shadow-none ring-0 lg:col-span-2">
      <MotionPreset
        fade
        blur
        slide={{ direction: "down", offset: 15 }}
        delay={0.75}
        transition={{ duration: 0.5 }}
        className="relative flex min-h-68 flex-1 flex-col justify-center gap-6 overflow-hidden md:gap-10.5"
      >
        {benefitMarqueeRows.map((row, rowIndex) => (
          <Marquee
            key={rowIndex}
            pauseOnHover
            reverse={row.reverse}
            gap={0.625}
            duration={35 + rowIndex * 2}
            className="p-0"
          >
            {row.transactions.concat(row.transactions).map((tx, txIndex) => {
              const Icon = iconMap[tx.icon];
              return (
                <div
                  key={`${rowIndex}-${txIndex}`}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-full px-3.5 py-2",
                    tx.isBordered
                      ? "border-primary/40 border"
                      : "bg-card text-card-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9.5 place-content-center rounded-full [&>svg]:size-5",
                      tx.type === "debit"
                        ? "bg-destructive/20 text-destructive"
                        : "bg-green-600/20 text-green-600 dark:bg-green-400/20 dark:text-green-400"
                    )}
                  >
                    <Icon />
                  </span>
                  <div className="grid">
                    <span className="text-muted-foreground text-xs">{tx.title}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-base font-medium">
                        ${tx.amount.toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          tx.type === "debit"
                            ? "text-destructive"
                            : "text-green-600 dark:text-green-400"
                        )}
                      >
                        {tx.type === "debit" ? "-" : "+"}${tx.difference.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </Marquee>
        ))}
        <div className="from-muted pointer-events-none absolute inset-y-0 left-0 w-[15%] bg-linear-to-r from-20% to-transparent" />
        <div className="from-muted pointer-events-none absolute inset-y-0 right-0 w-[15%] bg-linear-to-l from-20% to-transparent" />
      </MotionPreset>

      <CardContent className="flex flex-col gap-4 px-6 md:items-center">
        <MotionPreset
          fade
          blur
          slide={{ direction: "down", offset: 15 }}
          delay={0.9}
          transition={{ duration: 0.5 }}
          className="text-xl font-semibold md:text-center md:text-2xl"
        >
          <h3>{benefits[1].title}</h3>
        </MotionPreset>
        <MotionPreset
          fade
          blur
          slide={{ direction: "down", offset: 15 }}
          delay={1.05}
          transition={{ duration: 0.5 }}
          className="text-muted-foreground text-base md:text-center md:text-lg"
        >
          <p>{benefits[1].description}</p>
        </MotionPreset>
      </CardContent>
    </Card>
  );
}
