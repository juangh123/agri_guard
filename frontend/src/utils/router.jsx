import React, { useCallback, useEffect } from 'react';
import { navigate } from './router';

export function Link({
  to,
  replace = false,
  onClick,
  children,
  target,
  ...props
}) {
  const handleClick = useCallback((event) => {
    onClick?.(event);

    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.altKey
      || event.ctrlKey
      || event.shiftKey
      || target
    ) {
      return;
    }

    const url = new URL(to, window.location.origin);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(to, { replace });
  }, [onClick, replace, target, to]);

  return <a href={to} target={target} onClick={handleClick} {...props}>{children}</a>;
}

export function Redirect({ to, replace = true }) {
  useEffect(() => {
    navigate(to, { replace });
  }, [replace, to]);

  return null;
}
