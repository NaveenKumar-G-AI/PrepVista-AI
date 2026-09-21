import type { ReactNode } from "react";

export default function Panel({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return <As className={`border border-hairline bg-surface p-5 sm:p-6 ${className}`}>{children}</As>;
}
