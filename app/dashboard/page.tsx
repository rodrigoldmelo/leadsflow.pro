'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  Target,
  TrendingDown,
  TrendingUp,
  ThumbsDown,
  Users,
} from 'lucide-react';

import { DashboardStats, User } from '@/lib/types';
import { labelUnidade } from '@/lib/unidade-mapping';
import { DateRangePicker, addDays, getDefaultPeriod } from '@/components/date-range-picker';
import { LeadNotifications } from '@/components/lead-notifications';

type PeriodState = {
  startDate: string;
  endDate: string;
};

function toPeriodStartIso(value: string) {
  return `${value}T00:00:00-03:00`;
}

function toPeriodEndIso(value: string) {
  return `${addDays(value, 1)}T00:00:00-03:00`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [period, setPeriod] = useState(() => getDefaultPeriod());
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData) as User;
    setUser(parsedUser);
    fetchStats(parsedUser, period);
  }, [router]);

  const fetchStats = async (current: User, selectedPeriod = period) => {
    try {
      if (!current.unidade) {
        console.warn('[dashboard] Usuário sem unidade — métricas zeradas.');
        setStats({
          total_leads: 0,
          qualificados: 0,
          convertidos: 0,
          perdidos: 0,
          taxa_qualificacao: 0,
          taxa_conversao: 0,
        });
        return;
      }

      const params = new URLSearchParams({
        unidade: current.unidade,
        start: toPeriodStartIso(selectedPeriod.startDate),
        end: toPeriodEndIso(selectedPeriod.endDate),
      });
      const response = await fetch(`/api/leads/stats?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar estatísticas.');
      }

      setStats(data.stats);
    } catch (error) {
      console.error('Erro ao buscar stats:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  const changePeriod = (nextPeriod: PeriodState) => {
    setPeriod(nextPeriod);
    if (user) {
      fetchStats(user, nextPeriod);
    }
  };

  if (!stats || !user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  const cards = [
    {
      label: 'Total de leads',
      value: stats.total_leads,
      detail: 'No período selecionado',
      icon: Users,
      color: 'text-gray-900',
    },
    {
      label: 'Qualificados',
      value: stats.qualificados,
      detail: `${stats.taxa_qualificacao}% do total`,
      icon: CheckCircle2,
      color: 'text-emerald-700',
    },
    {
      label: 'Convertidos',
      value: stats.convertidos,
      detail: `${stats.taxa_conversao}% do total`,
      icon: Target,
      color: 'text-blue-700',
    },
    {
      label: 'Perdidos',
      value: stats.perdidos,
      detail: `${stats.taxa_perdidos ?? 0}% do total`,
      icon: ThumbsDown,
      color: 'text-red-700',
    },
  ];
  const delta = stats.delta_total_percent ?? 0;
  const DeltaIcon = delta >= 0 ? TrendingUp : TrendingDown;
  const previousTotal = stats.previous_total_leads ?? 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
              <LayoutDashboard className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-950">LeadsFlow Pro</h1>
              <p className="truncate text-sm text-gray-500 capitalize">
                {user.faculdade} · {labelUnidade(user.unidade ?? null)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LeadNotifications user={user} />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {user && !user.unidade ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Esta conta ainda não tem unidade cadastrada em users_faculdades.
          </div>
        ) : null}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-950">Resumo da unidade</h2>
            <p className="text-sm text-gray-500">
              Visão estratégica de leads por período e unidade.
            </p>
          </div>
          <Link
            href="/leads"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ver leads
          </Link>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(18rem,24rem)_1fr] lg:items-center">
            <DateRangePicker value={period} onChange={changePeriod} />
            <div className="flex justify-start lg:justify-end">
              <div
                className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                  delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}
              >
                <DeltaIcon className="size-4" />
                <span>
                  {delta >= 0 ? '+' : ''}
                  {delta}% vs. mesmo período do mês anterior
                  <span className="ml-1 font-medium opacity-75">({previousTotal} leads)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-500">{card.label}</div>
                  <Icon className={`size-5 ${card.color}`} />
                </div>
                <div className={`text-3xl font-bold ${card.color}`}>{card.value}</div>
                <div className="mt-1 text-sm text-gray-500">{card.detail}</div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
