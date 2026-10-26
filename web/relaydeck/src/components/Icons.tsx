import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export const LinkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />
  </svg>
);

export const ChartIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.5 13.5h11M4.5 11V8M7.5 11V5M10.5 11V7" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.5 4l4 4-4 4" />
  </svg>
);

export const ChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const PauseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 4.5v7M10 4.5v7" />
  </svg>
);

export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.5 4.2v7.6L11.8 8z" fill="currentColor" stroke="none" />
  </svg>
);

export const ArrowUpRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.5 10.5l5-5M6 5.5h4.5V10" />
  </svg>
);

export const DotsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="3.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

export const FilterIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 5h10M5 8h6M7 11h2" />
  </svg>
);

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable={false}>
      <rect width="28" height="28" rx="7" fill="#EDEDED" />
      <path
        d="M8.5 11h10.5M16 8l3 3-3 3M19.5 17H9M12 14l-3 3 3 3"
        fill="none"
        stroke="#0A0A0A"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
