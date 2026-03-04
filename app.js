// ─── SUPABASE ─────────────────────────────────────────────
const SUPABASE_URL = 'https://nkebjgfsihtgyiicwcav.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZWJqZ2ZzaWh0Z3lpaWN3Y2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODgyNTEsImV4cCI6MjA4Nzk2NDI1MX0.X-GuLalKegE7qeemNTCHJzNmv8nam4CNKEQF6xoiFus';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── EMAILJS ──────────────────────────────────────────────
// 1. Sign up free at https://emailjs.com
// 2. Add an email service (Gmail/Outlook) → note the Service ID
// 3. Create a template with variables: {{to_email}}, {{to_name}},
//    {{event_name}}, {{confirmed_time}}, {{organizer_name}}, {{event_description}}
// 4. Copy your Public Key from Account > API Keys
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
emailjs.init(EMAILJS_PUBLIC_KEY);

let confirmedBestKey = null;

// ─── USER COLORS ──────────────────────────────────────────
const USER_COLORS = [
  '#c8f564', '#f5a623', '#64b5f6', '#f06292',
  '#a5d6a7', '#e8c55a', '#ce93d8', '#4dd0e1', '#ffab76', '#aed581'
];

function buildUserColorMap(responses) {
  const map = {};
  responses.forEach((r, i) => { map[r.name] = USER_COLORS[i % USER_COLORS.length]; });
  return map;
}

// ─── AUTH ─────────────────────────────────────────────────
let currentUser = null;
let authMode = 'signin';

function updateHeaderAuth() {
  const emailEl = document.getElementById('header-user-email');
  const signOutBtn = document.getElementById('btn-sign-out');
  const tagline = document.getElementById('header-tagline');
  if (currentUser) {
    emailEl.textContent = currentUser.email;
    emailEl.style.display = 'block';
    signOutBtn.style.display = 'inline-flex';
    tagline.style.display = 'none';
  } else {
    emailEl.style.display = 'none';
    signOutBtn.style.display = 'none';
    tagline.style.display = 'block';
  }
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showNotif('Please fill in all fields'); return; }
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) showNotif(error.message);
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showNotif('Please fill in all fields'); return; }
  if (password.length < 6) { showNotif('Password must be at least 6 characters'); return; }
  const { error } = await db.auth.signUp({ email, password });
  if (error) showNotif(error.message);
  else showNotif('Check your email to confirm your account!', 5000);
}

async function signOut() {
  await db.auth.signOut();
}

async function signInWithGoogle() {
  await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

function toggleAuthMode() {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  if (authMode === 'signup') {
    document.getElementById('login-title-accent').textContent = 'account.';
    document.getElementById('login-sub').textContent = 'Join to start scheduling with your friends.';
    document.getElementById('btn-auth-submit').textContent = 'Sign up →';
    document.getElementById('btn-auth-submit').onclick = signUp;
    document.getElementById('btn-auth-toggle').textContent = 'Already have an account?';
  } else {
    document.getElementById('login-title-accent').textContent = 'back.';
    document.getElementById('login-sub').textContent = 'Sign in to create and manage your events.';
    document.getElementById('btn-auth-submit').textContent = 'Sign in →';
    document.getElementById('btn-auth-submit').onclick = signIn;
    document.getElementById('btn-auth-toggle').textContent = 'Create account';
  }
}

let initialAuthDone = false;

db.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;
  updateHeaderAuth();
  if (event === 'SIGNED_IN') {
    db.from('profiles').upsert({ id: currentUser.id, email: currentUser.email }, { onConflict: 'id' });
    if (!initialAuthDone) {
      initialAuthDone = true;
      const redirect = sessionStorage.getItem('whenfree_redirect');
      sessionStorage.removeItem('whenfree_redirect');
      if (redirect) { location.hash = redirect; }
      else { loadHome(); }
    }
  } else if (event === 'SIGNED_OUT') {
    initialAuthDone = false;
    showView('login');
  }
});

// ─── MY EVENTS (local tracking) ───────────────────────────
const MY_EVENTS_KEY = 'whenfree_my_events';
function getMyEventIds() { return JSON.parse(localStorage.getItem(MY_EVENTS_KEY) || '[]'); }
function addMyEventId(id) {
  const ids = getMyEventIds();
  if (!ids.includes(id)) { ids.push(id); localStorage.setItem(MY_EVENTS_KEY, JSON.stringify(ids)); }
}
function removeMyEventId(id) {
  localStorage.setItem(MY_EVENTS_KEY, JSON.stringify(getMyEventIds().filter(i => i !== id)));
}

