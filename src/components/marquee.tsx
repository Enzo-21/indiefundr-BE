import { cn } from "@/lib/utils";

interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  duration?: number;
  delay?: number;
  gap?: number;
  pauseOnHover?: boolean;
  repeat?: number;
  reverse?: boolean;
  vertical?: boolean;
}

export function Marquee({
  children,
  className,
  duration = 40,
  delay = 0,
  gap = 1,
  pauseOnHover = false,
  repeat = 4,
  reverse = false,
  vertical = false,
  ...props
}: MarqueeProps) {
  return (
    <div
      {...(pauseOnHover ? { "data-marquee": "" } : {})}
      style={
        {
          "--marquee-duration": `${duration}s`,
          "--marquee-delay": `${delay}s`,
          "--marquee-gap": `${gap}rem`,
        } as React.CSSProperties
      }
      className={cn(
        "group flex gap-(--marquee-gap) overflow-hidden p-3",
        vertical ? "flex-col" : "flex-row",
        className
      )}
      {...props}
    >
      {Array.from({ length: repeat }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "marquee-track flex shrink-0 justify-around gap-(--marquee-gap) [animation-delay:var(--marquee-delay)]",
            vertical
              ? "animate-marquee-vertical flex-col"
              : "animate-marquee-horizontal flex-row",
            reverse && "marquee-track-reverse"
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
