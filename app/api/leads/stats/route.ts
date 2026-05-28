import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import type { DashboardStats, LeadStatus } from '@/lib/types';

const STATUS_KEYS: LeadStatus[] = [
  'qualificado',
  'convertido',
  'perdido',
];

async function countLeads(params: {
  unidade?: string | null;
  faculdade?: string | null;
  status?: LeadStatus;
}) {
  let query = supabaseAdmin
    .from('leads_meta')
    .select('id', { count: 'exact', head: true });

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

    const [total, qualificados, convertidos, perdidos] = await Promise.all([
      countLeads({ unidade, faculdade }),
      ...STATUS_KEYS.map((status) => countLeads({ unidade, faculdade, status })),
    ]);

    const stats: DashboardStats = {
      total_leads: total,
      qualificados,
      convertidos,
      perdidos,
      taxa_qualificacao: total > 0 ? Math.round((qualificados / total) * 100) : 0,
      taxa_conversao: total > 0 ? Math.round((convertidos / total) * 100) : 0,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('[api/leads/stats] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
