import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import type { Faculdade, LeadStatus, Unidade } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

type FieldDatum = { name?: string; values?: string[] };

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

type PageConfig = {
  pageId: string;
  pageName: string;
  unidade: Unidade;
};

type LeadgenForm = {
  id: string;
  name?: string;
  status?: string;
  leads_count?: number;
  created_time?: string;
};

type LeadgenLead = {
  id?: string;
  created_time?: string;
  field_data?: FieldDatum[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
};

type GraphList<T> = GraphError & {
  data?: T[];
  paging?: {
    next?: string;
  };
};

type SyncRequestBody = {
  unidade?: Unidade | 'all';
  since?: string;
  until?: string;
  lookbackMinutes?: number;
  dryRun?: boolean;
  limitPerForm?: number;
  formId?: string;
  formName?: string;
};

type SyncUnitResult = {
  unidade: Unidade;
  pageId: string;
  pageName: string;
  formsSeen: number;
  formsWithCurrentMonthLeads: number;
  leadsFetched: number;
  leadsInserted: number;
  leadsExisting: number;
  errors: Array<{ stage: string; detail: string; formId?: string; formName?: string }>;
};

const PAGES_BY_UNIT: PageConfig[] = [
  {
    pageId: '109126868550520',
    pageName: 'Unifael Curitiba',
    unidade: 'unifael_curitiba',
  },
  {
    pageId: '108160092336754',
    pageName: 'Unifael Lapa',
    unidade: 'unifael_lapa',
  },
  {
    pageId: '115647471442744',
    pageName: 'Unifael Florianópolis',
    unidade: 'unifael_florianopolis',
  },
  {
    pageId: '104259132429614',
    pageName: 'Unifael Porto Alegre',
    unidade: 'unifael_porto_alegre',
  },
  {
    pageId: '100206642289858',
    pageName: 'Uninassau Vilhena',
    unidade: 'uninassau_vilhena',
  },
  {
    pageId: '159679300823510',
    pageName: 'Uninassau Cacoal',
    unidade: 'uninassau_cacoal',
  },
  {
    pageId: '187728614667267',
    pageName: 'Uninassau Barreiras',
    unidade: 'uninassau_barreiras',
  },
  {
    pageId: '107167192309312',
    pageName: 'Uninassau Patos',
    unidade: 'uninassau_patos',
  },
  {
    pageId: '106354934455298',
    pageName: 'Uninassau Campina Grande',
    unidade: 'uninassau_campina_grande',
  },
];

function logPrefix() {
  return `[meta-leads-sync ${new Date().toISOString()}]`;
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    return JSON.stringify({
      code: obj.code,
      message: obj.message,
      hint: obj.hint,
    });
  }
  return String(error);
}

function faculdadeFromUnidade(unidade: Unidade): Faculdade {
  return unidade.startsWith('unifael') ? 'unifael' : 'uninassau';
}

function startOfCurrentMonthSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);

  return new Date(Date.UTC(year, month - 1, 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0));
}

function parseDateParam(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00-03:00`
    : value;
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data inválida: ${value}`);
  }

  return parsed;
}

function normalizeFieldName(value: string | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pickField(fieldData: FieldDatum[] | undefined, keys: string[]): string | undefined {
  if (!fieldData?.length) return undefined;
  const normalizedKeys = keys.map(normalizeFieldName);

  for (const row of fieldData) {
    const name = normalizeFieldName(row.name);
    if (!normalizedKeys.includes(name)) continue;

    const value = row.values?.[0];
    if (value?.trim()) return value.trim();
  }

  return undefined;
}

function normalizeModalidade(value: string | undefined) {
  if (!value) return null;

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized.includes('ead') || normalized.includes('digital') || normalized.includes('online')) {
    return 'EAD';
  }
  if (normalized.includes('presencial')) {
    return 'Presencial';
  }
  if (normalized.includes('hibrid')) {
    return 'Híbrido';
  }

  return null;
}

