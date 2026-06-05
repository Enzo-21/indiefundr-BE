"use client";

import { investmentRowDomId } from "@/lib/admin/investmentTableIds";
import type { InvestmentDisplayKind } from "@/services/admin/investmentAdminTypes";

const HIGHLIGHT_CLASS = "investment-row-scroll-highlight";
const HIGHLIGHT_MS = 2400;

/** Smooth-scroll to a table row and flash its background so it is easy to spot. */
export function scrollToInvestmentRow(
  investmentId: string,
  displayKind: InvestmentDisplayKind = "subscription"
) {
  const target = document.getElementById(
    investmentRowDomId(investmentId, displayKind)
  );
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove(HIGHLIGHT_CLASS);
  void target.offsetWidth;
  target.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => {
    target.classList.remove(HIGHLIGHT_CLASS);
  }, HIGHLIGHT_MS);
}
