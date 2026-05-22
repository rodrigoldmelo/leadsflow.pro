import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

/**
 * Quando true, a resposta JSON inclui objeto `debug` (apenas servidor local / staging).
 * Não ative em produção pública.
 */
const LOGIN_ROUTE_DEBUG = process.env.LOGIN_ROUTE_DEBUG === 'true';

function summarizeEnvForLogs() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    NEXT_PUBLIC_SUPABASE_URL: url
      ? { defined: true, length: url.length, host: safeHost(url) }
      : { defined: false },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon
      ? { defined: true, length: anon.length, prefix: anon.slice(0, 8) }
      : { defined: false },
    SUPABASE_SERVICE_ROLE_KEY: svc
      ? { defined: true, length: svc.length, prefix: svc.slice(0, 8) }
      : { defined: false },
    NODE_ENV: process.env.NODE_ENV,
    LOGIN_ROUTE_DEBUG,
  };
}

function safeHost(maybeUrl: string) {
  try {
    return new URL(maybeUrl).host;
  } catch {
    return '(URL inválida)';
  }
}

function redactRows(rows: unknown[] | null) {
  if (!rows?.length) return [];
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const o = r as Record<string, unknown>;
    const { password_hash, ...rest } = o;
    return {
      ...rest,
      password_hash:
        typeof password_hash === 'string'
          ? `[${password_hash.length} chars, oculto]`
          : password_hash,
    };
  });
}

