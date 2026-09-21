import Link from 'next/link';
export default function NotFound() { return <div className="empty"><h1>That workspace does not exist.</h1><Link href="/" className="button">Return to PrepVista</Link></div>; }
