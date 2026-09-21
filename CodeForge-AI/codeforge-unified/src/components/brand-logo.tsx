import Image from 'next/image';

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <>
    <Image src="/prepvista.png" alt="PrepVista" width={40} height={40} priority className="brand-logo" />
    <span className="brand-copy">
      <span className="brand-name">PrepVista</span>
      {!compact && <span className="brand-subtitle">Coding workspace</span>}
    </span>
  </>;
}
