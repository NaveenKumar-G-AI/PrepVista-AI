import Image from 'next/image';

interface BrandLogoProps {
  nameClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  className?: string;
  imageClassName?: string;
  size?: number;
  priority?: boolean;
}

export function BrandLogo({
  nameClassName = 'text-lg font-bold text-primary',
  subtitle,
  subtitleClassName = 'text-xs text-secondary',
  className = 'flex items-center gap-3',
  imageClassName = 'rounded-xl object-contain',
  size = 40,
  priority = false,
}: BrandLogoProps) {
  return (
    <div className={className}>
      <Image
        src="/prepvista.png"
        alt="PrepVista"
        width={size}
        height={size}
        priority={priority}
        className={imageClassName}
      />
      <div>
        <div className={nameClassName}>PrepVista</div>
        {subtitle ? <div className={subtitleClassName}>{subtitle}</div> : null}
      </div>
    </div>
  );
}