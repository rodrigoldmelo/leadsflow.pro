'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';

const LAST_ACTIVITY_KEY = 'leadsflow:lastActivityAt';
const LOGOUT_EVENT_KEY = 'leadsflow:logoutAt';
const DEFAULT_TIMEOUT_MINUTES = 30;

function getTimeoutMs() {
  const raw = process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

function hasActiveSession() {
  return Boolean(localStorage.getItem('user'));
}

export function AutoLogout() {
  const pathname = usePathname();
  const router = useRouter();
  const timeoutMs = getTimeoutMs();
  const logoutTriggeredRef = useRef(false);

  useEffect(() => {
    if (pathname === '/login') return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const logout = (showMessage = true) => {
      if (logoutTriggeredRef.current) return;
      logoutTriggeredRef.current = true;

      localStorage.removeItem('user');
      localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));

      if (showMessage) {
        toast.info('Sessão encerrada por inatividade. Entre novamente para continuar.');
      }

      router.replace('/login');
    };

    const scheduleCheck = () => {
      if (timeoutId) clearTimeout(timeoutId);

      if (!hasActiveSession()) return;

      const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
      const elapsed = Date.now() - (Number.isFinite(lastActivity) ? lastActivity : Date.now());
      const remaining = Math.max(timeoutMs - elapsed, 0);

      timeoutId = setTimeout(() => {
        const latestActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
        const latestElapsed =
          Date.now() - (Number.isFinite(latestActivity) ? latestActivity : Date.now());

        if (latestElapsed >= timeoutMs) {
          logout();
          return;
        }

        scheduleCheck();
      }, remaining);
    };

    const recordActivity = () => {
      if (!hasActiveSession()) return;
      logoutTriggeredRef.current = false;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      scheduleCheck();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_EVENT_KEY && event.newValue) {
        logout(false);
      }

      if (event.key === LAST_ACTIVITY_KEY) {
        scheduleCheck();
      }
    };

    if (hasActiveSession() && !localStorage.getItem(LAST_ACTIVITY_KEY)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }

    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart', 'visibilitychange'];
    for (const eventName of events) {
      window.addEventListener(eventName, recordActivity, { passive: true });
    }
    window.addEventListener('storage', onStorage);

    scheduleCheck();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      for (const eventName of events) {
        window.removeEventListener(eventName, recordActivity);
      }
      window.removeEventListener('storage', onStorage);
    };
  }, [pathname, router, timeoutMs]);

  return null;
}
