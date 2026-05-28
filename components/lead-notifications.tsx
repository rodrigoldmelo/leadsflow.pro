'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, Clock } from 'lucide-react';
import { toast } from 'sonner';

import type { Lead, User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LEAD_POLL_INTERVAL_MS = 30000;

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type LeadNotificationsProps = {
  user: User | null;
  onOpenLead?: (lead: Lead) => void;
};

export function LeadNotifications({ user, onOpenLead }: LeadNotificationsProps) {
  const [latestLeads, setLatestLeads] = useState<Lead[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>('default');
  const latestLeadRef = useRef<{ id: string; submittedAt: string } | null>(null);
  const notifiedLeadIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const router = useRouter();

  const playLeadSound = useCallback(() => {
    if (typeof window === 'undefined') return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;

    void context.resume().then(() => {
      const gain = context.createGain();
      const first = context.createOscillator();
      const second = context.createOscillator();
      const now = context.currentTime;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      first.frequency.setValueAtTime(880, now);
      second.frequency.setValueAtTime(1175, now + 0.16);
      first.connect(gain);
      second.connect(gain);
      gain.connect(context.destination);
      first.start(now);
      first.stop(now + 0.18);
      second.start(now + 0.18);
      second.stop(now + 0.44);
    });
  }, []);

  const openLead = useCallback(
    (lead: Lead) => {
      if (onOpenLead) {
        onOpenLead(lead);
        return;
      }

      router.push(`/leads?lead=${encodeURIComponent(lead.id)}`);
    },
    [onOpenLead, router]
  );

  const notifyNewLead = useCallback(
    (lead: Lead) => {
      playLeadSound();
      toast.success(`Novo lead: ${lead.nome}`, {
        description: `Recebido às ${formatTime(lead.data_submissao)}`,
        action: {
          label: 'Abrir',
          onClick: () => openLead(lead),
        },
      });

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        const notification = new window.Notification('Novo lead recebido', {
          body: `${lead.nome} · ${formatTime(lead.data_submissao)}`,
          tag: lead.id,
        });
        notification.onclick = () => {
          window.focus();
          openLead(lead);
          notification.close();
        };
      }
    },
    [openLead, playLeadSound]
  );

  const fetchLatestLeads = useCallback(async () => {
    if (!user?.unidade) {
      setLatestLeads([]);
      return [];
    }

    const params = new URLSearchParams({
      unidade: user.unidade,
      page: '1',
      pageSize: '5',
    });
    const response = await fetch(`/api/leads?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Falha ao buscar últimos leads.');
    }

    const rows = (data.leads || []) as Lead[];
    setLatestLeads(rows);
    return rows;
  }, [user]);

  const requestNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Este navegador não suporta notificações.');
      return;
    }

    const permission =
      window.Notification.permission === 'default'
        ? await window.Notification.requestPermission()
        : window.Notification.permission;

    setNotificationPermission(permission);
    const enabled = permission === 'granted';
    setNotificationsEnabled(enabled);
    localStorage.setItem('leadNotificationsEnabled', enabled ? 'true' : 'false');

    if (enabled) {
      playLeadSound();
      toast.success('Notificações ativadas.');
    } else {
      toast.error('Permissão de notificação não foi concedida.');
    }
  }, [playLeadSound]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('Notification' in window) {
      setNotificationPermission(window.Notification.permission);
      setNotificationsEnabled(
        window.Notification.permission === 'granted' &&
          localStorage.getItem('leadNotificationsEnabled') === 'true'
      );
    }
  }, []);

  useEffect(() => {
    if (!user?.unidade) return;

    let cancelled = false;

    async function checkLatestLeads() {
      try {
        const rows = await fetchLatestLeads();
        const latest = rows[0];

        if (!latest || cancelled) return;

        const previous = latestLeadRef.current;
        if (!previous) {
          latestLeadRef.current = {
            id: latest.id,
            submittedAt: latest.data_submissao,
          };
          return;
        }

        const previousTime = Date.parse(previous.submittedAt);
        const newLeads = rows
          .filter((lead) => {
            const submittedAt = Date.parse(lead.data_submissao);
            return submittedAt > previousTime && !notifiedLeadIdsRef.current.has(lead.id);
          })
          .sort((a, b) => Date.parse(a.data_submissao) - Date.parse(b.data_submissao));

        if (newLeads.length > 0) {
          for (const lead of newLeads) {
            notifiedLeadIdsRef.current.add(lead.id);
            if (notificationsEnabled) {
              notifyNewLead(lead);
            }
          }
          latestLeadRef.current = {
            id: latest.id,
            submittedAt: latest.data_submissao,
          };
        } else if (Date.parse(latest.data_submissao) > previousTime) {
          latestLeadRef.current = {
            id: latest.id,
            submittedAt: latest.data_submissao,
          };
        }
      } catch (error) {
        console.warn('[lead-notifications] Falha ao verificar novos leads:', error);
      }
    }

    void checkLatestLeads();
    const interval = window.setInterval(checkLatestLeads, LEAD_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchLatestLeads, notificationsEnabled, notifyNewLead, user]);

  const buttonLabel = notificationsEnabled
    ? 'Notificações ativas'
    : notificationPermission === 'denied'
      ? 'Notificações bloqueadas'
      : 'Notificações';

  return (
    <DropdownMenu onOpenChange={(open) => open && void fetchLatestLeads()}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" aria-label="Abrir notificações">
          {notificationsEnabled ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          <span className="hidden sm:inline">{buttonLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] max-w-[20rem] p-2">
        <div className="px-2 py-2">
          <div className="text-sm font-semibold text-gray-950">Últimos leads</div>
          <div className="mt-0.5 text-xs text-gray-500">
            Atualizado automaticamente a cada 30 segundos.
          </div>
        </div>

        <DropdownMenuSeparator />

        {!notificationsEnabled ? (
          <>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void requestNotifications();
              }}
            >
              <BellRing className="size-4 text-blue-600" />
              Ativar alertas com som
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {latestLeads.length > 0 ? (
          latestLeads.map((lead) => (
            <DropdownMenuItem
              key={lead.id}
              className="items-start gap-2 py-2"
              onSelect={() => openLead(lead)}
            >
              <Clock className="mt-0.5 size-4 shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-950">
                  {lead.nome || 'Lead sem nome'}
                </span>
                <span className="block text-xs text-gray-500">
                  {formatTime(lead.data_submissao)}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-4 text-sm text-gray-500">Nenhum lead recente encontrado.</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