// Map Supabase column names → app internal format
function mapEvent(row, responses = []) {
  return {
    id: row.id,
    name: row.name,
    desc: row.description || '',
    location: row.location || '',
    from: row.date_from,
    to: row.date_to,
    tStart: row.time_start,
    tEnd: row.time_end,
    responses: responses.map(r => ({ name: r.name, slots: Array.isArray(r.slots) ? r.slots : [] }))
  };
}

// ─── LOCATION ─────────────────────────────────────────────
function suggestLocation(inputId) {
  const val = document.getElementById(inputId).value.trim();
  const query = val ? encodeURIComponent(val) : 'restaurants+near+me';
  window.open(`https://www.google.com/maps/search/${query}/`, '_blank', 'noopener');
}

function setLocationDisplay(prefix, location) {
  const wrapper = document.getElementById(`${prefix}-event-location`);
  const text = document.getElementById(`${prefix}-location-text`);
  const link = document.getElementById(`${prefix}-location-link`);
  if (location) {
    text.textContent = location;
    link.href = `https://www.google.com/maps/search/${encodeURIComponent(location)}/`;
    wrapper.style.display = 'block';
  } else {
    wrapper.style.display = 'none';
  }
}

// ─── ROUTING ──────────────────────────────────────────────
let currentEventId = null;

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
}

// ─── DRAG SELECT ──────────────────────────────────────────
let _drag = null;

function attachDragSelect(containerId, slots) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Mouse
  container.addEventListener('mousedown', e => {
    const cell = e.target.closest('.time-cell');
    if (!cell || cell.classList.contains('readonly')) return;
    e.preventDefault();
    _drag = { adding: !slots.has(cell.dataset.key), slots };
    applyCell(cell, cell.dataset.key, _drag.adding, slots);
    document.addEventListener('mouseup', () => { _drag = null; }, { once: true });
  });
  container.addEventListener('mouseover', e => {
    if (!_drag) return;
    const cell = e.target.closest('.time-cell');
    if (!cell || cell.classList.contains('readonly')) return;
    applyCell(cell, cell.dataset.key, _drag.adding, _drag.slots);
  });

  // Touch
  container.addEventListener('touchstart', e => {
    const cell = e.target.closest('.time-cell');
    if (!cell || cell.classList.contains('readonly')) return;
    e.preventDefault();
    _drag = { adding: !slots.has(cell.dataset.key), slots };
    applyCell(cell, cell.dataset.key, _drag.adding, slots);
  }, { passive: false });
  container.addEventListener('touchmove', e => {
    if (!_drag) return;
    e.preventDefault();
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const cell = el && el.closest('.time-cell');
    if (!cell || cell.classList.contains('readonly')) return;
    applyCell(cell, cell.dataset.key, _drag.adding, _drag.slots);
  }, { passive: false });
  container.addEventListener('touchend', () => { _drag = null; });
}

function applyCell(el, key, adding, slots) {
  if (adding) { slots.add(key); el.classList.add('selected'); }
  else { slots.delete(key); el.classList.remove('selected'); }
}

function showNotif(msg, duration = 2500) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ─── SLOT TOOLTIP ─────────────────────────────────────────
let _tooltipTimer = null;

function showSlotTooltip(names, rect) {
  const t = document.getElementById('slot-tooltip');
  if (!t || !names) return;
  t.textContent = names;
  const left = Math.max(5, Math.min(rect.left, window.innerWidth - 170));
  t.style.left = left + 'px';
  if (rect.top > 60) {
    t.style.top = (rect.top - 8) + 'px';
    t.style.transform = 'translateY(-100%)';
  } else {
    t.style.top = (rect.bottom + 8) + 'px';
    t.style.transform = 'translateY(0)';
  }
  t.classList.add('visible');
}

function hideSlotTooltip() {
  const t = document.getElementById('slot-tooltip');
  if (t) t.classList.remove('visible');
}

// Global delegation — works on all heatmaps without re-binding
document.addEventListener('mouseover', e => {
  const cell = e.target.closest('.time-cell.readonly[data-names]');
  if (cell) showSlotTooltip(cell.dataset.names, cell.getBoundingClientRect());
});
document.addEventListener('mouseout', e => {
  if (e.target.closest('.time-cell.readonly')) hideSlotTooltip();
});
document.addEventListener('click', e => {
  const cell = e.target.closest('.time-cell.readonly[data-names]');
  if (cell) {
    showSlotTooltip(cell.dataset.names, cell.getBoundingClientRect());
    clearTimeout(_tooltipTimer);
    _tooltipTimer = setTimeout(hideSlotTooltip, 2500);
  } else if (!e.target.closest('#slot-tooltip')) {
    hideSlotTooltip();
  }
});

