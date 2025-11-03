export function track(event: string, payload?: Record<string, any>) {
  const body = JSON.stringify({ event, payload, ts: Date.now() });
  const url = '/api/telemetry';

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    const ok = navigator.sendBeacon(url, blob);
    if (ok) return;
  }

  // Fallback
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}
