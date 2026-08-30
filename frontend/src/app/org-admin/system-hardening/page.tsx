import { redirect } from 'next/navigation';

export default function LegacySystemHardeningPage() {
  redirect('/org-admin/access-control');
}