// ─── TIME HELPERS ─────────────────────────────────────────
function timeSlots(startTime, endTime) {
  const [sh] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const slots = [];
  for (let h = sh; h <= eh; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    if (h < eh || em >= 30) slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots;
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')}${ampm}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getDatesInRange(from, to) {
  const dates = [];
  let d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function buildSlotKey(date, time) { return `${date}|${time}`; }

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── TIME SELECT POPULATION ───────────────────────────────
function populateTimeSelects() {
  const s = document.getElementById('evt-time-start');
  const e = document.getElementById('evt-time-end');
  s.innerHTML = ''; e.innerHTML = '';
  for (let h = 6; h <= 23; h++) {
    ['00', '30'].forEach(m => {
      const val = `${String(h).padStart(2,'0')}:${m}`;
      const label = formatTime(val);
      s.innerHTML += `<option value="${val}">${label}</option>`;
      e.innerHTML += `<option value="${val}">${label}</option>`;
    });
  }
  s.value = '09:00';
  e.value = '23:30';
}

populateTimeSelects();

// Set default dates
const today = new Date();
const oneMonth = new Date(today);
oneMonth.setDate(oneMonth.getDate() + 30);
document.getElementById('evt-from').value = today.toISOString().split('T')[0];
document.getElementById('evt-to').value = oneMonth.toISOString().split('T')[0];

// ─── CREATOR AVAILABILITY GRID ────────────────────────────
let creatorSlots = new Set();

function renderCreateGrid() {
  const from = document.getElementById('evt-from').value;
  const to = document.getElementById('evt-to').value;
  const tStart = document.getElementById('evt-time-start').value;
  const tEnd = document.getElementById('evt-time-end').value;

  if (!from || !to || from > to || tStart >= tEnd) return;

  const section = document.getElementById('create-grid-section');
  section.style.display = 'block';
  creatorSlots = new Set();

  const dates = getDatesInRange(from, to);
  const slots = timeSlots(tStart, tEnd);

  let html = '<div class="time-grid">';
  html += '<div class="time-grid-header"><div style="width:50px; flex-shrink:0;"></div>';
  dates.forEach(d => { html += `<div class="day-label">${formatDate(d)}</div>`; });
  html += '</div>';

  slots.forEach(time => {
    html += `<div class="time-row"><div class="time-label">${formatTime(time)}</div>`;
    dates.forEach(date => {
      const key = buildSlotKey(date, time);
      html += `<div class="time-cell" data-key="${key}"></div>`;
    });
    html += '</div>';
  });

  html += '</div>';
  document.getElementById('create-grid').innerHTML = html;
  attachDragSelect('create-grid', creatorSlots);
}

['evt-from', 'evt-to', 'evt-time-start', 'evt-time-end'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderCreateGrid);
});

renderCreateGrid();

// ─── CREATE EVENT ─────────────────────────────────────────
async function createNewEvent() {
  const name = document.getElementById('evt-name').value.trim();
  const creatorName = document.getElementById('evt-creator-name').value.trim();
  const desc = document.getElementById('evt-desc').value.trim();
  const from = document.getElementById('evt-from').value;
  const to = document.getElementById('evt-to').value;
  const tStart = document.getElementById('evt-time-start').value;
  const tEnd = document.getElementById('evt-time-end').value;

  if (!name) { showNotif('Please enter an event name'); return; }
  if (!creatorName) { showNotif('Please enter your name'); return; }
  if (!from || !to) { showNotif('Please select a date range'); return; }
  if (from > to) { showNotif('End date must be after start date'); return; }
  if (tStart >= tEnd) { showNotif('End time must be after start time'); return; }
  if (!creatorSlots.size) { showNotif('Please mark at least one time slot'); return; }

  const location = document.getElementById('evt-location').value.trim();
  const id = 'evt_' + Date.now();
  const { error } = await db.from('events').insert({
    id, name, description: desc, location,
    date_from: from, date_to: to,
    time_start: tStart, time_end: tEnd,
    user_id: currentUser.id
  });

  if (error) { showNotif('Error creating event: ' + error.message); return; }

  await db.from('responses').insert({
    event_id: id,
    name: creatorName,
    slots: [...creatorSlots],
    user_id: currentUser.id
  });

  addMyEventId(id);
  showDashboard(id);
}

