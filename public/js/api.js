export async function getConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Config request failed (${res.status})`);
  }
  return res.json();
}

export async function loadData() {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
  return res.json();
}

export async function saveData(data) {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save data (${res.status})`);
  return res.json();
}
