import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const faculdade = searchParams.get('faculdade');
    const status = searchParams.get('status');

    let query = supabase
      .from('leads_meta')
      .select('*')
      .order('data_submissao', { ascending: false });

    if (faculdade) {
      query = query.eq('faculdade', faculdade);
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