// ─── HOME ──────────────────────────────────────────────────
async function loadHome() {
  history.replaceState(null, '', window.location.pathname);
  showView('home');
  const [{ data: myEvents }, { data: myResponses }] = await Promise.all([
    db.from('events').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
    db.from('responses').select('event_id').eq('user_id', currentUser.id)
  ]);

  const inviteIds = [...new Set((myResponses || []).map(r => r.event_id))];
  let myInvites = [];
  if (inviteIds.length) {
    const { data } = await db.from('events').select('*').in('id', inviteIds);
    myInvites = (data || []).filter(e => e.user_id !== currentUser.id);
  }

  renderHomeEvents(myEvents || [], myInvites);
}

function renderHomeEvents(myEvents, myInvites) {
  document.getElementById('home-my-events').innerHTML = myEvents.length
    ? myEvents.map(e => `
      <div class="response-item" style="cursor:pointer;" onclick="showDashboard('${e.id}')">
        <div>
          <div class="response-name">${escHtml(e.name)}</div>
          <div class="response-slots">${formatDate(e.date_from)} – ${formatDate(e.date_to)}</div>
        </div>
        <span style="color:var(--muted); font-size:0.8rem;">→</span>
      </div>`).join('')
    : '<div class="empty-state" style="padding:1.5rem;">No events yet</div>';

  document.getElementById('home-my-invites').innerHTML = myInvites.length
    ? myInvites.map(e => `
      <div class="response-item" style="cursor:pointer;" onclick="showRespondView('${e.id}')">
        <div>
          <div class="response-name">${escHtml(e.name)}</div>
          <div class="response-slots">${formatDate(e.date_from)} – ${formatDate(e.date_to)}</div>
        </div>
        <span style="color:var(--muted); font-size:0.8rem;">→</span>
      </div>`).join('')
    : '<div class="empty-state" style="padding:1.5rem;">No invites yet</div>';
}

// ─── DASHBOARD ────────────────────────────────────────────
async function showDashboard(id) {
  currentEventId = id;

  const [{ data: row, error }, { data: responses }] = await Promise.all([
    db.from('events').select('*').eq('id', id).single(),
    db.from('responses').select('*').eq('event_id', id).order('created_at')
  ]);

  if (error || !row) { loadHome(); return; }

  const evt = mapEvent(row, responses || []);
  const myResponse = (responses || []).find(r => r.user_id === currentUser.id) || null;

  document.getElementById('dash-event-name').textContent = evt.name;
  document.getElementById('dash-event-desc').textContent =
    evt.desc || `${formatDate(evt.from)} – ${formatDate(evt.to)} · ${formatTime(evt.tStart)} – ${formatTime(evt.tEnd)}`;
  setLocationDisplay('dash', evt.location);

  const shareUrl = window.location.origin + window.location.pathname + '#respond/' + id;
  document.getElementById('share-url-text').textContent = shareUrl;

  renderResponses(evt);
  renderHeatmap(evt, null);
  renderDashMyGrid(evt, myResponse);
  populateDashTimeSelects(evt.tStart, evt.tEnd);
  document.getElementById('dash-edit-from').value = evt.from;
  document.getElementById('dash-edit-to').value = evt.to;
  document.getElementById('result-card').style.display = 'none';
  history.replaceState(null, '', window.location.pathname + '#dashboard/' + id);
  showView('dashboard');
}

function renderResponses(evt) {
  const container = document.getElementById('dash-responses');
  document.getElementById('dash-resp-count').textContent = evt.responses.length;

  if (!evt.responses.length) {
    container.innerHTML = '<div class="empty-state">Waiting for responses…<br><small>Share the link with your friends</small></div>';
    return;
  }

  const colorMap = buildUserColorMap(evt.responses);
  container.innerHTML = evt.responses.map(r => `
    <div class="response-item">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <div style="width:10px; height:10px; border-radius:50%; background:${colorMap[r.name]}; flex-shrink:0;"></div>
        <div>
          <div class="response-name">${escHtml(r.name)}</div>
          <div class="response-slots">${r.slots.length} slot${r.slots.length !== 1 ? 's' : ''} available</div>
        </div>
      </div>
      <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.65rem;"
        onclick="deleteResponse('${evt.id}','${escHtml(r.name)}')">Remove</button>
    </div>
  `).join('');
}

async function deleteResponse(evtId, name) {
  await db.from('responses').delete().eq('event_id', evtId).eq('name', name);
  showDashboard(evtId);
}

async function deleteEvent() {
  if (!confirm('Delete this event and all responses?')) return;
  await db.from('events').delete().eq('id', currentEventId);
  removeMyEventId(currentEventId);
  loadHome();
}

