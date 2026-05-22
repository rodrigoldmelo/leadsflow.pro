'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardStats, User } from '@/lib/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchStats(parsedUser.faculdade);
  }, [router]);

  const fetchStats = async (faculdade: string) => {
    try {
      const response = await fetch(`/api/leads?faculdade=${faculdade}`);
      const data = await response.json();

      const leads = data.leads || [];

      const calculatedStats: DashboardStats = {
        total_leads: leads.length,
        qualificados: leads.filter((l: any) => l.status === 'qualificado').length,
        convertidos: leads.filter((l: any) => l.status === 'convertido').length,
        perdidos: leads.filter((l: any) => l.status === 'perdido').length,
        taxa_qualificacao: 0,
        taxa_conversao: 0
      };

      if (calculatedStats.total_leads > 0) {
        calculatedStats.taxa_qualificacao = Math.round((calculatedStats.qualificados / calculatedStats.total_leads) * 100);
        calculatedStats.taxa_conversao = Math.round((calculatedStats.convertidos / calculatedStats.total_leads) * 100);
      }

      setStats(calculatedStats);
    } catch (error) {
      console.error('Erro ao buscar stats:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!stats || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">📊 Meta Leads Manager</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 capitalize">{user.faculdade}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-sm text-gray-600 mb-2">📨 Total de Leads</div>
            <div className="text-3xl font-bold text-gray-900">{stats.total_leads}</div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-sm text-gray-600 mb-2">✅ Qualificados</div>
            <div className="text-3xl font-bold text-green-600">{stats.qualificados}</div>
            <div className="text-sm text-gray-500 mt-1">{stats.taxa_qualificacao}%</div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-sm text-gray-600 mb-2">🎯 Convertidos</div>
            <div className="text-3xl font-bold text-blue-600">{stats.convertidos}</div>
            <div className="text-sm text-gray-500 mt-1">{stats.taxa_conversao}%</div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-sm text-gray-600 mb-2">❌ Perdidos</div>
            <div className="text-3xl font-bold text-red-600">{stats.perdidos}</div>
          </div>
        </div>

        <Link
          href="/leads"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Ver Todos os Leads →
        </Link>
      </main>
    </div>
  );
}
