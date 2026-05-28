'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Target,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Lead, LeadStatus, User } from '@/lib/types';
import { labelUnidade } from '@/lib/unidade-mapping';
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
  DropdownMenuSeparator,
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

const PAGE_SIZE_OPTIONS = [50, 100];

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

function startOfCurrentMonthSaoPauloIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? String(now.getFullYear());
  const month = parts.find((part) => part.type === 'month')?.value ?? String(now.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}-01T00:00:00-03:00`;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [observacao, setObservacao] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null);
  const router = useRouter();

  const fetchLeads = useCallback(
    async (
      unidade: User['unidade'],
      nextPage = page,
      nextPageSize = pageSize
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
        });
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
    [page, pageSize]
  );

  const openLeadFromNotification = useCallback(
    (lead: Lead) => {
      const url = `/leads?lead=${encodeURIComponent(lead.id)}`;
      setHighlightLeadId(lead.id);
      router.push(url);
      if (page !== 1 && user?.unidade) {
        setPage(1);
        setLoading(true);
        fetchLeads(user.unidade, 1, pageSize);
      }
    },
    [fetchLeads, page, pageSize, router, user]
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
          since: startOfCurrentMonthSaoPauloIso(),
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
      await fetchLeads(user.unidade, 1, pageSize);
      setPage(1);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao conectar com a API do Meta.');
    } finally {
      setSyncing(false);
    }
  }, [fetchLeads, pageSize, user]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData) as User;
    setUser(parsedUser);
    fetchLeads(parsedUser.unidade);

    if (typeof window !== 'undefined') {
      const leadFromUrl = new URLSearchParams(window.location.search).get('lead');
      setHighlightLeadId(leadFromUrl);
    }
  }, [router, fetchLeads]);

  const pendingLabel = useMemo(() => {
    if (!pending) return '';
    return STATUS_LABEL_PT[pending.nextStatus];
  }, [pending]);

  const openConfirm = useCallback((lead: Lead, nextStatus: LeadStatus) => {
    setPending({ lead, nextStatus });
    setObservacao('');
    setDialogOpen(true);
  }, []);

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
      await fetchLeads(user.unidade);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }, [pending, observacao, user, fetchLeads]);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!user?.unidade || !pagination) return;
      const bounded = Math.min(Math.max(nextPage, 1), pagination.totalPages);
      setPage(bounded);
      setLoading(true);
      fetchLeads(user.unidade, bounded, pageSize);
    },
    [fetchLeads, pageSize, pagination, user]
  );

  const changePageSize = useCallback(
    (value: number) => {
      if (!user?.unidade) return;
      setPageSize(value);
      setPage(1);
      setLoading(true);
      fetchLeads(user.unidade, 1, value);
    },
    [fetchLeads, user]
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

  function ActionsForLead({ lead }: { lead: Lead }) {
    const s = lead.status;
    const showActions = s === 'novo' || s === 'qualificado';

    return (
      <div className="flex items-center justify-end">
        {showActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-label="Atualizar status do lead">
                Atualizar
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              {s === 'novo' && (
                <>
                  <DropdownMenuItem onSelect={() => openConfirm(lead, 'qualificado')}>
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    Qualificar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openConfirm(lead, 'nao_qualificado')}>
                    <ThumbsDown className="size-4 shrink-0 text-red-600" />
                    Não qualificar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={() => openConfirm(lead, 'convertido')}>
                <Target className="size-4 shrink-0 text-blue-600" />
                Converter
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openConfirm(lead, 'perdido')}>
                <Trash2 className="size-4 shrink-0 text-gray-600" />
                Perder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
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
      <div className="min-h-screen bg-slate-100">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

        <main className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-950">
                {pagination?.total ?? leads.length} leads
              </div>
              <div className="text-xs text-gray-500">
                Ordenado do mais recente para o mais antigo.
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                onClick={handleForceSync}
                disabled={syncing}
              >
                <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Atualizando...' : 'Atualizar agora'}
              </Button>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
              <p className="text-gray-600">Nenhum lead encontrado</p>
            </div>
          ) : (
            <div className="space-y-3 md:space-y-0 md:bg-white md:rounded-lg md:border md:border-gray-200 md:shadow-sm md:overflow-hidden">
              <div className="grid gap-3 md:hidden">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${
                      lead.id === highlightLeadId ? 'ring-2 ring-blue-200' : ''
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
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
                        <Phone className="size-4 shrink-0 text-gray-400" />
                        <span className="min-w-0 truncate">{lead.telefone || '-'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <div className="text-xs font-medium uppercase text-gray-400">
                            Modalidade
                          </div>
                          <div className="mt-0.5 truncate text-gray-700">
                            {lead.modalidade || '-'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase text-gray-400">
                            Curso
                          </div>
                          <div className="mt-0.5 truncate text-gray-700">
                            {lead.curso || '-'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
                      <ActionsForLead lead={lead} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-[1160px] w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Data
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Hora
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Nome
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Contato
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Modalidade
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Curso
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="sticky right-0 z-10 bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">
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
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(lead.data_submissao)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5 text-gray-400" />
                            {formatTime(lead.data_submissao)}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[13rem] text-sm font-medium text-gray-950">
                          {lead.nome}
                        </td>
                        <td className="px-4 py-3 min-w-[16rem] text-sm text-gray-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="size-3.5 text-gray-400" />
                            {lead.email || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="size-3.5 text-gray-400" />
                            {lead.telefone || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {lead.modalidade || '-'}
                        </td>
                        <td className="px-4 py-3 min-w-[12rem] text-sm text-gray-600">
                          {lead.curso || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getStatusColor(
                              lead.status
                            )}`}
                          >
                            {STATUS_LABEL_PT[lead.status]}
                          </span>
                        </td>
                        <td
                          className={`sticky right-0 z-10 px-4 py-3 align-middle whitespace-nowrap text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] group-hover:bg-blue-50 ${
                            lead.id === highlightLeadId ? 'bg-blue-50' : 'bg-white'
                          }`}
                        >
                          <ActionsForLead lead={lead} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination ? (
                <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    Página {pagination.page} de {pagination.totalPages}
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
              ) : null}
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
    </>
  );
}
