import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{description}</p></div>{action}</div>; }
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><span className="empty-symbol">{`{ }`}</span><h3>{title}</h3><p>{children}</p></div>; }
export function ActionLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) { return <Link className={`button ${secondary ? 'secondary' : ''}`} href={href}>{children}<ArrowRight size={16}/></Link>; }
export function TextOutput({ text }: { text: string }) { return <div className="text-output">{text.split(/```(?:[\w+-]+)?\n([\s\S]*?)```/g).map((part, i) => i % 2 ? <pre key={i}><code>{part}</code></pre> : <div key={i}>{part}</div>)}</div>; }