export async function POST(req: NextRequest) {
  const envSummary = summarizeEnvForLogs();
  console.log('[login] Env (mascarado / metadados):', JSON.stringify(envSummary, null, 2));

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    console.error('[login] JSON inválido no body');
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const emailRaw = body.email ?? '';
  const password = body.password ?? '';
  const email = emailRaw.trim();

  console.log('[login] Credenciais (email normalizado trim):', {
    email,
    passwordLength: password.length,
  });

  const debugPayload: Record<string, unknown> = {
    mensagem_rls:
      'PGRST116 com cliente anon quase sempre = RLS bloqueou SELECT (0 linhas visíveis) ou filtro ativo/email não casa.',
    sugestoes_supabase_sql: [
      '-- Conferir RLS:',
      '-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = \'public\' AND tablename = \'users_faculdades\';',
      '-- Política mínima para teste com anon (NÃO usar em prod sem revisar):',
      '-- CREATE POLICY users_faculdades_select_anon ON public.users_faculdades FOR SELECT TO anon USING (true);',
      '-- Melhor: manter anon sem leitura e usar apenas service_role nesta API (ver consultas admin abaixo).',
    ],
  };

  // --- Teste sem .single() (anon): todas as linhas com email (para ver quantas aparecem) ---
  const anonList = await supabase
    .from('users_faculdades')
    .select('*')
    .eq('email', email);

  console.log('[login] anon .select sem .single():', {
    error: anonList.error,
    count: anonList.data?.length ?? 0,
  });

  // --- Anon sem .single() + ativo ---
  const anonListAtivo = await supabase
    .from('users_faculdades')
    .select('*')
    .eq('email', email)
    .eq('ativo', true);

  console.log('[login] anon email+ativo sem .single():', {
    error: anonListAtivo.error,
    count: anonListAtivo.data?.length ?? 0,
  });

  // --- Teste anon com .maybeSingle() (não lança PGRST116 quando 0 linhas; devolve erro de API) ---
  const anonMaybe = await supabase
    .from('users_faculdades')
    .select('*')
    .eq('email', email)
    .eq('ativo', true)
    .maybeSingle();

  console.log('[login] anon .maybeSingle() email+ativo:', {
    error: anonMaybe.error,
    hasData: !!anonMaybe.data,
  });

  // --- Mesmas consultas com service_role (ignora RLS) ---
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  let adminListAllEmail: {
    error: typeof anonList.error;
    count: number;
    rows?: unknown;
  } = { error: null, count: -1 };

  let adminListAtivo: {
    error: typeof anonList.error;
    count: number;
    rows?: unknown;
  } = { error: null, count: -1 };

  if (hasServiceRole) {
    const a1 = await supabaseAdmin
      .from('users_faculdades')
      .select('*')
      .eq('email', email);

    console.log('[login] admin (service_role) email sem .single():', {
      error: a1.error,
      count: a1.data?.length ?? 0,
    });

    adminListAllEmail = {
      error: a1.error,
      count: a1.data?.length ?? 0,
      rows: redactRows(a1.data ?? []),
    };

    const a2 = await supabaseAdmin
      .from('users_faculdades')
      .select('*')
      .eq('email', email)
      .eq('ativo', true);

    console.log('[login] admin (service_role) email+ativo sem .single():', {
      error: a2.error,
      count: a2.data?.length ?? 0,
    });

    adminListAtivo = {
      error: a2.error,
      count: a2.data?.length ?? 0,
      rows: redactRows(a2.data ?? []),
    };

    const aSingle = await supabaseAdmin
      .from('users_faculdades')
      .select('*')
      .eq('email', email)
      .eq('ativo', true)
      .maybeSingle();

    console.log('[login] admin .maybeSingle() email+ativo:', {
      error: aSingle.error,
      hasData: !!aSingle.data,
    });

    debugPayload.admin_maybeSingle_error = aSingle.error;
    debugPayload.admin_maybeSingle_found = !!aSingle.data;

    let userForLogin: Record<string, unknown> | undefined =
      (a2.data?.[0] as Record<string, unknown> | undefined) ?? undefined;
    if (!userForLogin && aSingle.data) {
      userForLogin = aSingle.data as Record<string, unknown>;
    }

    if (loginRouteAuthSuccess(password, userForLogin) && userForLogin) {
      const { password_hash: _ph, ...userData } = userForLogin;
      return NextResponse.json({
        success: true,
        user: userData,
        ...(LOGIN_ROUTE_DEBUG && {
          debug: {
            ...debugPayload,
            env: envSummary,
            anon_sem_single_count: anonList.data?.length ?? 0,
            anon_com_ativo_count: anonListAtivo.data?.length ?? 0,
            anon_maybeSingle_error: anonMaybe.error,
            admin_list_email_count: adminListAllEmail.count,
            admin_list_ativo_count: adminListAtivo.count,
            nota: 'Login validado via service_role (contorna RLS). Corrija RLS ou use só admin nesta API.',
          },
        }),
      });
    }
  } else {
    console.warn(
      '[login] SUPABASE_SERVICE_ROLE_KEY não definida — não é possível testar/service login com admin.'
    );
    debugPayload.admin_skipped_reason = 'SUPABASE_SERVICE_ROLE_KEY ausente ou vazia';
  }

  // Fallback anon: apenas se política permitir ler a linha
  const anonUser = anonMaybe.data;
  if (loginRouteAuthSuccess(password, anonUser ?? undefined)) {
    const u = anonUser as Record<string, unknown>;
    const { password_hash: _ph, ...userData } = u;
    return NextResponse.json({
      success: true,
      user: userData,
      ...(LOGIN_ROUTE_DEBUG && {
        debug: {
          ...debugPayload,
          env: envSummary,
          via: 'anon',
          anon_maybeSingle_error: anonMaybe.error,
        },
      }),
    });
  }

  console.log('[login] Falha auth — anon_maybeSingle erro:', anonMaybe.error);

  return NextResponse.json(
    {
      error: 'Credenciais inválidas',
      ...(LOGIN_ROUTE_DEBUG && {
        debug: {
          ...debugPayload,
          env: envSummary,
          anon_sem_single: {
            erro: anonList.error,
            count: anonList.data?.length ?? 0,
            rows_amostra_redacted: redactRows(anonList.data ?? []).slice(0, 3),
          },
          anon_email_ativo_sem_single: {
            erro: anonListAtivo.error,
            count: anonListAtivo.data?.length ?? 0,
            rows_amostra_redacted: redactRows(anonListAtivo.data ?? []).slice(0, 3),
          },
          anon_maybe_single: {
            erro: anonMaybe.error,
          },
          admin_service_role_present: hasServiceRole,
          admin_email_sem_single_count: adminListAllEmail.count,
          admin_email_ativo_sem_single_count: adminListAtivo.count,
          admin_email_sem_single_erro: adminListAllEmail.error,
          admin_email_ativo_sem_single_erro: adminListAtivo.error,
          admin_rows_amostra_redacted: {
            apenas_email: (adminListAllEmail.rows as unknown[])?.slice(0, 3),
            email_e_ativo: (adminListAtivo.rows as unknown[])?.slice(0, 3),
          },
        },
      }),
    },
    { status: 401 }
  );
}

function loginRouteAuthSuccess(
  password: string,
  userRow: Record<string, unknown> | undefined
): boolean {
  if (!userRow) return false;
  const hash = userRow.password_hash;
  // Demo original: senha fixa OU hash igual texto (legado dos seus testes)
  if (password === 'senha123') return true;
  if (typeof hash === 'string' && hash === password) return true;
  return false;
}
