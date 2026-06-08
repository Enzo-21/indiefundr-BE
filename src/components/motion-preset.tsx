"use client";

import type { ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
} from "framer-motion";
import { cn } from "@/lib/utils";

type SlideDirection = "up" | "down" | "left" | "right";

interface MotionPresetProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children?: ReactNode;
  fade?: boolean;
  blur?: boolean;
  slide?: { direction?: SlideDirection; offset?: number };
  delay?: number;
  inViewOnce?: boolean;
  transition?: Transition;
}

const directionMap: Record<SlideDirection, { x?: number; y?: number }> = {
  up: { y: 50 },
  down: { y: -50 },
  left: { x: 50 },
  right: { x: -50 },
};

export function MotionPreset({
  children,
  className,
  fade = false,
  blur = false,
  slide,
  delay = 0,
  inViewOnce = true,
  transition,
  ...props
}: MotionPresetProps) {
  const shouldReduceMotion = useReducedMotion();
  const dir = slide?.direction ?? "up";
  const axis = directionMap[dir];
  const slideOffset = slide?.offset ?? 50;
  const initialX = slide && axis.x !== undefined ? (axis.x / Math.abs(axis.x)) * slideOffset : 0;
  const initialY = slide && axis.y !== undefined ? (axis.y / Math.abs(axis.y)) * slideOffset : 0;

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      initial={{
        opacity: fade ? 0 : 1,
        x: slide ? initialX : 0,
        y: slide ? initialY : 0,
        filter: blur ? "blur(10px)" : "none",
      }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        filter: "none",
      }}
      viewport={{ once: inViewOnce, margin: "-8% 0px" }}
      transition={{
        duration: 0.5,
        delay,
        ease: "easeOut",
        ...transition,
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
