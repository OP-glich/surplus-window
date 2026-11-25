export function session() { return JSON.parse(sessionStorage.getItem('sw.session') || 'null'); }
export async function api(path, { method='GET', body, key, token=session()?.token } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (key) headers['Idempotency-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api' + path, { method, headers, body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store' });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || 'Request failed.'), { code:data?.error?.code, status:response.status });
  return { status:response.status, data };
}
export function feedback(text, error=false) {
  const el = document.querySelector('#feedback');
  el.textContent = text;
  el.classList.toggle('error', error);
}
export function element(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
const format = new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Windhoek', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
export const stamp = ms => format.format(ms);
