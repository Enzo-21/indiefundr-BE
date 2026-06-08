import { cn } from "@/lib/utils";

export function SwipeLogo({ className }: { className?: string }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 328 329"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-9 shrink-0", className)}
      aria-hidden
    >
      <rect y="0.5" width="328" height="328" rx="164" fill="var(--primary)" />
      <path
        d="M165.018 72.3008V132.771C165.018 152.653 148.9 168.771 129.018 168.771H70.2288"
        stroke="white"
        strokeWidth="20"
      />
      <path
        d="M166.627 265.241L166.627 204.771C166.627 184.889 182.744 168.771 202.627 168.771L261.416 168.771"
        stroke="white"
        strokeWidth="20"
      />
      <line
        x1="251.018"
        y1="92.3008"
        x2="210.018"
        y2="132.771"
        stroke="white"
        strokeWidth="20"
      />
      <line
        x1="80.2288"
        y1="245.241"
        x2="121.228"
        y2="204.771"
        stroke="white"
        strokeWidth="20"
      />
      <line
        x1="78.2288"
        y1="92.3008"
        x2="118.228"
        y2="52.3008"
        stroke="white"
        strokeWidth="20"
      />
      <line
        x1="249.416"
        y1="245.241"
        x2="209.416"
        y2="205.241"
        stroke="white"
        strokeWidth="20"
      />
    </svg>
  );
}

export function SwipeLogoSmall({ className }: { className?: string }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-9 shrink-0", className)}
      aria-hidden
    >
      <rect width="128" height="128" rx="64" fill="var(--primary)" />
      <path
        d="M64.3266 103.152L64.3266 78.6106C64.3266 70.5416 70.8678 64.0003 78.9368 64.0003L102.796 64.0004"
        stroke="white"
        strokeWidth="8"
      />
      <path
        d="M63.6734 24.8486V49.3899C63.6734 57.4589 57.1322 64.0001 49.0632 64.0001H25.2041"
        stroke="white"
        strokeWidth="8"
      />
    </svg>
  );
}

export function SpinBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6 animate-spin", className)}
      style={{ animationDuration: "2s" }}
      aria-hidden
    >
      <path
        d="M63.6734 24.8486V49.3899C63.6734 57.4589 57.1322 64.0001 49.0632 64.0001H25.2041"
        stroke="currentColor"
        strokeWidth="8.11681"
      />
      <path
        d="M64.3266 103.152L64.3266 78.6106C64.3266 70.5416 70.8678 64.0003 78.9368 64.0003L102.796 64.0004"
        stroke="currentColor"
        strokeWidth="8.11681"
      />
      <line x1="93.3468" y1="35.6108" x2="76.555" y2="52.205" stroke="currentColor" strokeWidth="8.11681" />
      <line x1="51.7697" y1="77.0624" x2="34.9778" y2="93.6567" stroke="currentColor" strokeWidth="8.11681" />
      <line x1="50.9584" y1="51.3189" x2="34.2651" y2="34.6256" stroke="currentColor" strokeWidth="8.11681" />
      <line x1="93.1625" y1="93.6397" x2="76.4692" y2="76.9464" stroke="currentColor" strokeWidth="8.11681" />
    </svg>
  );
}
