"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";

type FooterTextHoverEffectProps = {
  text: string;
  duration?: number;
};

const textClassName =
  "fill-transparent font-[helvetica] text-5xl font-bold sm:text-6xl md:text-7xl";

export function FooterTextHoverEffect({ text, duration = 0 }: FooterTextHoverEffectProps) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [maskCenter, setMaskCenter] = useState({ cx: "50%", cy: "50%" });

  const textGradientId = `textGradient-${uid}`;
  const revealMaskId = `revealMask-${uid}`;
  const textMaskId = `textMask-${uid}`;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || cursor.x === null || cursor.y === null) return;

    const rect = svg.getBoundingClientRect();
    const cx = ((cursor.x - rect.left) / rect.width) * 100;
    const cy = ((cursor.y - rect.top) / rect.height) * 100;
    setMaskCenter({ cx: `${cx}%`, cy: `${cy}%` });
  }, [cursor]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 480 100"
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      className="select-none"
      aria-hidden
    >
      <defs>
        <linearGradient id={textGradientId} gradientUnits="userSpaceOnUse" cx="50%" cy="50%" r="25%">
          {hovered && (
            <>
              <stop offset="0%" stopColor="currentColor" className="text-amber-600 dark:text-amber-400" />
              <stop offset="25%" stopColor="var(--destructive)" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="75%" stopColor="currentColor" className="text-sky-600 dark:text-sky-400" />
              <stop offset="100%" stopColor="currentColor" className="text-green-600 dark:text-green-400" />
            </>
          )}
        </linearGradient>

        <motion.radialGradient
          id={revealMaskId}
          gradientUnits="userSpaceOnUse"
          r="20%"
          initial={{ cx: "50%", cy: "50%" }}
          animate={maskCenter}
          transition={{ duration, ease: "easeOut" }}
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </motion.radialGradient>

        <mask id={textMaskId}>
          <rect x="0" y="0" width="100%" height="100%" fill={`url(#${revealMaskId})`} />
        </mask>
      </defs>

      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth="0.5"
        className={`stroke-foreground/20 ${textClassName}`}
        style={{ opacity: hovered ? 0.7 : 0 }}
      >
        {text}
      </text>

      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth="0.5"
        className={`stroke-foreground/20 ${textClassName}`}
        initial={{ strokeDashoffset: 1000, strokeDasharray: 1000 }}
        whileInView={{ strokeDashoffset: 0, strokeDasharray: 1000 }}
        viewport={{ once: true }}
        transition={{ duration: 4, ease: "easeInOut" }}
      >
        {text}
      </motion.text>

      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        stroke={`url(#${textGradientId})`}
        strokeWidth="0.5"
        mask={`url(#${textMaskId})`}
        className={textClassName}
      >
        {text}
      </text>
    </svg>
  );
}