function mapLeadToRow(lead: LeadgenLead, page: PageConfig): Record<string, unknown> | null {
  if (!lead.id) return null;

  const fieldData = lead.field_data;
  const nome =
    pickField(fieldData, [
      'full_name',
      'full name',
      'first_name',
      'first name',
      'nome',
      'nome_completo',
      'name',
      'your_name',
    ]) ?? '-';
  const telefone =
    pickField(fieldData, [
      'phone_number',
      'phone number',
      'telefone',
      'mobile',
      'phone',
      'cell_phone',
    ]) ?? '-';
  const email = pickField(fieldData, ['email', 'e-mail', 'email_address', 'work_email']);
  const curso = pickField(fieldData, [
    'curso',
    'course',
    'program',
    'which_program',
    'area',
    'qual_o_seu_curso_de_interesse?',
    'qual_seu_curso_de_interesse?',
    'qual_seu_curso_de_interesse?_',
  ]);
  const modalidadeRaw = pickField(fieldData, [
    'modalidade',
    'formato',
    'qual_o_melhor_formato_para_você?',
    'qual_o_melhor_formato_para_voce?',
    'qual_melhor_formato_para_voce?',
    'qual_modalidade_você_prefere?',
    'qual_modalidade_voce_prefere?',
  ]);

  const dataSub =
    lead.created_time && !Number.isNaN(Date.parse(lead.created_time))
      ? new Date(lead.created_time).toISOString()
      : new Date().toISOString();

  const status: LeadStatus = 'novo';
  const now = new Date().toISOString();

  return {
    meta_lead_id: String(lead.id),
    nome,
    telefone,
    email: email ?? null,
    curso: curso ?? null,
    modalidade: normalizeModalidade(modalidadeRaw),
    faculdade: faculdadeFromUnidade(page.unidade),
    unidade: page.unidade,
    status,
    campanha_nome: lead.campaign_name ?? lead.ad_name ?? null,
    meta_form_id: lead.form_id ?? null,
    meta_ad_id: lead.ad_id != null ? String(lead.ad_id) : null,
    meta_campaign_id: lead.campaign_id != null ? String(lead.campaign_id) : null,
    ad_account_id: null,
    data_submissao: dataSub,
    updated_at: now,
  };
}

function requireSystemToken() {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado');
  return token;
}

function checkSyncSecret(req: NextRequest) {
  const expected =
    process.env.META_SYNC_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }

  const authorization = req.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const provided =
    req.headers.get('x-meta-sync-secret') ||
    bearer ||
    req.nextUrl.searchParams.get('secret') ||
    '';
  return provided === expected;
}

