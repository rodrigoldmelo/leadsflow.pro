'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Mail,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  RefreshCw,
  Search,
  Table2,
  Target,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Lead, LeadStatus, User } from '@/lib/types';
import { labelUnidade } from '@/lib/unidade-mapping';
import { DateRangePicker, addDays, getDefaultPeriod } from '@/components/date-range-picker';
import { LeadNotifications } from '@/components/lead-notifications';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';

const STATUS_LABEL_PT: Record<LeadStatus, string> = {
  novo: 'Novo',
  qualificado: 'Qualificado',
  nao_qualificado: 'Não qualificado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

type PendingAction = { lead: Lead; nextStatus: LeadStatus } | null;

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ViewMode = 'table' | 'funnel';

const PAGE_SIZE_OPTIONS = [50, 100];
const MANUAL_SYNC_LOOKBACK_MINUTES = 180;
const NEW_ATTENDENTE_VALUE = '__new_attendant__';

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toPeriodStartIso(value: string) {
  return `${value}T00:00:00-03:00`;
}

function toPeriodEndIso(value: string) {
  return `${addDays(value, 1)}T00:00:00-03:00`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function whatsappHref(phone: string | null | undefined) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const withCountryCode = digits.startsWith('55')
    ? digits
    : digits.length === 10 || digits.length === 11
      ? `55${digits}`
      : digits;
  return withCountryCode.length >= 10 ? `https://wa.me/${withCountryCode}` : null;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [period, setPeriod] = useState(() => getDefaultPeriod());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [todayCount, setTodayCount] = useState(0);
  const [atendentes, setAtendentes] = useState<Array<{ id: string; nome: string }>>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [observacao, setObservacao] = useState('');
  const [crmLead, setCrmLead] = useState<Lead | null>(null);
  const [crmResponsavel, setCrmResponsavel] = useState('');
  const [crmObservacao, setCrmObservacao] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<LeadStatus | null>(null);
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null);
  const router = useRouter();
  const isIrConsultoria = user?.unidade === 'ir_consultoria';

  const fetchLeads = useCallback(
    async (
      unidade: User['unidade'],
      nextPage = page,
      nextPageSize = pageSize,
      nextPeriod = period,
      nextSearch = searchQuery
    ) => {
      try {
        if (!unidade) {
          console.warn('[leads] Conta sem unidade — lista vazia.');
          setLeads([]);
          setPagination(null);
          return;
        }

        const params = new URLSearchParams({
          unidade,
          page: String(nextPage),
          pageSize: String(nextPageSize),
          start: toPeriodStartIso(nextPeriod.startDate),
          end: toPeriodEndIso(nextPeriod.endDate),
        });
        if (nextSearch.trim()) {
          params.set('search', nextSearch.trim());
        }
        const response = await fetch(`/api/leads?${params.toString()}`);
        const data = await response.json();

        setLeads(data.leads || []);
        setPagination(data.pagination ?? null);
      } catch (error) {
        console.error('Erro ao buscar leads:', error);
        toast.error('Não foi possível carregar os leads.');
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, period, searchQuery]
  );

  const openLeadFromNotification = useCallback(
    (lead: Lead) => {
      const url = `/leads?lead=${encodeURIComponent(lead.id)}`;
      setHighlightLeadId(lead.id);
      router.push(url);
      if (page !== 1 && user?.unidade) {
        setPage(1);
        setLoading(true);
        fetchLeads(user.unidade, 1, pageSize, period, searchQuery);
      }
    },
    [fetchLeads, page, pageSize, period, router, searchQuery, user]
  );

  const fetchAtendentes = useCallback(async (unidade: User['unidade']) => {
    if (!unidade) return;
    try {
      const response = await fetch(`/api/atendentes?unidade=${encodeURIComponent(unidade)}`);
      const data = await response.json();
      if (response.ok) {
        setAtendentes(data.atendentes || []);
      }
    } catch (error) {
      console.warn('[leads] Falha ao buscar atendentes:', error);
    }
  }, []);

  const fetchTodayCount = useCallback(async (unidade: User['unidade']) => {
    if (!unidade) return;
    const today = toDateInputValue(new Date());
    try {
      const params = new URLSearchParams({
        unidade,
        page: '1',
        pageSize: '1',
        start: toPeriodStartIso(today),
        end: toPeriodEndIso(today),
      });
      const response = await fetch(`/api/leads?${params.toString()}`);
      const data = await response.json();
      if (response.ok) {
        setTodayCount(data.pagination?.total ?? 0);
      }
    } catch (error) {
      console.warn('[leads] Falha ao buscar leads de hoje:', error);
    }
  }, []);

  const changePeriod = useCallback(
    (nextPeriod: { startDate: string; endDate: string }) => {
      if (!user?.unidade) return;
      setPeriod(nextPeriod);
      setPage(1);
      setLoading(true);
      fetchLeads(user.unidade, 1, pageSize, nextPeriod, searchQuery);
    },
    [fetchLeads, pageSize, searchQuery, user]
  );

  const createAtendente = useCallback(async () => {
    if (!user?.unidade) return null;
    const nome = window.prompt('Nome do atendente');
    const nomeLimpo = nome?.trim();
    if (!nomeLimpo) return null;

    try {
      const response = await fetch('/api/atendentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidade: user.unidade, nome: nomeLimpo }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Não foi possível criar o atendente.');
        return null;
      }

      toast.success('Atendente criado.');
      await fetchAtendentes(user.unidade);
      return nomeLimpo;
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar atendente.');
      return null;
    }
  }, [fetchAtendentes, user]);

  const saveLeadDetails = useCallback(
    async (lead: Lead, responsavel: string, observacaoLead: string) => {
      setSavingLeadId(lead.id);
      try {
        const response = await fetch('/api/leads/details', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id,
            responsavel,
            observacao: observacaoLead,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error || 'Não foi possível salvar o lead.');
          return;
        }

        toast.success('Lead salvo.');
        if (user?.unidade) {
          await fetchLeads(user.unidade, page, pageSize, period, searchQuery);
        }
      } catch (error) {
        console.error(error);
        toast.error('Erro ao salvar lead.');
      } finally {
        setSavingLeadId(null);
      }
    },
    [fetchLeads, page, pageSize, period, searchQuery, user]
  );

  const handleForceSync = useCallback(async () => {
    if (!user?.unidade) {
      toast.error('Conta sem unidade configurada.');
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch('/api/meta-leads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unidade: user.unidade,
          lookbackMinutes: MANUAL_SYNC_LOOKBACK_MINUTES,
          until: new Date().toISOString(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Não foi possível atualizar agora.');
        return;
      }

      toast.success('Atualização concluída.', {
        description: `${data.totals?.leadsInserted ?? 0} novos leads salvos.`,
      });
      await fetchLeads(user.unidade, 1, pageSize, period, searchQuery);
      await fetchTodayCount(user.unidade);
      setPage(1);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao conectar com a API do Meta.');
    } finally {
      setSyncing(false);
    }
  }, [fetchLeads, fetchTodayCount, pageSize, period, searchQuery, user]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData) as User;
    setUser(parsedUser);
    fetchLeads(parsedUser.unidade);
    fetchAtendentes(parsedUser.unidade);
    fetchTodayCount(parsedUser.unidade);

    if (typeof window !== 'undefined') {
      const leadFromUrl = new URLSearchParams(window.location.search).get('lead');
      setHighlightLeadId(leadFromUrl);
    }
  }, [router, fetchLeads, fetchAtendentes, fetchTodayCount]);

  const pendingLabel = useMemo(() => {
    if (!pending) return '';
    return STATUS_LABEL_PT[pending.nextStatus];
  }, [pending]);

  const openConfirm = useCallback((lead: Lead, nextStatus: LeadStatus) => {
    setPending({ lead, nextStatus });
    setObservacao('');
    setDialogOpen(true);
  }, []);

  const openCrmDialog = useCallback((lead: Lead) => {
    setCrmLead(lead);
    setCrmResponsavel(lead.responsavel_atendimento || '');
    setCrmObservacao(lead.observacao || '');
  }, []);

  const handleCrmSave = useCallback(async () => {
    if (!crmLead) return;
    await saveLeadDetails(crmLead, crmResponsavel, crmObservacao);
    setCrmLead(null);
  }, [crmLead, crmObservacao, crmResponsavel, saveLeadDetails]);

  const updateLeadStatusDirect = useCallback(
    async (lead: Lead, nextStatus: LeadStatus) => {
      if (!user?.id || lead.status === nextStatus) return;

      setSubmitting(true);
      try {
        const response = await fetch(`/api/leads/${lead.id}/update-status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: nextStatus,
            observacao: lead.observacao || '',
            userId: user.id,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error || 'Falha ao atualizar status.');
          return;
        }

        toast.success(`Lead movido para ${STATUS_LABEL_PT[nextStatus]}.`);
        await fetchLeads(user.unidade, page, pageSize, period, searchQuery);
      } catch (error) {
        console.error(error);
        toast.error('Erro ao atualizar status do lead.');
      } finally {
        setSubmitting(false);
        setDraggingLeadId(null);
        setDropStatus(null);
      }
    },
    [fetchLeads, page, pageSize, period, searchQuery, user]
  );

  const handleConfirm = useCallback(async () => {
    if (!pending?.lead || !user?.id) {
      toast.error('Sessão inválida. Faça login novamente.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/leads/${pending.lead.id}/update-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: pending.nextStatus,
          observacao: observacao.trim() || '',
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Falha ao atualizar status.');
        return;
      }

      toast.success('Lead atualizado com sucesso.');
      setDialogOpen(false);
      setPending(null);
      setObservacao('');
      await fetchLeads(user.unidade, page, pageSize, period, searchQuery);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }, [pending, observacao, page, pageSize, period, searchQuery, user, fetchLeads]);

  useEffect(() => {
    if (!user?.unidade) return;

    const timeout = window.setTimeout(() => {
      setPage(1);
      setLoading(true);
      fetchLeads(user.unidade, 1, pageSize, period, searchQuery);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [fetchLeads, pageSize, period, searchQuery, user]);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!user?.unidade || !pagination) return;
      const bounded = Math.min(Math.max(nextPage, 1), pagination.totalPages);
      setPage(bounded);
      setLoading(true);
      fetchLeads(user.unidade, bounded, pageSize, period, searchQuery);
    },
    [fetchLeads, pageSize, pagination, period, searchQuery, user]
  );

  const changePageSize = useCallback(
    (value: number) => {
      if (!user?.unidade) return;
      setPageSize(value);
      setPage(1);
      setLoading(true);
      fetchLeads(user.unidade, 1, value, period, searchQuery);
    },
    [fetchLeads, period, searchQuery, user]
  );

  const getStatusColor = (status: string) => {
    const colors = {
      novo: 'bg-amber-100 text-amber-800 ring-amber-200',
      qualificado: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
      convertido: 'bg-blue-100 text-blue-800 ring-blue-200',
      perdido: 'bg-gray-100 text-gray-700 ring-gray-200',
      nao_qualificado: 'bg-red-100 text-red-800 ring-red-200',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-700 ring-gray-200';
  };

  const statusColumns = useMemo(
    () =>
      [
        {
          status: 'novo' as LeadStatus,
          label: 'Novo',
          tone: 'border-amber-200 bg-amber-50/70',
        },
        {
          status: 'qualificado' as LeadStatus,
          label: 'Qualificado',
          tone: 'border-emerald-200 bg-emerald-50/70',
        },
        {
          status: 'convertido' as LeadStatus,
          label: 'Convertido',
          tone: 'border-blue-200 bg-blue-50/70',
        },
        {
          status: 'nao_qualificado' as LeadStatus,
          label: 'Não qualificado',
          tone: 'border-red-200 bg-red-50/70',
        },
        {
          status: 'perdido' as LeadStatus,
          label: 'Perdido',
          tone: 'border-gray-200 bg-gray-50',
        },
      ],
    []
  );

  const leadsByStatus = useMemo(() => {
    return statusColumns.reduce(
      (acc, column) => {
        acc[column.status] = leads.filter((lead) => lead.status === column.status);
        return acc;
      },
      {} as Record<LeadStatus, Lead[]>
    );
  }, [leads, statusColumns]);

  function getInitials(name: string | null | undefined) {
    const parts = (name || '-')
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean);
    return `${parts[0]?.[0] ?? '-'}${parts[1]?.[0] ?? ''}`.toUpperCase();
  }

  function PhoneLink({ phone }: { phone: string | null | undefined }) {
    const href = whatsappHref(phone);
    const label = phone || '-';

    if (!href) {
      return <span className="truncate">{label}</span>;
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1.5 truncate text-emerald-700 hover:text-emerald-800 hover:underline"
        title="Abrir no WhatsApp"
      >
        <MessageCircle className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </a>
    );
  }

  function LeadCrmFields({ lead }: { lead: Lead }) {
    return (
      <div className="grid min-w-0 gap-2 rounded-md bg-slate-50 p-2 text-sm text-gray-600">
        <div className="truncate">
          Responsável: {lead.responsavel_atendimento || 'sem responsável'}
        </div>
        <div className="line-clamp-2 min-h-5 text-xs text-gray-500">
          {lead.observacao || 'Sem observações registradas.'}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openCrmDialog(lead)}
          disabled={savingLeadId === lead.id}
          className="w-full"
        >
          <NotebookPen className="size-4" />
          Atendimento
        </Button>
      </div>
    );
  }

  function LeadCrmTableCells({ lead }: { lead: Lead }) {
    return (
      <>
        <td className="px-3 py-3 align-middle text-sm text-gray-600">
          <div className="truncate" title={lead.responsavel_atendimento || 'Sem responsável'}>
            {lead.responsavel_atendimento || 'Sem responsável'}
          </div>
        </td>
        <td className="px-3 py-3 align-middle text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-xs" title={lead.observacao || ''}>
              {lead.observacao || 'Sem observações'}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openCrmDialog(lead)}
              className="h-8 shrink-0 text-xs"
            >
              <NotebookPen className="size-4" />
              Abrir
            </Button>
          </div>
        </td>
      </>
    );
  }

  function ActionsForLead({ lead }: { lead: Lead }) {
    const s = lead.status;
    const actions: Array<{ status: LeadStatus; label: string; icon: typeof Clock; color: string }> = [
      { status: 'novo', label: 'Marcar como novo', icon: Clock, color: 'text-amber-600' },
      { status: 'qualificado', label: 'Qualificar', icon: CheckCircle2, color: 'text-emerald-600' },
      { status: 'nao_qualificado', label: 'Não qualificar', icon: ThumbsDown, color: 'text-red-600' },
      { status: 'convertido', label: 'Converter', icon: Target, color: 'text-blue-600' },
      { status: 'perdido', label: 'Perder', icon: Trash2, color: 'text-gray-600' },
    ];
    const availableActions = actions.filter((action) => action.status !== s);

    return (
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" aria-label="Atualizar status do lead">
              Atualizar
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            {availableActions.map((action) => {
              const Icon = action.icon;
              return (
                <DropdownMenuItem
                  key={action.status}
                  onSelect={() => openConfirm(lead, action.status)}
                >
                  <Icon className={`size-4 shrink-0 ${action.color}`} />
                  {action.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  function PaginationFooter() {
    if (!pagination) return null;

    return (
      <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Mostrar</span>
          <select
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-600">por página</span>
          <span className="text-sm text-gray-400">
            Página {pagination.page} de {pagination.totalPages}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goToPage(page + 1)}
            disabled={page >= pagination.totalPages}
          >
            Próxima
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-gray-600">Carregando leads...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen overflow-x-hidden bg-slate-100">
        <header className="bg-white border-b border-gray-200">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-950">Gestão de Leads</h1>
              <p className="text-sm text-gray-500 capitalize">
                {user?.faculdade} · {labelUnidade(user?.unidade ?? null)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LeadNotifications user={user} onOpenLead={openLeadFromNotification} />
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="self-start sm:self-auto rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Dashboard
              </button>
            </div>
          </div>
        </header>

        {!user?.unidade ? (
          <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Sua conta não tem unidade configurada. Nenhum lead será listado até o cadastro ser atualizado.
            </div>
          </div>
        ) : null}

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-gray-950">
                {pagination?.total ?? leads.length} leads
              </div>
              <div className="text-xs text-gray-500">
                {todayCount} entraram hoje. Ordenado do mais recente para o mais antigo.
              </div>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(18rem,24rem)_minmax(18rem,1fr)_auto_auto] xl:items-center">
              <DateRangePicker value={period} onChange={changePeriod} />

              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Pesquisar por nome, telefone ou email"
                  className="h-11 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div className="grid grid-cols-2 rounded-md border border-gray-300 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold ${
                    viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Table2 className="size-4" />
                  Tabela
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('funnel')}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold ${
                    viewMode === 'funnel' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Columns3 className="size-4" />
                  Funil
                </button>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleForceSync}
                disabled={syncing}
                className="h-11 justify-center"
              >
                <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Atualizando...' : 'Atualizar agora'}
              </Button>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
              <p className="text-gray-600">Nenhum lead encontrado</p>
            </div>
          ) : viewMode === 'funnel' ? (
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="grid gap-3 bg-slate-100 p-3 lg:grid-cols-2 2xl:grid-cols-5">
                {statusColumns.map((column) => {
                  const columnLeads = leadsByStatus[column.status] ?? [];
                  return (
                    <section
                      key={column.status}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropStatus(column.status);
                      }}
                      onDragLeave={() => setDropStatus(null)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const leadId = event.dataTransfer.getData('text/plain');
                        const lead = leads.find((item) => item.id === leadId);
                        if (lead) updateLeadStatusDirect(lead, column.status);
                      }}
                      className={`flex min-h-[34rem] min-w-0 resize-x flex-col overflow-auto rounded-lg border ${column.tone} ${
                        dropStatus === column.status ? 'ring-2 ring-blue-300' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-white/80 px-3 py-3">
                        <div className="text-sm font-bold text-gray-950">{column.label}</div>
                        <div className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 shadow-sm">
                          {columnLeads.length}
                        </div>
                      </div>
                      <div className="grid content-start gap-2 overflow-y-auto p-2">
                        {columnLeads.length ? (
                          columnLeads.map((lead) => (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={(event) => {
                                setDraggingLeadId(lead.id);
                                event.dataTransfer.setData('text/plain', lead.id);
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => {
                                setDraggingLeadId(null);
                                setDropStatus(null);
                              }}
                              className={`min-w-0 cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm active:cursor-grabbing ${
                                draggingLeadId === lead.id ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="flex min-w-0 items-start gap-2">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-gray-700">
                                  {getInitials(lead.nome)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-gray-950">
                                    {lead.nome || '-'}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                      {formatTime(lead.data_submissao)}
                                    </span>
                                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                                      {isIrConsultoria ? lead.medico || 'Médico?' : lead.modalidade || 'Modalidade'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 space-y-1 text-xs text-gray-600">
                                <div className="truncate">{lead.email || '-'}</div>
                                <div className="truncate">
                                  <PhoneLink phone={lead.telefone} />
                                </div>
                                <div className="truncate font-medium text-gray-800">
                                  {isIrConsultoria ? 'IR Consultoria' : lead.curso || '-'}
                                </div>
                              </div>

                              <div className="mt-3 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-gray-600">
                                Responsável: {lead.responsavel_atendimento || 'sem responsável'}
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openCrmDialog(lead)}
                                  className="h-8 text-xs"
                                >
                                  <NotebookPen className="size-4" />
                                  CRM
                                </Button>
                                <ActionsForLead lead={lead} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-gray-300 bg-white/60 p-4 text-center text-sm text-gray-500">
                            Nenhum lead neste estágio
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
              <PaginationFooter />
            </div>
          ) : (
            <div className="space-y-3 xl:space-y-0 xl:rounded-lg xl:border xl:border-gray-200 xl:bg-white xl:shadow-sm xl:overflow-hidden">
              <div className="grid gap-3 xl:hidden">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className={`min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${
                      lead.id === highlightLeadId ? 'ring-2 ring-blue-200' : ''
                    }`}
                  >
                    <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-950">
                          {lead.nome}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                          <span>{formatDate(lead.data_submissao)}</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5 text-gray-400" />
                            {formatTime(lead.data_submissao)}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getStatusColor(
                          lead.status
                        )}`}
                      >
                        {STATUS_LABEL_PT[lead.status]}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex min-w-0 items-center gap-2">
                        <Mail className="size-4 shrink-0 text-gray-400" />
                        <span className="min-w-0 truncate">{lead.email || '-'}</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <PhoneLink phone={lead.telefone} />
                      </div>
                      {isIrConsultoria ? (
                        <div className="pt-1">
                          <div className="text-xs font-medium uppercase text-gray-400">
                            Você é Médico?
                          </div>
                          <div className="mt-0.5 truncate text-gray-700">
                            {lead.medico || '-'}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 pt-1">
                          <div className="min-w-0">
                            <div className="text-xs font-medium uppercase text-gray-400">
                              Modalidade
                            </div>
                            <div className="mt-0.5 truncate text-gray-700">
                              {lead.modalidade || '-'}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium uppercase text-gray-400">
                              Curso
                            </div>
                            <div className="mt-0.5 truncate text-gray-700">
                              {lead.curso || '-'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 min-w-0 border-t border-gray-100 pt-3">
                      <div className="mb-2 text-xs font-semibold uppercase text-gray-400">
                        CRM
                      </div>
                      <LeadCrmFields lead={lead} />
                    </div>

                    <div className="mt-4 flex min-w-0 justify-end border-t border-gray-100 pt-3">
                      <ActionsForLead lead={lead} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto xl:block">
                <table
                  className="w-full min-w-[1280px] table-fixed divide-y divide-gray-200"
                >
                  <colgroup>
                    <col className="w-[7%]" />
                    <col className="w-[6%]" />
                    <col className="w-[14%]" />
                    <col className="w-[18%]" />
                    <col className="w-[13%]" />
                    {isIrConsultoria ? (
                      <col className="w-[7%]" />
                    ) : (
                      <>
                        <col className="w-[8%]" />
                        <col className="w-[10%]" />
                      </>
                    )}
                    <col className="w-[11%]" />
                    <col className="w-[10%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Data
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Hora
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Nome
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Contato
                      </th>
                      {isIrConsultoria ? (
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Médico?
                        </th>
                      ) : (
                        <>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Modalidade
                          </th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                            Curso
                          </th>
                        </>
                      )}
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Atribuído à
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Observações
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="bg-gray-50 px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {leads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={`group hover:bg-blue-50/40 ${
                          lead.id === highlightLeadId ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(lead.data_submissao)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5 text-gray-400" />
                            {formatTime(lead.data_submissao)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium text-gray-950">
                          <div className="truncate" title={lead.nome || '-'}>
                            {lead.nome || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-600">
                          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                            <Mail className="size-3.5 shrink-0 text-gray-400" />
                            <span className="truncate" title={lead.email || '-'}>
                              {lead.email || '-'}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-600">
                          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                            <PhoneLink phone={lead.telefone} />
                          </span>
                        </td>
                        {isIrConsultoria ? (
                          <td className="px-3 py-3 text-sm text-gray-600">
                            <div className="truncate" title={lead.medico || '-'}>
                              {lead.medico || '-'}
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-3 text-sm text-gray-600">
                              <div className="truncate" title={lead.modalidade || '-'}>
                                {lead.modalidade || '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600">
                              <div className="truncate" title={lead.curso || '-'}>
                                {lead.curso || '-'}
                              </div>
                            </td>
                          </>
                        )}
                        <LeadCrmTableCells lead={lead} />
                        <td className="px-3 py-3 align-middle">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getStatusColor(
                              lead.status
                            )}`}
                          >
                            {STATUS_LABEL_PT[lead.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle text-right">
                          <ActionsForLead lead={lead} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <PaginationFooter />
            </div>
          )}
        </main>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !submitting && setDialogOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar atualização</DialogTitle>
            <DialogDescription>
              Marcar este lead como {pendingLabel}. Essa ação também dispara o retorno de evento ao Meta quando aplicável.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="observacao" className="text-sm font-medium text-gray-800">
              Observações <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <Textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Notas sobre o contato..."
              disabled={submitting}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting}>
              {submitting ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(crmLead)}
        onOpenChange={(open) => {
          if (!open && !savingLeadId) setCrmLead(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atendimento do lead</DialogTitle>
            <DialogDescription>
              {crmLead?.nome || 'Lead'} · {crmLead ? formatDate(crmLead.data_submissao) : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <label className="grid gap-1 text-sm font-medium text-gray-800">
              Responsável
              <select
                value={crmResponsavel}
                onChange={async (event) => {
                  if (event.target.value === NEW_ATTENDENTE_VALUE) {
                    const created = await createAtendente();
                    if (created) setCrmResponsavel(created);
                    return;
                  }
                  setCrmResponsavel(event.target.value);
                }}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900"
              >
                <option value="">Sem responsável</option>
                <option value={NEW_ATTENDENTE_VALUE}>+ Adicionar atendente</option>
                {atendentes.map((atendente) => (
                  <option key={atendente.id} value={atendente.nome}>
                    {atendente.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-800">
              Observações
              <Textarea
                value={crmObservacao}
                onChange={(event) => setCrmObservacao(event.target.value)}
                placeholder="Registre aqui o andamento do contato, objeções, retorno combinado ou próximos passos..."
                className="min-h-[12rem] resize-y leading-relaxed"
              />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCrmLead(null)}
              disabled={Boolean(savingLeadId)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCrmSave} disabled={Boolean(savingLeadId)}>
              {savingLeadId ? 'Salvando...' : 'Salvar atendimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
