import type { User } from '@avalon/contracts';
import { api } from './api';

export interface WebHandoffIntent { ticket: string | null; cleanUrl: string }

/** The short-lived credential stays in the fragment, never in a request URL or storage. */
export function readWebHandoff(href: string): WebHandoffIntent | null {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!fragment.has('avalon-handoff')) return null;
  const values = fragment.getAll('avalon-handoff');
  fragment.delete('avalon-handoff');
  url.hash = fragment.toString();
  return {
    ticket: values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : null,
    cleanUrl: url.pathname + url.search + url.hash,
  };
}

export function exchangeWebHandoff(ticket: string, request = api) {
  return request<{ user: User; roomId?: string | null }>('/sessions/web-handoff/exchange', { ticket });
}
