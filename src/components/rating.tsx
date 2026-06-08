import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingProps {
  value: number;
  size?: number;
  className?: string;
}

export function Rating({ value, size = 22, className }: RatingProps) {
  const stars = Array.from({ length: 5 });

  return (
    <div data-slot="rating" className={cn("flex gap-1", className)}>
      {stars.map((_, index) => {
        const fill = Math.min(Math.max(value - index, 0), 1);
        return (
          <span key={index} data-slot="rating-item" className="relative inline-flex">
            <Star
              data-slot="rating-star"
              size={size}
              className="fill-muted text-muted"
            />
            <Star
              data-slot="rating-star"
              size={size}
              className="absolute inset-0 fill-yellow-400 text-yellow-400"
              style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }}
            />
          </span>
        );
      })}
      <span className="sr-only">{value} out of 5 stars</span>
    </div>
  );
}
