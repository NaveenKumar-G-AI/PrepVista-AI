'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { api, logout } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  collegeId?: string;
  student?: {
    id: string;
    studentId: string;
    targetRole?: string;
  };
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await api.get<{ user: User }>('/auth/me');
        setUser(response.user);
      } catch (error) {
        logout();
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={user} currentPath={currentPath} />
      <main className="lg:pl-64">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}