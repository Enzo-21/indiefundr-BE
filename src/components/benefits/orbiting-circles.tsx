"use client";

import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OrbitingCirclesProps {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  duration?: number;
  radius?: number;
  path?: boolean;
  speed?: number;
  startingAngle?: number;
}

export function OrbitingCircles({
  children,
  className,
  reverse = false,
  duration = 20,
  radius = 160,
  path = true,
  speed = 1,
  startingAngle = 0,
}: OrbitingCirclesProps) {
  const items = Children.toArray(children);
  const orbitDuration = duration / speed;

  return (
    <>
      {path && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          version="1.1"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle cx="50%" cy="50%" r={radius} fill="none" stroke="var(--border)" strokeWidth={2} />
        </svg>
      )}
      {items.map((child, index) => {
        const angle = (360 / items.length) * index + startingAngle;
        return (
          <div
            key={index}
            style={
              {
                "--duration": orbitDuration,
                "--radius": radius,
                "--angle": angle,
              } as React.CSSProperties
            }
            className={cn(
              "animate-orbit absolute flex transform-gpu items-center justify-center rounded-full",
              reverse && "[animation-direction:reverse]",
              className
            )}
          >
            {child}
          </div>
        );
      })}
    </>
  );
}
