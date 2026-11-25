import { api, feedback } from './common.js';
const form = document.querySelector('#login');
const select = document.querySelector('#identity');
const enter = document.querySelector('#enter');
let identities = [];
function choices() {
  const role = form.elements.role.value;
  const group = identities.filter(i => i.role === role);
  select.replaceChildren(...group.map(i => new Option(i.name, i.id)));
  enter.textContent = 'Open ' + role + ' desk';
  enter.disabled = group.length === 0;
}
form.addEventListener('change', e => { if (e.target.name === 'role') choices(); });
form.addEventListener('submit', async e => {
  e.preventDefault();
  enter.disabled = true;
  try {
    const { data } = await api('/session', { method:'POST', body:{ identity:select.value } });
    sessionStorage.setItem('sw.session',JSON.stringify(data));
    location.assign('/' + data.actor.role + '.html');
  } catch (error) { feedback(error.message, true); enter.disabled = false; }
});
try { identities = (await api('/identities')).data; choices(); }
catch (error) { feedback('Could not load demo identities. Refresh to retry. ' + error.message, true); }
