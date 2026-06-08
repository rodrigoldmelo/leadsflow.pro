import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import type { DashboardStats, LeadStatus } from '@/lib/types';

const STATUS_KEYS: LeadStatus[] = [
  'qualificado',
  'convertido',
  'perdido',
  'nao_qualificado',
];

type CountParams = {
  unidade?: string | null;
  faculdade?: string | null;
  status?: LeadStatus;
  start: string;
  end: string;
};

function startOfCurrentMonthSaoPaulo() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);

  const year = parts.find((part) => part.type === 'year')?.value ?? String(now.getFullYear());
  const month =
    parts.find((part) => part.type === 'month')?.value ??
    String(now.getMonth() + 1).padStart(2, '0');

  return new Date(`${year}-${month}-01T00:00:00-03:00`);
}

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data inválida: ${value}`);
  }
  return parsed;
}

function saoPauloParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftSaoPauloMonth(date: Date, offset: number) {
  const parts = saoPauloParts(date);
  const monthIndex = parts.month - 1 + offset;
  const targetYear = parts.year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const targetMonth = targetMonthIndex + 1;
  const targetDay = Math.min(parts.day, daysInMonth(targetYear, targetMonth));

  const yyyy = String(targetYear).padStart(4, '0');
  const mm = String(targetMonth).padStart(2, '0');
  const dd = String(targetDay).padStart(2, '0');
  const hh = String(parts.hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  const sec = String(parts.second).padStart(2, '0');

  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}-03:00`);
}

function previousPeriod(start: Date, end: Date) {
  return {
    previousStart: shiftSaoPauloMonth(start, -1),
    previousEnd: shiftSaoPauloMonth(end, -1),
  };
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function deltaPercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

async function countLeads(params: CountParams) {
  let query = supabaseAdmin
    .from('leads_meta')
    .select('id', { count: 'exact', head: true })
    .gte('data_submissao', params.start)
    .lt('data_submissao', params.end);

  if (params.unidade) {
    query = query.eq('unidade', params.unidade);
  } else if (params.faculdade) {
    query = query.eq('faculdade', params.faculdade);
  }

  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const unidade = searchParams.get('unidade');
    const faculdade = searchParams.get('faculdade');

    if (!unidade && !faculdade) {
      return NextResponse.json(
        { error: 'Informe unidade ou faculdade para calcular estatísticas.' },
        { status: 400 }
      );
    }

    const defaultStart = startOfCurrentMonthSaoPaulo();
    const startDate = parseDate(searchParams.get('start'), defaultStart);
    const endDate = parseDate(searchParams.get('end'), new Date());
    const { previousStart, previousEnd } = previousPeriod(startDate, endDate);
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    const prevStart = previousStart.toISOString();
    const prevEnd = previousEnd.toISOString();

    const [total, previousTotal, qualificados, convertidos, perdidos, naoQualificados] =
      await Promise.all([
        countLeads({ unidade, faculdade, start, end }),
        countLeads({ unidade, faculdade, start: prevStart, end: prevEnd }),
        ...STATUS_KEYS.map((status) => countLeads({ unidade, faculdade, status, start, end })),
      ]);

    const stats: DashboardStats = {
      total_leads: total,
      qualificados,
      convertidos,
      perdidos,
      nao_qualificados: naoQualificados,
      taxa_qualificacao: percent(qualificados, total),
      taxa_conversao: percent(convertidos, total),
      taxa_perdidos: percent(perdidos, total),
      taxa_nao_qualificados: percent(naoQualificados, total),
      previous_total_leads: previousTotal,
      delta_total_percent: deltaPercent(total, previousTotal),
      period: {
        start,
        end,
        previousStart: prevStart,
        previousEnd: prevEnd,
      },
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('[api/leads/stats] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