// ─── MY AVAILABILITY EDIT GRID (dashboard) ────────────────
let dashMySlots = new Set();
let dashMyResponseName = null;

function renderDashMyGrid(evt, myResponse) {
  dashMySlots = new Set(myResponse ? (Array.isArray(myResponse.slots) ? myResponse.slots : []) : []);
  dashMyResponseName = myResponse ? myResponse.name : null;
  renderDashMyGridHtml(evt.from, evt.to, evt.tStart, evt.tEnd);
}

function renderDashMyGridHtml(from, to, tStart, tEnd) {
  const dates = getDatesInRange(from, to);
  const slots = timeSlots(tStart, tEnd);

  let html = '<div class="time-grid">';
  html += '<div class="time-grid-header"><div style="width:50px; flex-shrink:0;"></div>';
  dates.forEach(d => { html += `<div class="day-label">${formatDate(d)}</div>`; });
  html += '</div>';

  slots.forEach(time => {
    html += `<div class="time-row"><div class="time-label">${formatTime(time)}</div>`;
    dates.forEach(date => {
      const key = buildSlotKey(date, time);
      const sel = dashMySlots.has(key) ? ' selected' : '';
      html += `<div class="time-cell${sel}" onclick="toggleDashMySlot(this,'${key}')"></div>`;
    });
    html += '</div>';
  });

  html += '</div>';
  document.getElementById('dash-my-grid').innerHTML = html;
  attachDragSelect('dash-my-grid', dashMySlots);
}

function previewDashMyGrid() {
  const from = document.getElementById('dash-edit-from').value;
  const to = document.getElementById('dash-edit-to').value;
  const tStart = document.getElementById('dash-edit-tstart').value;
  const tEnd = document.getElementById('dash-edit-tend').value;
  if (!from || !to || from > to || tStart >= tEnd) return;
  renderDashMyGridHtml(from, to, tStart, tEnd);
}

function toggleDashMySlot(el, key) {
  if (dashMySlots.has(key)) {
    dashMySlots.delete(key);
    el.classList.remove('selected');
  } else {
    dashMySlots.add(key);
    el.classList.add('selected');
  }
}

async function saveDashMySlots() {
  if (!dashMySlots.size) { showNotif('Please select at least one slot'); return; }

  const from = document.getElementById('dash-edit-from').value;
  const to = document.getElementById('dash-edit-to').value;
  const tStart = document.getElementById('dash-edit-tstart').value;
  const tEnd = document.getElementById('dash-edit-tend').value;

  if (from && to && from <= to && tStart < tEnd) {
    const { error: rangeErr } = await db.from('events').update({
      date_from: from, date_to: to, time_start: tStart, time_end: tEnd
    }).eq('id', currentEventId);
    if (rangeErr) { showNotif('Error updating range: ' + rangeErr.message); return; }
  }

  await db.from('responses').delete().eq('event_id', currentEventId).eq('user_id', currentUser.id);

  const name = dashMyResponseName || currentUser.email.split('@')[0];
  const { error } = await db.from('responses').insert({
    event_id: currentEventId,
    name,
    slots: [...dashMySlots],
    user_id: currentUser.id
  });

  if (error) { showNotif('Error saving: ' + error.message); return; }
  showNotif('Availability updated!');
  showDashboard(currentEventId);
}

// ─── DASHBOARD TIME SELECTS ───────────────────────────────
function populateDashTimeSelects(tStart, tEnd) {
  const s = document.getElementById('dash-edit-tstart');
  const e = document.getElementById('dash-edit-tend');
  s.innerHTML = ''; e.innerHTML = '';
  for (let h = 6; h <= 23; h++) {
    ['00', '30'].forEach(m => {
      const val = `${String(h).padStart(2,'0')}:${m}`;
      const label = formatTime(val);
      s.innerHTML += `<option value="${val}">${label}</option>`;
      e.innerHTML += `<option value="${val}">${label}</option>`;
    });
  }
  s.value = tStart;
  e.value = tEnd;
}

async function saveEventRange() {
  const from = document.getElementById('dash-edit-from').value;
  const to = document.getElementById('dash-edit-to').value;
  const tStart = document.getElementById('dash-edit-tstart').value;
  const tEnd = document.getElementById('dash-edit-tend').value;

  if (!from || !to || from > to) { showNotif('Invalid date range'); return; }
  if (tStart >= tEnd) { showNotif('End time must be after start time'); return; }

  const { error } = await db.from('events').update({
    date_from: from, date_to: to,
    time_start: tStart, time_end: tEnd
  }).eq('id', currentEventId);

  if (error) { showNotif('Error updating: ' + error.message); return; }
  showNotif('Date range updated!');
  showDashboard(currentEventId);
}

