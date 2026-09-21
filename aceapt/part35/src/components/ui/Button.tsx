import type { ButtonHTMLAttributes } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-pine text-white hover:bg-pine-strong disabled:bg-line disabled:text-muted',
  secondary: 'bg-transparent text-ink border border-line hover:border-pine hover:text-pine disabled:text-muted',
  ghost: 'bg-transparent text-pine hover:underline disabled:text-muted',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonProps) {
  return <button className={`${BASE} ${VARIANT_CLASSES[variant]} ${className}`} {...rest} />;
}

export function LinkButton({
  href,
  variant = 'primary',
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${BASE} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Link>
  );
}
