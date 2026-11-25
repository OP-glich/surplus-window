import { api, session, element as el, feedback, stamp } from './common.js';

const account = session();
const role = document.querySelector('main').dataset.role;
if (!account || account.actor.role !== role) {
  location.replace('/');
} else {
  start().catch(error => {
    if (error.status === 401) { sessionStorage.removeItem('sw.session'); location.replace('/'); }
    else feedback(error.message, true);
  });
}

async function start() {
  const actor = (await api('/session')).data;
  document.querySelector('#org').textContent = actor.name;
  document.querySelector('#signout').onclick = async () => {
    try {
      await api('/session', { method:'DELETE' });
      sessionStorage.removeItem('sw.session');
      location.assign('/');
    } catch (err) { feedback(err.message, true); }
  };
  const storage = 'sw.action.' + actor.id;
  const cards = new Map();
  let pending = JSON.parse(sessionStorage.getItem(storage) || 'null');
  let busy = false;
  let generation = 0;
  let lastHolds = '';
  let latest;
  const button = (label, fn, cls='secondary') => {
    const b = el('button', label, cls);
    b.type = 'button';
    b.onclick = fn;
    return b;
  };
  function save(value) {
    pending = value;
    if (value) sessionStorage.setItem(storage, JSON.stringify(value));
    else sessionStorage.removeItem(storage);
    const area = document.querySelector('#uncertain');
    area.replaceChildren();
    if (pending && !busy) area.append(el('p','Confirmation is pending for “' + pending.label + '”.'),
      button('Retry this action', () => run(pending)));
  }
  function mutation(path, body, label, success) {
    if (busy) return;
    if (pending) { feedback('Retry the pending action before starting another.', true); return; }
    return run({ path, body, key:crypto.randomUUID(), label, success });
  }
  async function race(id) {
    if (busy || pending) { feedback('Finish the pending action first.', true); return; }
    const row = latest.listings.find(x => x.id === id);
    if (!row || row.available !== 5) {
      feedback('Prepare the race with an open 20-portion listing. Reserve 15 as Kula so exactly five remain.', true);
      return;
    }
    await run({ race:id, label:'Two-kitchen race', requests:[
      { actor:'hope', name:'Hope Table Kitchen (B)', key:crypto.randomUUID() },
      { actor:'eagle', name:'Eagle Street Meals (C)', key:crypto.randomUUID() }
    ] });
  }
  async function runRace(intent) {
    const unresolved = intent.requests.filter(entry => !entry.result);
    const tokens = await Promise.all(unresolved.map(async entry =>
      (await api('/session', { method:'POST', body:{ identity:entry.actor } })).data.token));
    // Launch both real requests before awaiting either response. The tab token stays intact.
    const results = await Promise.allSettled(unresolved.map(async (entry, index) => {
      try {
        const response = await api('/listings/' + intent.race + '/reservations', {
          method:'POST', token:tokens[index], key:entry.key, body:{ quantity:5 }
        });
        entry.result = response.status + ' · held 5 (reservation #' + response.data.id + ')';
      } catch (err) {
        if (!err.status || err.status >= 500) throw err;
        entry.result = err.status + ' · ' + err.code + ' · ' + err.message;
      }
    }));
    const lines = intent.requests.map(entry => entry.name + ' — ' + (entry.result || 'awaiting confirmation')).join('\n');
    const output = cards.get(intent.race)?.querySelector('.race-result');
    if (output) output.textContent = lines;
    if (results.some(r => r.status === 'rejected')) throw new Error('One race response was lost. Retry to retrieve the recorded result.');
    return lines;
  }
  async function run(intent) {
    if (busy) return;
    busy = true;
    ++generation;
    save(intent);
    toggleButtons(true);
    try {
      let message = intent.success;
      if (intent.race) message = await runRace(intent);
      else {
        const { data } = await api(intent.path, { method:'POST', body:intent.body, key:intent.key });
        if (intent.path === '/listings') {
          document.querySelector('#create').reset();
          document.querySelector('.create').open = false;
        }
        if (data.state === 'HELD') message += ' Reservation #' + data.id + '.';
      }
      save(null);
      feedback(message);
    } catch (error) {
      if (error.status && error.status < 500) save(null);
      feedback(error.message, true);
    } finally {
      busy = false;
      save(pending);
      toggleButtons(false);
      await refresh();
    }
  }
  function toggleButtons(value) {
    for (const b of document.querySelectorAll('.desk button, #signout')) b.disabled = value;
  }
  function reservationLine(hold, donor) {
    const line = el('div', undefined, donor ? 'row' : 'hold');
    const info = el('div');
    info.append(el('strong', donor ? hold.kitchen : hold.description),
      el('small', '#' + hold.id + ' · ' + hold.quantity + ' ' + hold.unit + ' · ' + hold.state));
    if (!donor) info.append(el('small', hold.donor + ' · ' + hold.address));
    if (hold.state === 'HELD') {
      info.append(el('small','Hold ends ' + stamp(hold.expires_at) + ' · Africa/Windhoek'));
      const op = donor ? 'handover' : 'cancel';
      const label = donor ? 'Confirm handover' : 'Cancel hold';
      line.append(info,button(label, () => mutation('/reservations/' + hold.id + '/' + op, {}, label,
        donor ? 'Handover confirmed.' : 'Hold cancelled. The portions are available again.')));
    } else line.append(info);
    return line;
  }

  function makeCard(row, demo) {
    const card = el('article', undefined, 'card');
    // Only static markup is interpolated here. All database values use textContent.
    card.innerHTML = '<div class="card-body"><p class="card-meta"></p><div class="card-title"><h3></h3><span class="chip"></span></div><p class="pickup"></p><div class="metrics"></div><div class="bookings"></div></div><div class="actions"></div>';
    const actions = card.querySelector('.actions');
    if (role === 'kitchen') {
      const form = el('form', undefined, 'reserve');
      const label = el('label', 'Whole quantity');
      const qty = el('input');
      qty.type='number'; qty.min='1'; qty.step='1'; qty.required=true; qty.value='1';
      label.append(qty);
      const send = el('button','Reserve','primary');
      form.append(label,send);
      form.onsubmit = e => {
        e.preventDefault();
        mutation('/listings/' + row.id + '/reservations', { quantity:qty.valueAsNumber },'Reserve portions','Portions reserved.');
      };
      const output = el('div',undefined,'race-result');
      output.setAttribute('role','status');
      actions.append(form,button('Demo: race for the last five',() => race(row.id)),output);
    } else {
      const history = el('details', undefined,'ledger');
      history.append(el('summary','Inventory history'),el('ol'));
      card.querySelector('.card-body').append(history);
      if (demo) actions.append(button('Jump to pickup deadline', () => mutation('/demo/listings/' + row.id + '/deadline',{},
        'Jump to pickup deadline','Demo clock advanced. All due listings have been reconciled.')),
        el('small','Advances the shared demo clock for all tabs and listings.'));
    }
    return card;
  }
  function updateCard(row, now, demo) {
    let card = cards.get(row.id);
    if (!card) {
      card = makeCard(row, demo);
      cards.set(row.id,card);
      document.querySelector('#listings').append(card);
    }
    const open = row.closed_at !== null ? 'Closed' : now < row.pickup_start ? 'Upcoming' : 'Open for pickup';
    const version = JSON.stringify([row,open]);
    if (version === card.lastVersion) return;
    card.lastVersion = version;
    card.querySelector('.card-meta').textContent = row.donor + ' · Listing #' + row.id + ' · ' + row.total + ' ' + row.unit + ' listed';
    card.querySelector('h3').textContent = row.description;
    const chip = card.querySelector('.chip');
    chip.textContent = open;
    chip.classList.toggle('closed',row.closed_at !== null);
    card.querySelector('.pickup').textContent = row.address + '\n' + stamp(row.pickup_start) + ' – ' + stamp(row.pickup_end) + ' · Africa/Windhoek';
    const metrics = [['Available',row.available],['Held',row.held],['Collected',row.collected],['Written off',row.written_off]];
    const grid = card.querySelector('.metrics');
    grid.setAttribute('aria-label','Inventory in ' + row.unit + ', total ' + row.total);
    grid.replaceChildren(...metrics.map(([name,n]) => {
      const m = el('div'); m.append(el('strong',String(n)),el('span',name)); return m;
    }));
    if (role === 'donor') {
      card.querySelector('.bookings').replaceChildren(el('h3','Reservations'),
        ...(row.reservations.length ? row.reservations.map(h => reservationLine({...h,unit:row.unit},true)) : [el('small','No reservations yet.')]));
      card.querySelector('.ledger ol').replaceChildren(...row.events.map(event => el('li',stamp(event.at) + ' · ' + event.kind +
        ' · ' + event.quantity + ' ' + row.unit + ' · available change ' + (event.available_delta>0?'+':'') + event.available_delta)));
      card.querySelector('.actions').hidden = !demo || row.closed_at !== null;
    }
  }
  async function refresh() {
    if (busy) return;
    const pass = ++generation;
    try {
      const [board, holds] = await Promise.all([api('/listings'), role==='kitchen' ? api('/reservations') : null]);
      if (pass !== generation || busy) return;
      latest = board.data;
      document.querySelector('#clock-label').textContent = latest.demo ? 'Demo clock' : 'Local time';
      document.querySelector('#clock').textContent = stamp(latest.now);
      document.querySelector('#count').textContent = latest.listings.length + (latest.listings.length === 1 ? ' listing' : ' listings');
      for (const [id,card] of cards) {
        if (!latest.listings.some(row => row.id === id)) { card.remove(); cards.delete(id); }
      }
      const container = document.querySelector('#listings');
      container.querySelector('.empty')?.remove();
      for (const row of latest.listings) updateCard(row,latest.now,latest.demo);
      if (!cards.size) container.append(el('p',role==='donor'?'Create a listing to open a pickup window.':'There are no open pickup windows.', 'empty'));
      if (holds && JSON.stringify(holds.data) !== lastHolds) {
        lastHolds = JSON.stringify(holds.data);
        document.querySelector('#holds').replaceChildren(...(holds.data.length ? holds.data.map(h => reservationLine(h,false)) : [el('p','Your reserved portions will appear here.','empty')]));
      }
    } catch (err) {
      if (err.status === 401) { sessionStorage.removeItem('sw.session'); location.replace('/'); }
      else feedback('Could not refresh availability. ' + err.message, true);
    }
  }
  if (role === 'donor') {
    const form = document.querySelector('#create');
    form.onsubmit = e => {
      e.preventDefault();
      const f = new FormData(form);
      // Contemporary Windhoek pickup dates use UTC+02:00 regardless of the browser's own zone.
      mutation('/listings',{ description:f.get('description'),unit:f.get('unit'),quantity:Number(f.get('quantity')),
        address:f.get('address'),pickup_start:Date.parse(f.get('start') + '+02:00'),pickup_end:Date.parse(f.get('end') + '+02:00') },
      'Publish listing','Listing published.');
    };
  }
  save(pending);
  await refresh();
  setInterval(refresh, 3000);
}