// ─── HEATMAP ──────────────────────────────────────────────
function renderHeatmap(evt, bestSlot, containerId = 'heatmap-grid') {
  const dates = getDatesInRange(evt.from, evt.to);
  const slots = timeSlots(evt.tStart, evt.tEnd);
  const total = evt.responses.length;
  const colorMap = buildUserColorMap(evt.responses);

  // Build per-slot user lists
  const slotUsers = {};
  evt.responses.forEach(r => {
    r.slots.forEach(s => {
      if (!slotUsers[s]) slotUsers[s] = [];
      slotUsers[s].push(r.name);
    });
  });

  let html = '<div class="time-grid">';
  html += '<div class="time-grid-header"><div style="width:50px; flex-shrink:0;"></div>';
  dates.forEach(d => { html += `<div class="day-label">${formatDate(d)}</div>`; });
  html += '</div>';

  slots.forEach(time => {
    html += `<div class="time-row"><div class="time-label">${formatTime(time)}</div>`;
    dates.forEach(date => {
      const key = buildSlotKey(date, time);
      const users = slotUsers[key] || [];
      const count = users.length;
      let cls = 'time-cell readonly';
      if (total > 0) {
        if (count === total) cls += ' full';
        else if (count > 0) cls += ' partial';
      }
      if (bestSlot && bestSlot === key) cls += ' best';
      const names = users.join(', ');
      const dataAttr = names ? ` data-names="${escHtml(names)}"` : '';
      html += `<div class="${cls}"${dataAttr}></div>`;
    });
    html += '</div>';
  });

  html += '</div>';

  // Per-user colored legend
  if (total > 0) {
    html += '<div class="user-legend">';
    evt.responses.forEach(r => {
      const c = colorMap[r.name];
      html += `<div class="legend-item"><div class="legend-swatch" style="background:${c}; border-color:${c};"></div>${escHtml(r.name)}</div>`;
    });
    html += '</div>';
  }

  document.getElementById(containerId).innerHTML = html;
}

// ─── FIND BEST TIME ───────────────────────────────────────
async function findBestTime() {
  const [{ data: row }, { data: responses }] = await Promise.all([
    db.from('events').select('*').eq('id', currentEventId).single(),
    db.from('responses').select('*').eq('event_id', currentEventId)
  ]);

  const evt = mapEvent(row, responses || []);

  if (!evt.responses.length) { showNotif('No responses yet!'); return; }

  const dates = getDatesInRange(evt.from, evt.to);
  const slots = timeSlots(evt.tStart, evt.tEnd);
  const total = evt.responses.length;

  const counts = {};
  evt.responses.forEach(r => {
    r.slots.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  });

  let bestKey = null, bestCount = 0;
  dates.forEach(date => {
    slots.forEach(time => {
      const key = buildSlotKey(date, time);
      const c = counts[key] || 0;
      if (c > bestCount) { bestCount = c; bestKey = key; }
    });
  });

  if (!bestKey || bestCount === 0) {
    document.getElementById('result-card').style.display = 'block';
    document.getElementById('best-time-display').textContent = 'No overlap';
    document.getElementById('best-time-sub').textContent = 'No common free slots found';
    document.getElementById('best-time-detail').textContent = '';
    document.getElementById('btn-confirm-time').style.display = 'none';
    return;
  }

  confirmedBestKey = bestKey;

  const [bestDate, bestTime] = bestKey.split('|');

  const btn = document.getElementById('btn-find');
  btn.innerHTML = '<span class="loading"></span> Analysing…';
  btn.disabled = true;

  const summary = evt.responses.map(r => {
    const daySlots = {};
    r.slots.forEach(s => {
      const [d, t] = s.split('|');
      if (!daySlots[d]) daySlots[d] = [];
      daySlots[d].push(formatTime(t));
    });
    const lines = Object.entries(daySlots)
      .map(([d, ts]) => `${formatDate(d)}: ${ts.join(', ')}`).join('; ');
    return `${r.name}: ${lines || 'no availability'}`;
  }).join('\n');

  let detail = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are a friendly scheduling assistant. Given availability data, write a short, warm 2-3 sentence summary about when the group can meet. Be specific about the best time and who can make it. Keep it casual and human, like a friend texting.',
        messages: [{
          role: 'user',
          content: `Event: "${evt.name}"\nRespondents: ${total}\nAvailability:\n${summary}\n\nBest slot found: ${formatDate(bestDate)} at ${formatTime(bestTime)} (${bestCount}/${total} people free)\n\nWrite a short friendly message summarising this.`
        }]
      })
    });
    const data = await res.json();
    detail = data.content?.[0]?.text || '';
  } catch (e) {
    detail = `${bestCount} out of ${total} people are free at this time.`;
  }

  btn.innerHTML = 'Find Best Time';
  btn.disabled = false;

  document.getElementById('result-card').style.display = 'block';
  document.getElementById('best-time-display').textContent = `${formatDate(bestDate)}, ${formatTime(bestTime)}`;
  document.getElementById('best-time-sub').textContent = `${bestCount} of ${total} people available`;
  document.getElementById('best-time-detail').textContent = detail;
  document.getElementById('btn-confirm-time').style.display = 'inline-flex';

  renderHeatmap(evt, bestKey);
}

