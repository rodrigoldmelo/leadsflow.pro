import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { labelUnidade } from '@/lib/unidade-mapping';

const EXPORT_BATCH_SIZE = 1000;

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  qualificado: 'Qualificado',
  nao_qualificado: 'Não qualificado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

type LeadRow = Record<string, unknown>;

function text(value: unknown) {
  return value == null ? '' : String(value);
}

function formatDate(value: unknown) {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatTime(value: unknown) {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value: unknown) {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function escapeCsv(value: unknown) {
  let normalized = text(value).replace(/\r?\n|\r/g, ' ').trim();

  // Evita que Excel interprete dados dos leads como fórmulas.
  if (/^[=+\-@]/.test(normalized)) {
    normalized = `'${normalized}`;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const unidade = searchParams.get('unidade')?.trim();
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const search = searchParams.get('search')?.trim();

    if (!unidade) {
      return NextResponse.json(
        { error: 'Informe a unidade para exportar os leads.' },
        { status: 400 }
      );
    }

    const rows: LeadRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabaseAdmin
        .from('leads_meta')
        .select('*')
        .eq('unidade', unidade)
        .order('data_submissao', { ascending: false })
        .range(offset, offset + EXPORT_BATCH_SIZE - 1);

      if (start) query = query.gte('data_submissao', start);
      if (end) query = query.lt('data_submissao', end);

      if (search) {
        const safeSearch = search.replace(/[,%]/g, ' ').trim();
        if (safeSearch) {
          const pattern = `%${safeSearch}%`;
          query = query.or(
            `nome.ilike.${pattern},email.ilike.${pattern},telefone.ilike.${pattern}`
          );
        }
      }

      const { data, error } = await query;
      if (error) {
        console.error('[api/leads/export] Supabase erro:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const batch = (data ?? []) as LeadRow[];
      rows.push(...batch);
      hasMore = batch.length === EXPORT_BATCH_SIZE;
      offset += EXPORT_BATCH_SIZE;
    }

    const columns: Array<{ label: string; value: (row: LeadRow) => unknown }> = [
      { label: 'Data', value: (row) => formatDate(row.data_submissao) },
      { label: 'Hora', value: (row) => formatTime(row.data_submissao) },
      { label: 'Nome', value: (row) => row.nome },
      { label: 'Email', value: (row) => row.email },
      { label: 'Contato', value: (row) => row.telefone },
      { label: 'Modalidade', value: (row) => row.modalidade },
      { label: 'Curso', value: (row) => row.curso },
      { label: 'Você é Médico?', value: (row) => row.medico },
      { label: 'Status', value: (row) => STATUS_LABELS[text(row.status)] ?? row.status },
      { label: 'Responsável', value: (row) => row.responsavel_atendimento },
      { label: 'Observações', value: (row) => row.observacao },
      { label: 'Campanha', value: (row) => row.campanha_nome },
      { label: 'Unidade', value: (row) => labelUnidade(text(row.unidade)) },
      { label: 'Código da unidade', value: (row) => row.unidade },
      { label: 'Faculdade/Negócio', value: (row) => row.faculdade },
      { label: 'ID do lead no Meta', value: (row) => row.meta_lead_id },
      { label: 'ID do formulário no Meta', value: (row) => row.meta_form_id },
      { label: 'ID do anúncio no Meta', value: (row) => row.meta_ad_id },
      { label: 'ID da campanha no Meta', value: (row) => row.meta_campaign_id },
      { label: 'Conta de anúncios', value: (row) => row.ad_account_id },
      { label: 'Criado no sistema', value: (row) => formatDateTime(row.created_at) },
      { label: 'Atualizado no sistema', value: (row) => formatDateTime(row.updated_at) },
    ];

    const csvRows = [
      columns.map((column) => escapeCsv(column.label)).join(';'),
      ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(';')),
    ];

    const startLabel = start?.slice(0, 10) || 'inicio';
    const endLabel = end?.slice(0, 10) || 'hoje';
    const filename = `leads-${unidade}-${startLabel}-${endLabel}.csv`;

    return new NextResponse(`\uFEFF${csvRows.join('\r\n')}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[api/leads/export] Erro:', error);
    return NextResponse.json({ error: 'Erro interno ao exportar leads.' }, { status: 500 });
  }
}