async function graphGet<T>(
  pathOrUrl: string,
  params: Record<string, string>,
  accessToken: string
): Promise<T & GraphError> {
  const url = pathOrUrl.startsWith('http')
    ? new URL(pathOrUrl)
    : new URL(`${GRAPH_BASE}/${pathOrUrl.replace(/^\//, '')}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString(), { method: 'GET' });
  const json = (await res.json()) as T & GraphError;

  if (!res.ok || json.error) {
    const message = json.error?.message ?? `Graph API HTTP ${res.status}`;
    throw new Error(message);
  }

  return json;
}

async function graphListAll<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<T[]> {
  const rows: T[] = [];
  let nextUrl: string | undefined;

  do {
    const json = nextUrl
      ? await graphGet<GraphList<T>>(nextUrl, {}, accessToken)
      : await graphGet<GraphList<T>>(path, params, accessToken);

    rows.push(...(json.data ?? []));
    nextUrl = json.paging?.next;
  } while (nextUrl);

  return rows;
}

async function getPageAccessToken(page: PageConfig, systemToken: string) {
  const pageData = await graphGet<{ id?: string; name?: string; access_token?: string }>(
    `/${page.pageId}`,
    { fields: 'id,name,access_token' },
    systemToken
  );

  if (!pageData.access_token) {
    throw new Error(`Page Access Token ausente para ${page.pageName}`);
  }

  return pageData.access_token;
}

async function fetchCurrentLeadsForForm(
  form: LeadgenForm,
  pageToken: string,
  since: Date,
  until: Date,
  limitPerForm: number
) {
  const leads: LeadgenLead[] = [];
  let nextUrl: string | undefined;
  let shouldContinue = true;

  while (shouldContinue) {
    const json = nextUrl
      ? await graphGet<GraphList<LeadgenLead>>(nextUrl, {}, pageToken)
      : await graphGet<GraphList<LeadgenLead>>(
          `/${form.id}/leads`,
          {
            fields: [
              'id',
              'created_time',
              'ad_id',
              'ad_name',
              'adset_id',
              'adset_name',
              'campaign_id',
              'campaign_name',
              'form_id',
              'field_data',
            ].join(','),
            limit: '100',
          },
          pageToken
        );

    const batch = json.data ?? [];
    let sawOlderThanSince = false;

    for (const lead of batch) {
      const createdAt = lead.created_time ? new Date(lead.created_time) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue;

      if (createdAt < since) {
        sawOlderThanSince = true;
        continue;
      }

      if (createdAt <= until) {
        leads.push({ ...lead, form_id: lead.form_id ?? form.id });
      }

      if (leads.length >= limitPerForm) {
        return leads;
      }
    }

    nextUrl = json.paging?.next;
    shouldContinue = Boolean(nextUrl) && !sawOlderThanSince;
  }

  return leads;
}

async function insertOnlyNewLeadRows(rows: Array<Record<string, unknown>>, dryRun: boolean) {
  if (!rows.length) return { inserted: 0, existing: 0 };

  const ids = rows.map((row) => String(row.meta_lead_id));
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('leads_meta')
    .select('meta_lead_id')
    .in('meta_lead_id', ids);

  if (existingError) throw existingError;

  const existingIds = new Set((existingRows ?? []).map((row) => String(row.meta_lead_id)));
  const newRows = rows.filter((row) => !existingIds.has(String(row.meta_lead_id)));

  if (!dryRun && newRows.length) {
    const { error } = await supabaseAdmin.from('leads_meta').insert(newRows);
    if (error) throw error;
  }

  if (!dryRun) {
    const existingRowsToUpdate = rows.filter((row) =>
      existingIds.has(String(row.meta_lead_id))
    );

    for (const row of existingRowsToUpdate) {
      const {
        meta_lead_id: _metaLeadId,
        status: _status,
        updated_at: _updatedAt,
        ...sourcePayload
      } = row;

      const { error } = await supabaseAdmin
        .from('leads_meta')
        .update(sourcePayload)
        .eq('meta_lead_id', String(row.meta_lead_id));

      if (error) throw error;
    }
  }

  return {
    inserted: dryRun ? 0 : newRows.length,
    existing: rows.length - newRows.length,
  };
}

async function syncPage(
  page: PageConfig,
  systemToken: string,
  since: Date,
  until: Date,
  dryRun: boolean,
  limitPerForm: number,
  formFilter?: { formId?: string; formName?: string }
): Promise<SyncUnitResult> {
  const result: SyncUnitResult = {
    unidade: page.unidade,
    pageId: page.pageId,
    pageName: page.pageName,
    formsSeen: 0,
    formsWithCurrentMonthLeads: 0,
    leadsFetched: 0,
    leadsInserted: 0,
    leadsExisting: 0,
    errors: [],
  };

  try {
    const pageToken = await getPageAccessToken(page, systemToken);
    const forms = await graphListAll<LeadgenForm>(
      `/${page.pageId}/leadgen_forms`,
      {
        fields: 'id,name,status,leads_count,created_time',
        limit: '100',
      },
      pageToken
    );

    const filteredForms = forms.filter((form) => {
      if (formFilter?.formId) return form.id === formFilter.formId;
      if (formFilter?.formName) {
        return (form.name ?? '').trim().toLowerCase() === formFilter.formName.trim().toLowerCase();
      }
      return true;
    });

    result.formsSeen = filteredForms.length;

    for (const form of filteredForms) {
      try {
        const leads = await fetchCurrentLeadsForForm(
          form,
          pageToken,
          since,
          until,
          limitPerForm
        );

        if (leads.length) result.formsWithCurrentMonthLeads += 1;

        const rows = leads
          .map((lead) => mapLeadToRow(lead, page))
          .filter((row): row is Record<string, unknown> => Boolean(row));

        result.leadsFetched += rows.length;

        const inserted = await insertOnlyNewLeadRows(rows, dryRun);
        result.leadsInserted += inserted.inserted;
        result.leadsExisting += inserted.existing;
      } catch (error) {
        result.errors.push({
          stage: 'form_leads',
          formId: form.id,
          formName: form.name,
          detail: formatError(error),
        });
      }
    }
  } catch (error) {
    result.errors.push({
      stage: 'page',
      detail: formatError(error),
    });
  }

  return result;
}

async function runSync(body: SyncRequestBody) {
  const until = parseDateParam(body.until, new Date());
  const lookbackMinutes = Number(body.lookbackMinutes ?? 0) || 0;
  const since =
    lookbackMinutes > 0
      ? new Date(until.getTime() - Math.min(lookbackMinutes, 60 * 24 * 31) * 60 * 1000)
      : parseDateParam(body.since, startOfCurrentMonthSaoPaulo());
  const dryRun = body.dryRun === true;
  const limitPerForm = Math.max(1, Math.min(Number(body.limitPerForm ?? 10000), 10000));
  const systemToken = requireSystemToken();

  const pages =
    body.unidade && body.unidade !== 'all'
      ? PAGES_BY_UNIT.filter((page) => page.unidade === body.unidade)
      : PAGES_BY_UNIT;

  if (!pages.length) {
    return NextResponse.json(
      { error: 'Unidade inválida ou não mapeada', unidade: body.unidade },
      { status: 400 }
    );
  }

  console.log(logPrefix(), 'Iniciando sync', {
    unidades: pages.map((page) => page.unidade),
    since: since.toISOString(),
    until: until.toISOString(),
    dryRun,
    lookbackMinutes,
  });

  const results: SyncUnitResult[] = [];
  for (const page of pages) {
    results.push(
      await syncPage(page, systemToken, since, until, dryRun, limitPerForm, {
        formId: body.formId?.trim() || undefined,
        formName: body.formName?.trim() || undefined,
      })
    );
  }

  const totals = results.reduce(
    (acc, item) => ({
      formsSeen: acc.formsSeen + item.formsSeen,
      formsWithCurrentMonthLeads:
        acc.formsWithCurrentMonthLeads + item.formsWithCurrentMonthLeads,
      leadsFetched: acc.leadsFetched + item.leadsFetched,
      leadsInserted: acc.leadsInserted + item.leadsInserted,
      leadsExisting: acc.leadsExisting + item.leadsExisting,
      errors: acc.errors + item.errors.length,
    }),
    {
      formsSeen: 0,
      formsWithCurrentMonthLeads: 0,
      leadsFetched: 0,
      leadsInserted: 0,
      leadsExisting: 0,
      errors: 0,
    }
  );

  return NextResponse.json({
    ok: totals.errors === 0,
    dryRun,
    since: since.toISOString(),
    until: until.toISOString(),
    totals,
    results,
  });
}

function bodyFromSearchParams(searchParams: URLSearchParams): SyncRequestBody {
  const unidade = searchParams.get('unidade') as Unidade | 'all' | null;
  const lookbackMinutes = searchParams.get('lookbackMinutes');
  const limitPerForm = searchParams.get('limitPerForm');

  return {
    unidade: unidade ?? undefined,
    since: searchParams.get('since') ?? undefined,
    until: searchParams.get('until') ?? undefined,
    dryRun: searchParams.get('dryRun') === 'true',
    lookbackMinutes: lookbackMinutes ? Number(lookbackMinutes) : undefined,
    limitPerForm: limitPerForm ? Number(limitPerForm) : undefined,
    formId: searchParams.get('formId') ?? undefined,
    formName: searchParams.get('formName') ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!checkSyncSecret(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    return await runSync(bodyFromSearchParams(req.nextUrl.searchParams));
  } catch (error) {
    console.error(logPrefix(), 'Erro não tratado', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: SyncRequestBody = {};
  try {
    body = (await req.json()) as SyncRequestBody;
  } catch {
    body = {};
  }

  const isSingleUnitManualSync = Boolean(body.unidade && body.unidade !== 'all');
  if (!checkSyncSecret(req) && !isSingleUnitManualSync) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    return await runSync(body);
  } catch (error) {
    console.error(logPrefix(), 'Erro não tratado', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
