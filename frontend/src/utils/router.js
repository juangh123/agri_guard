import { useCallback, useMemo, useSyncExternalStore } from 'react';

const listeners = new Set();

function getHref() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

let currentHref = getHref();

function emitLocationChange() {
  currentHref = getHref();
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  const handlePopState = () => emitLocationChange();
  if (listeners.size === 0) {
    window.addEventListener('popstate', handlePopState);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('popstate', handlePopState);
    }
  };
}

export function navigate(to, { replace = false, state = null } = {}) {
  const url = new URL(to, window.location.origin);
  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  if (nextHref === currentHref) return;

  window.history[replace ? 'replaceState' : 'pushState'](state, '', nextHref);
  emitLocationChange();

  if (!url.hash && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, () => currentHref, () => '/');

  return useMemo(() => {
    const url = new URL(href, window.location.origin);
    return {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    };
  }, [href]);
}

export function useNavigate() {
  return navigate;
}

export function useSearchParams() {
  const { pathname, search } = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

  const setSearchParams = useCallback((nextParams, { replace = false } = {}) => {
    const params = nextParams instanceof URLSearchParams
      ? nextParams
      : new URLSearchParams(nextParams);
    const query = params.toString();
    navigate(`${pathname}${query ? `?${query}` : ''}`, { replace });
  }, [pathname]);

  return [searchParams, setSearchParams];
}