// ─── RESPONDENTS LIST (shared view) ───────────────────────
function renderRespondents(responses, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!responses.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1.5rem;">No responses yet.</div>';
    return;
  }
  const colorMap = buildUserColorMap(responses);
  el.innerHTML = responses.map(r => `
    <div class="response-item">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <div style="width:10px; height:10px; border-radius:50%; background:${colorMap[r.name]}; flex-shrink:0;"></div>
        <div>
          <div class="response-name">${escHtml(r.name)}</div>
          <div class="response-slots">${r.slots.length} slot${r.slots.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── RESPOND VIEW ─────────────────────────────────────────
let selectedSlots = new Set();

async function showRespondView(id) {
  const [{ data: row, error }, { data: responses }] = await Promise.all([
    db.from('events').select('*').eq('id', id).single(),
    db.from('responses').select('*').eq('event_id', id)
  ]);

  if (error || !row) {
    document.getElementById('resp-event-name').textContent = 'Event not found';
    document.getElementById('resp-event-desc').textContent = '';
    showView('respond');
    return;
  }

  currentEventId = id;
  const evt = mapEvent(row, responses || []);
  document.getElementById('resp-event-name').textContent = evt.name;
  document.getElementById('resp-event-desc').textContent =
    evt.desc || `${formatDate(evt.from)} – ${formatDate(evt.to)} · ${formatTime(evt.tStart)} – ${formatTime(evt.tEnd)}`;
  setLocationDisplay('resp', evt.location);

  selectedSlots = new Set();
  renderRespondGrid(evt);
  renderHeatmap(evt, null, 'resp-heatmap-grid');
  renderRespondents(evt.responses, 'resp-people-list');
  showView('respond');
}

function renderRespondGrid(evt) {
  const dates = getDatesInRange(evt.from, evt.to);
  const slots = timeSlots(evt.tStart, evt.tEnd);

  let html = '<div class="time-grid">';
  html += '<div class="time-grid-header"><div style="width:50px; flex-shrink:0;"></div>';
  dates.forEach(d => { html += `<div class="day-label">${formatDate(d)}</div>`; });
  html += '</div>';

  slots.forEach(time => {
    html += `<div class="time-row"><div class="time-label">${formatTime(time)}</div>`;
    dates.forEach(date => {
      const key = buildSlotKey(date, time);
      html += `<div class="time-cell" data-key="${key}" onclick="toggleSlot(this,'${key}')"></div>`;
    });
    html += '</div>';
  });

  html += '</div>';
  document.getElementById('respond-grid').innerHTML = html;
  attachDragSelect('respond-grid', selectedSlots);
}

function toggleSlot(el, key) {
  if (selectedSlots.has(key)) {
    selectedSlots.delete(key);
    el.classList.remove('selected');
  } else {
    selectedSlots.add(key);
    el.classList.add('selected');
  }
}

async function submitResponse() {
  const name = document.getElementById('resp-name').value.trim();
  if (!name) { showNotif('Please enter your name'); return; }
  if (!selectedSlots.size) { showNotif('Please select at least one time slot'); return; }

  await db.from('responses').delete().eq('event_id', currentEventId).ilike('name', name);

  const { error } = await db.from('responses').insert({
    event_id: currentEventId,
    name,
    slots: [...selectedSlots],
    user_id: currentUser?.id || null
  });

  if (error) { showNotif('Error submitting: ' + error.message); return; }

  document.getElementById('submitted-name').textContent = name;
  showView('submitted');
}

// ─── COPY LINK ────────────────────────────────────────────
function copyLink() {
  const url = document.getElementById('share-url-text').textContent;
  navigator.clipboard.writeText(url).then(() => showNotif('Link copied!'));
}

// ─── ROUTING VIA HASH ─────────────────────────────────────
function handleHash(isInitial = false) {
  const hash = location.hash.slice(1);
  if (!currentUser) {
    if (hash) sessionStorage.setItem('whenfree_redirect', hash);
    showView('login');
    return;
  }
  if (hash.startsWith('respond/')) {
    showRespondView(hash.slice(8));
  } else if (hash.startsWith('dashboard/')) {
    showDashboard(hash.slice(10));
  } else if (hash === 'create') {
    showView('create');
    renderCreateGrid();
  } else if (hash === '' || isInitial) {
    loadHome();
  }
}

window.addEventListener('hashchange', () => handleHash(false));

db.auth.getSession().then(({ data: { session } }) => {
  currentUser = session?.user || null;
  updateHeaderAuth();
  handleHash(true);
});

// ─── CONFIRM TIME MODAL ───────────────────────────────────
function openConfirmModal() {
  if (!confirmedBestKey) return;
  const [bestDate, bestTime] = confirmedBestKey.split('|');
  document.getElementById('modal-confirmed-time').textContent = `${formatDate(bestDate)}, ${formatTime(bestTime)}`;
  document.getElementById('modal-confirmed-event').textContent =
    document.getElementById('dash-event-name').textContent;
  document.getElementById('modal-results').innerHTML = '';
  document.getElementById('modal-duration').value = '60';
  document.getElementById('modal-custom-field').style.display = 'none';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('open');
}

function toggleCustomDuration() {
  const sel = document.getElementById('modal-duration');
  document.getElementById('modal-custom-field').style.display =
    sel.value === 'custom' ? 'block' : 'none';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('modal-overlay').classList.remove('open');
});

// ─── GOOGLE CALENDAR LINK BUILDER ─────────────────────────
function buildGCalUrl(name, dateStr, timeStr, durationMins, desc) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, min] = timeStr.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, min);
  const end = new Date(start.getTime() + durationMins * 60000);
  const fmt = d => {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  };
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: name,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: desc || ''
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

async function generateCalendarLinks() {
  const durationSel = document.getElementById('modal-duration');
  let durationMins = parseInt(durationSel.value);
  if (durationSel.value === 'custom') {
    durationMins = parseInt(document.getElementById('modal-custom-mins').value) || 0;
    if (durationMins < 5) { showNotif('Please enter a duration of at least 5 minutes'); return; }
  }

  const [bestDate, bestTime] = confirmedBestKey.split('|');
  const resultsEl = document.getElementById('modal-results');
  resultsEl.innerHTML = '<div style="color:var(--muted); font-size:0.8rem;">Building links…</div>';

  const [{ data: row }, { data: responses }] = await Promise.all([
    db.from('events').select('*').eq('id', currentEventId).single(),
    db.from('responses').select('*').eq('event_id', currentEventId).not('user_id', 'is', null)
  ]);

  const calUrl = buildGCalUrl(row.name, bestDate, bestTime, durationMins, row.description || '');

  const linkBlock = `
    <div style="margin-bottom:1.5rem;">
      <div style="font-size:0.65rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.5rem;">Calendar Link</div>
      <div class="cal-link-url">${escHtml(calUrl)}</div>
      <button class="btn btn-primary" data-url="${escHtml(calUrl)}" onclick="copyCalLinkFromBtn(this)"
        style="margin-top:0.75rem; width:100%;">Copy Link for Everyone</button>
    </div>`;

  if (!responses || !responses.length) {
    resultsEl.innerHTML = linkBlock +
      '<p style="color:var(--muted); font-size:0.75rem;">No logged-in respondents found — share the link above manually.</p>';
    return;
  }

  const userIds = [...new Set(responses.map(r => r.user_id))];
  const { data: profiles } = await db.from('profiles').select('id, email').in('id', userIds);
  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p.email; });

  const respondentRows = responses.map(r => {
    const email = profileMap[r.user_id] || '(no email on file)';
    return `
      <div class="response-item">
        <div>
          <div class="response-name">${escHtml(r.name)}</div>
          <div class="response-slots">${escHtml(email)}</div>
        </div>
        <button class="btn btn-secondary" data-url="${escHtml(calUrl)}" onclick="copyCalLinkFromBtn(this)"
          style="padding:0.4rem 0.8rem; font-size:0.65rem; white-space:nowrap;">Copy Link</button>
      </div>`;
  }).join('');

  resultsEl.innerHTML = linkBlock +
    `<div style="font-size:0.65rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.75rem;">
      Respondents (${responses.length})
    </div>
    ${respondentRows}`;
}

function copyCalLinkFromBtn(btn) {
  const url = btn.dataset.url;
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}
