import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/** Lista leads usando service_role (evita falhas típicas de RLS na API). Filtra obrigatoriamente por `unidade` quando informada (fluxo atual do app). Mantém compatibilidade com `faculdade` apenas para legados. */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const unidade = searchParams.get('unidade');
    const faculdade = searchParams.get('faculdade');
    const status = searchParams.get('status');

    let query = supabaseAdmin
      .from('leads_meta')
      .select('*')
      .order('data_submissao', { ascending: false });

    if (unidade) {
      console.log('[api/leads] Filtro unidade=', unidade);
      query = query.eq('unidade', unidade);
    } else if (faculdade) {
      console.log('[api/leads] Filtro legado faculdade=', faculdade);
      query = query.eq('faculdade', faculdade);
    } else {
      console.warn(
        '[api/leads] Nem unidade nem faculdade foram enviadas — lista sem filtro de unidade/grupo.'
      );
    }

    if (status && status !== 'todos') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar leads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: data || [] });
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
