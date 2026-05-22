'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  MoreHorizontal,
  Target,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Lead, LeadStatus, User } from '@/lib/types';
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

type PendingAction =
  | { lead: Lead; nextStatus: LeadStatus }
  | null;

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [observacao, setObservacao] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const fetchLeads = useCallback(async (faculdade: string) => {
    try {
      const response = await fetch(`/api/leads?faculdade=${faculdade}`);
      const data = await response.json();
      setLeads(data.leads || []);
    } catch (error) {
      console.error('Erro ao buscar leads:', error);
      toast.error('Não foi possível carregar os leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData) as User;
    setUser(parsedUser);
    fetchLeads(parsedUser.faculdade);
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
      const response = await fetch(
        `/api/leads/${pending.lead.id}/update-status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: pending.nextStatus,
            observacao: observacao.trim() || '',
            userId: user.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Falha ao atualizar status.');
        return;
      }

      toast.success('Lead atualizado com sucesso!');
      setDialogOpen(false);
      setPending(null);
      setObservacao('');
      await fetchLeads(user.faculdade);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }, [pending, observacao, user, fetchLeads]);

  const getStatusColor = (status: string) => {
    const colors = {
      novo: 'bg-yellow-100 text-yellow-800',
      qualificado: 'bg-green-100 text-green-800',
      convertido: 'bg-blue-100 text-blue-800',
      perdido: 'bg-gray-100 text-gray-800',
      nao_qualificado: 'bg-red-100 text-red-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadgeLabel = (status: string) => {
    const labels = {
      novo: '🟡 Novo',
      qualificado: '✅ Qualificado',
      convertido: '🎯 Convertido',
      perdido: '🗑️ Perdido',
      nao_qualificado: '❌ Não Qualificado',
    };
    return labels[status as keyof typeof labels] || status;
  };

  function ActionsForLead({ lead }: { lead: Lead }) {
    const s = lead.status;
    const showActions = s === 'novo' || s === 'qualificado';

    const desktopButtons =
      s === 'novo' ? (
        <>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={() => openConfirm(lead, 'qualificado')}
          >
            <CheckCircle2 className="size-3.5 shrink-0" />
            ✅ Qualificar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => openConfirm(lead, 'nao_qualificado')}
          >
            <ThumbsDown className="size-3.5 shrink-0" />
            ❌ Desqualificar
          </Button>
          <Button
            type="button"
            variant="info"
            size="sm"
            onClick={() => openConfirm(lead, 'convertido')}
          >
            <Target className="size-3.5 shrink-0" />
            🎯 Converter
          </Button>
          <Button
            type="button"
            variant="muted"
            size="sm"
            onClick={() => openConfirm(lead, 'perdido')}
          >
            <Trash2 className="size-3.5 shrink-0" />
            🗑️ Perder
          </Button>
        </>
      ) : s === 'qualificado' ? (
        <>
          <Button
            type="button"
            variant="info"
            size="sm"
            onClick={() => openConfirm(lead, 'convertido')}
          >
            <Target className="size-3.5 shrink-0" />
            🎯 Converter
          </Button>
          <Button
            type="button"
            variant="muted"
            size="sm"
            onClick={() => openConfirm(lead, 'perdido')}
          >
            <Trash2 className="size-3.5 shrink-0" />
            🗑️ Perder
          </Button>
        </>
      ) : null;

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {showActions ? (
          <div className="md:hidden inline-flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <MoreHorizontal className="size-4" />
                  Ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                {s === 'novo' && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => openConfirm(lead, 'qualificado')}
                      className="flex items-center gap-2 text-green-800"
                    >
                      <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                      ✅ Qualificar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => openConfirm(lead, 'nao_qualificado')}
                      className="flex items-center gap-2 text-red-800"
                    >
                      <ThumbsDown className="size-4 text-red-600 shrink-0" />
                      ❌ Desqualificar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onSelect={() => openConfirm(lead, 'convertido')}
                  className="flex items-center gap-2 text-blue-800"
                >
                  <Target className="size-4 text-blue-600 shrink-0" />
                  🎯 Converter
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => openConfirm(lead, 'perdido')}
                  className="flex items-center gap-2 text-gray-800"
                >
                  <Trash2 className="size-4 text-gray-600 shrink-0" />
                  🗑️ Perder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <span className="md:hidden text-xs text-gray-400">—</span>
        )}

        <div className="hidden md:flex md:flex-wrap md:justify-end md:gap-2">
          {desktopButtons ?? (
            <span className="text-xs text-gray-400 whitespace-nowrap">—</span>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">📋 Gestão de Leads</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 capitalize">{user?.faculdade}</span>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                ← Dashboard
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {leads.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <p className="text-gray-600">Nenhum lead encontrado</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Data
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Nome
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Contato
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Curso
                    </th>
                    <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 md:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(lead.data_submissao).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {lead.nome}
                      </td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {lead.telefone}
                      </td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {lead.curso || '-'}
                      </td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap align-middle">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            lead.status
                          )}`}
                        >
                          {getStatusBadgeLabel(lead.status)}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-4 align-middle min-w-[9rem] text-right">
                        <ActionsForLead lead={lead} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !submitting && setDialogOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar ação?</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja marcar este lead como {pendingLabel}?
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
