import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function baseProps(size = 18) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function HomeIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function UserIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function HistoryIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function SettingsIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
      <path d="m19.4 15 .7 1.2-1.5 2.6-1.4-.2a7.7 7.7 0 0 1-1.7 1l-.5 1.4h-3l-.5-1.4a7.7 7.7 0 0 1-1.7-1l-1.4.2-1.5-2.6.7-1.2a7.8 7.8 0 0 1 0-2l-.7-1.2 1.5-2.6 1.4.2a7.7 7.7 0 0 1 1.7-1l.5-1.4h3l.5 1.4a7.7 7.7 0 0 1 1.7 1l1.4-.2 1.5 2.6-.7 1.2a7.8 7.8 0 0 1 0 2Z" />
    </svg>
  );
}

export function LogoutIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function SunIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}

export function MoonIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M20 15.5A8.5 8.5 0 1 1 8.5 4a7 7 0 0 0 11.5 11.5Z" />
    </svg>
  );
}

export function CrownIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function LockIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function BoltIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M13 2 5 14h6l-1 8 8-12h-6l1-8Z" />
    </svg>
  );
}

export function FileIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6M9 17h6M9 9h2" />
    </svg>
  );
}

export function InfoIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7h.01" />
    </svg>
  );
}

export function ShieldIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M12 3 5 6v5c0 4.6 2.8 7.8 7 10 4.2-2.2 7-5.4 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.7 1.7 3.8-4.2" />
    </svg>
  );
}

export function CameraIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1.3-2h6.4l1.3 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

export function MicIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function MonitorIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

export function AlertIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function CreditCardIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h3" />
    </svg>
  );
}

export function GiftIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 22V7" />
      <path d="M12 7H8.5a2.5 2.5 0 1 1 0-5c2.2 0 3.5 2.2 3.5 5Z" />
      <path d="M12 7h3.5a2.5 2.5 0 1 0 0-5C13.3 2 12 4.2 12 7Z" />
    </svg>
  );
}

export function BellIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function ChartIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M4 19V5" />
      <path d="M10 19v-8" />
      <path d="M16 19v-4" />
      <path d="M22 19H2" />
    </svg>
  );
}

export function SparklesIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" />
      <path d="m19 2 .8 1.7L21.5 4.5l-1.7.8L19 7l-.8-1.7-1.7-.8 1.7-.8L19 2Z" />
      <path d="m5 15 .9 1.9L8 17.8l-2.1.9L5 21l-.9-2.3L2 17.8l2.1-.9L5 15Z" />
    </svg>
  );
}

export function TargetIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

export function ArrowUpRightIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function ShareIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.7 10.8 6.6-3.6" />
      <path d="m8.7 13.2 6.6 3.6" />
    </svg>
  );
}

export function PlayIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m8 6 10 6-10 6V6Z" />
    </svg>
  );
}

export function ClockIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function FolderIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function PaletteIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10Z" />
      <path d="M8 10h.01M7 14h.01M12 7h.01M16 10h.01" />
    </svg>
  );
}

export function TrashIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M4 7h16" />
      <path d="M9 3h6l1 4H8l1-4Z" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function FeedbackIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 2.5Z" />
      <path d="M9 9h6" />
      <path d="M9 13h4" />
    </svg>
  );
}

export function BuildingIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9h1M9 13h1M9 17h1" />
    </svg>
  );
}

export function UsersIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function DownloadIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function UploadIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function KeyIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

export function LayersIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="m12 2 10 6.5v7L12 22 2 15.5v-7L12 2Z" />
      <path d="m12 22 10-6.5" />
      <path d="M12 22V15.5" />
      <path d="m2 15.5 10-6.5 10 6.5" />
      <path d="M12 8.5 2 15" />
    </svg>
  );
}

export function PlusIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function FilterIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </svg>
  );
}

export function XIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function EditIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export function CalendarIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size)} {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

