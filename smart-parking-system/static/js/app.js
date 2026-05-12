/* ═══════════════════════════════════════════════════════════
   SMART PARKING SYSTEM — app.js  v5  (v2.0 QR Complete)
   Author: C. Sree Harshith Reddy
═══════════════════════════════════════════════════════════ */

/* ── STATE ───────────────────────────────────────────────── */
let cameraStream    = null;
let cameraMode      = null;
let capturedPlate   = null;
let pollTimer       = null;
let selectedType    = 'car';
let assignMode      = 'auto';
let chosenSlot      = null;
let latestLayout    = {};
let latestConfig    = [];
let latestFloorCfg  = null;
let isMultiFloor    = false;
let floorMode       = 'single';
let activeFloorTab  = null;
let pickerFloorTab  = null;

/* ── v2.0 QR STATE (declared at top — fixes ReferenceError) */
let qrScanInterval  = null;
let qrScanActive    = false;
let scannedTicket   = null;

/* ── CAMERA OCR STATE ────────────────────────────────────── */
let scanInterval    = null;
let lastDetected    = null;
let scanCooldown    = false;

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  checkStatus();
  addRow();
});

/* ══════════════════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════════════════ */
function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('liveClock').textContent = now.toTimeString().slice(0, 8);
    document.getElementById('liveDate').textContent  = now.toDateString();
  }
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════════════════
   FLOOR MODE TOGGLE (setup)
══════════════════════════════════════════════════════════ */
function setFloorMode(mode) {
  floorMode = mode;
  document.getElementById('fmodeSingle').classList.toggle('active', mode === 'single');
  document.getElementById('fmodeMulti').classList.toggle('active',  mode === 'multi');
  document.getElementById('singleFloorConfig').classList.toggle('hidden', mode === 'multi');
  document.getElementById('multiFloorConfig').classList.toggle('hidden',  mode === 'single');
  updatePreview();
}

/* ══════════════════════════════════════════════════════════
   SINGLE-FLOOR ROW BUILDER
══════════════════════════════════════════════════════════ */
function addRow(builderId) {
  const bId     = builderId || 'rowBuilder';
  const builder = document.getElementById(bId);
  const rowCount = builder.children.length;
  if (rowCount >= 26) { showToast('Maximum 26 rows allowed', 'error'); return; }

  const rowLetter = String.fromCharCode(65 + rowCount);
  const div = document.createElement('div');
  div.className   = 'row-item';
  div.dataset.row = rowLetter;
  div.innerHTML = `
    <span class="row-label">ROW ${rowLetter}</span>
    <label>Slots</label>
    <div class="slot-stepper">
      <button type="button" onclick="stepSlot(this,-1)">−</button>
      <input type="number" min="1" max="20" value="4" oninput="updatePreview()" />
      <button type="button" onclick="stepSlot(this,1)">+</button>
    </div>
    <button class="btn-remove-row" onclick="removeRow(this,'${bId}')" title="Remove row">✕</button>
  `;
  builder.appendChild(div);
  updatePreview();
}

function stepSlot(btn, delta) {
  const input = btn.closest('.slot-stepper').querySelector('input');
  input.value = Math.min(20, Math.max(1, (parseInt(input.value) || 1) + delta));
  updatePreview();
}

function removeRow(btn, builderId) {
  const bId     = builderId || 'rowBuilder';
  const builder = document.getElementById(bId);
  if (builder.children.length <= 1) { showToast('At least one row is required', 'error'); return; }
  btn.closest('.row-item').remove();
  relabelRows(builder);
  updatePreview();
}

function relabelRows(builder) {
  Array.from(builder.children).forEach((item, i) => {
    const letter = String.fromCharCode(65 + i);
    item.dataset.row = letter;
    const lbl = item.querySelector('.row-label');
    if (lbl) lbl.textContent = `ROW ${letter}`;
  });
}

function getRowConfigFromBuilder(builderId) {
  const bId = builderId || 'rowBuilder';
  return Array.from(document.querySelectorAll(`#${bId} .row-item input`))
    .map(inp => Math.max(1, Math.min(20, parseInt(inp.value) || 1)));
}

/* ══════════════════════════════════════════════════════════
   MULTI-FLOOR BUILDER
══════════════════════════════════════════════════════════ */
let floorCount = 0;

function addFloor() {
  const builder = document.getElementById('floorBuilder');
  if (builder.children.length >= 10) { showToast('Maximum 10 floors allowed', 'error'); return; }

  floorCount++;
  const fid  = `floor_${floorCount}`;
  const card = document.createElement('div');
  card.className   = 'floor-card';
  card.dataset.fid = fid;

  const defaultNames = ['Ground', '1st Floor', '2nd Floor', '3rd Floor', 'Basement',
                        'Level 1', 'Level 2', 'Level 3', 'Terrace', 'Rooftop'];
  const defaultName  = defaultNames[builder.children.length] || `Floor ${builder.children.length + 1}`;

  card.innerHTML = `
    <div class="floor-card-header">
      <span class="floor-number-badge">FLOOR ${builder.children.length + 1}</span>
      <input class="floor-name-input" type="text" placeholder="e.g. Ground, 1st Floor, B1"
             value="${defaultName}" oninput="updatePreview()" />
      <button class="btn-remove-floor" onclick="removeFloor(this)" title="Remove floor">✕</button>
    </div>
    <div class="floor-card-body">
      <div class="floor-rows-label">ROW CONFIGURATION FOR THIS FLOOR</div>
      <div class="floor-row-builder" id="rows_${fid}"></div>
      <button class="btn-add-floor-row" onclick="addFloorRow('${fid}')">+ ADD ROW</button>
    </div>
  `;
  builder.appendChild(card);
  addFloorRow(fid);
  renumberFloorCards();
  updatePreview();
}

function addFloorRow(fid) {
  const builderId = `rows_${fid}`;
  const builder   = document.getElementById(builderId);
  if (!builder) return;
  const rowCount  = builder.children.length;
  if (rowCount >= 26) { showToast('Max 26 rows per floor', 'error'); return; }

  const letter = String.fromCharCode(65 + rowCount);
  const div    = document.createElement('div');
  div.className   = 'floor-row-item row-item';
  div.dataset.row = letter;
  div.innerHTML = `
    <span class="row-label">ROW ${letter}</span>
    <label>Slots</label>
    <div class="slot-stepper">
      <button type="button" onclick="stepSlot(this,-1)">−</button>
      <input type="number" min="1" max="20" value="4" oninput="updatePreview()" />
      <button type="button" onclick="stepSlot(this,1)">+</button>
    </div>
    <button class="btn-remove-row" onclick="removeFloorRow(this,'${builderId}')" title="Remove row">✕</button>
  `;
  builder.appendChild(div);
  updatePreview();
}

function removeFloorRow(btn, builderId) {
  const builder = document.getElementById(builderId);
  if (builder.children.length <= 1) { showToast('At least one row per floor', 'error'); return; }
  btn.closest('.floor-row-item').remove();
  relabelRows(builder);
  updatePreview();
}

function removeFloor(btn) {
  const builder = document.getElementById('floorBuilder');
  if (builder.children.length <= 1) { showToast('At least one floor required', 'error'); return; }
  btn.closest('.floor-card').remove();
  renumberFloorCards();
  updatePreview();
}

function renumberFloorCards() {
  Array.from(document.querySelectorAll('.floor-card')).forEach((card, i) => {
    const badge = card.querySelector('.floor-number-badge');
    if (badge) badge.textContent = `FLOOR ${i + 1}`;
  });
}

function getFloorConfig() {
  const cards  = document.querySelectorAll('.floor-card');
  const result = [];
  cards.forEach(card => {
    const fid  = card.dataset.fid;
    const name = card.querySelector('.floor-name-input').value.trim() || `Floor ${result.length + 1}`;
    const rows = getRowConfigFromBuilder(`rows_${fid}`);
    result.push({ name, rows });
  });
  return result;
}

/* ══════════════════════════════════════════════════════════
   PREVIEW
══════════════════════════════════════════════════════════ */
function updatePreview() {
  const grid  = document.getElementById('previewGrid');
  const stats = document.getElementById('previewStats');
  grid.innerHTML = '';

  if (floorMode === 'single') {
    const config = getRowConfigFromBuilder('rowBuilder');
    config.forEach((slots, i) => {
      const letter = String.fromCharCode(65 + i);
      const row    = document.createElement('div');
      row.className = 'preview-row';
      row.innerHTML = `<span class="preview-row-label">${letter}</span>`;
      for (let s = 0; s < slots; s++) {
        const cell = document.createElement('div');
        cell.className = 'preview-slot';
        cell.style.animationDelay = `${s * 25}ms`;
        row.appendChild(cell);
      }
      grid.appendChild(row);
    });
    const total = config.reduce((a, b) => a + b, 0);
    stats.innerHTML = `<span>${config.length}</span> rows · <span>${total}</span> total slots`;
  } else {
    const floors = getFloorConfig();
    let   total  = 0;
    floors.forEach(floor => {
      const floorLabel = document.createElement('div');
      floorLabel.style.cssText = `font-family:var(--font-display);font-size:0.58rem;color:var(--gold);margin:6px 0 4px;letter-spacing:0.08em;`;
      floorLabel.textContent   = `▸ ${floor.name}`;
      grid.appendChild(floorLabel);
      floor.rows.forEach((slots, i) => {
        const letter = String.fromCharCode(65 + i);
        const row    = document.createElement('div');
        row.className = 'preview-row';
        row.innerHTML = `<span class="preview-row-label">${letter}</span>`;
        for (let s = 0; s < slots; s++) {
          const cell = document.createElement('div');
          cell.className = 'preview-slot';
          cell.style.animationDelay = `${s * 20}ms`;
          row.appendChild(cell);
        }
        grid.appendChild(row);
        total += slots;
      });
    });
    stats.innerHTML = `<span>${floors.length}</span> floors · <span>${total}</span> total slots`;
  }
}

/* ══════════════════════════════════════════════════════════
   SUBMIT SETUP
══════════════════════════════════════════════════════════ */
async function submitSetup() {
  const errEl = document.getElementById('setupError');
  errEl.textContent = '';

  let body = {};

  if (floorMode === 'multi') {
    const floors = getFloorConfig();
    if (!floors.length) { errEl.textContent = 'Add at least one floor.'; return; }
    for (const fl of floors) {
      if (!fl.name) { errEl.textContent = 'Each floor must have a name.'; return; }
      if (!fl.rows.length) { errEl.textContent = `Floor "${fl.name}" needs at least one row.`; return; }
    }
    body = { multi_floor: true, floor_config: floors };
  } else {
    const config = getRowConfigFromBuilder('rowBuilder');
    if (!config.length) { errEl.textContent = 'Add at least one row.'; return; }
    body = { multi_floor: false, row_config: config };
  }

  try {
    const res  = await fetch('/api/setup', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('setupOverlay').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      showToast(data.message, 'success');
      startPolling();
    } else {
      errEl.textContent = data.message;
    }
  } catch (e) { errEl.textContent = 'Could not connect to server.'; }
}

/* ══════════════════════════════════════════════════════════
   STATUS POLLING
══════════════════════════════════════════════════════════ */
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollStatus();
  pollTimer = setInterval(pollStatus, 3000);
}

async function checkStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (data.setup) {
      document.getElementById('setupOverlay').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      applyStatus(data);
      startPolling();
    }
  } catch (e) {}
}

async function pollStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (data.setup) applyStatus(data);
  } catch (e) {}
}

function applyStatus(data) {
  const stats = data.stats;
  latestLayout   = data.layout;
  latestConfig   = data.row_config;
  latestFloorCfg = data.floor_config;
  isMultiFloor   = data.multi_floor || false;

  document.getElementById('hstatCapacity').querySelector('.hstat-val').textContent = stats.capacity;
  document.getElementById('hstatOccupied').querySelector('.hstat-val').textContent = stats.occupied;
  document.getElementById('hstatEmpty').querySelector('.hstat-val').textContent    = stats.empty;
  document.getElementById('hstatQueue').querySelector('.hstat-val').textContent    = stats.queue_length;

  const pct  = stats.occupancy_pct;
  const fill = document.getElementById('occBarFill');
  fill.style.width = pct + '%';
  fill.className   = 'occ-bar-fill' + (pct >= 85 ? ' full' : pct >= 60 ? ' warn' : '');
  document.getElementById('occBarLabel').textContent = Math.round(pct) + '% OCCUPIED';

  document.getElementById('revenueAmount').textContent = '₹' + data.revenue.toFixed(0);

  if (isMultiFloor && latestFloorCfg) {
    setupFloorTabs(latestFloorCfg, data.floor_stats);
    setupFloorPrefSelect(latestFloorCfg);
    updateFloorSummary(data.floor_stats);
    document.getElementById('floorPrefGroup').classList.remove('hidden');
  } else {
    document.getElementById('floorTabs').classList.add('hidden');
    document.getElementById('floorSummary').classList.add('hidden');
    document.getElementById('floorPrefGroup').classList.add('hidden');
  }

  renderBlueprint(data.row_config, data.layout, data.floor_config);
  renderQueue(data.queue);

  if (!document.getElementById('slotPickerOverlay').classList.contains('hidden')) {
    renderSlotPickerForFloor(pickerFloorTab);
  }

  if (chosenSlot && latestLayout[chosenSlot] && latestLayout[chosenSlot].status === 'occupied') {
    clearChosenSlot();
    showToast(`Slot ${chosenSlot} was just taken — please choose again`, 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   FLOOR TABS
══════════════════════════════════════════════════════════ */
function setupFloorTabs(floorCfg, floorStats) {
  const tabBar  = document.getElementById('floorTabs');
  tabBar.classList.remove('hidden');
  const existing = tabBar.querySelectorAll('.floor-tab');
  if (existing.length === floorCfg.length) {
    floorCfg.forEach((fl, i) => {
      const fs  = floorStats ? floorStats[i] : null;
      const occ = existing[i].querySelector('.tab-occ');
      if (occ && fs) occ.textContent = `${fs.occupied}/${fs.capacity}`;
    });
    return;
  }
  tabBar.innerHTML = '';
  floorCfg.forEach((fl, i) => {
    const fs  = floorStats ? floorStats[i] : null;
    const tab = document.createElement('button');
    tab.className     = 'floor-tab' + (i === 0 ? ' active' : '');
    tab.dataset.floor = fl.name;
    tab.innerHTML     = `${fl.name}<span class="tab-occ">${fs ? `${fs.occupied}/${fs.capacity}` : ''}</span>`;
    tab.onclick       = () => switchFloorTab(fl.name);
    tabBar.appendChild(tab);
  });
  if (!activeFloorTab) activeFloorTab = floorCfg[0].name;
}

function switchFloorTab(floorName) {
  activeFloorTab = floorName;
  document.querySelectorAll('.floor-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.floor === floorName);
  });
  renderBlueprint(latestConfig, latestLayout, latestFloorCfg);
}

function updateFloorSummary(floorStats) {
  if (!floorStats) return;
  const bar = document.getElementById('floorSummary');
  bar.classList.remove('hidden');
  bar.innerHTML = '';
  floorStats.forEach(fs => {
    const pct  = fs.capacity > 0 ? Math.round((fs.occupied / fs.capacity) * 100) : 0;
    const card = document.createElement('div');
    card.className = 'floor-summary-card';
    card.innerHTML = `
      <div class="fsc-name">${fs.name}</div>
      <div class="fsc-bar-wrap">
        <div class="fsc-bar-fill ${pct >= 85 ? 'full' : pct >= 60 ? 'warn' : ''}" style="width:${pct}%"></div>
      </div>
      <div class="fsc-nums"><span>${fs.empty}</span> free · <span>${fs.occupied}</span> used</div>
    `;
    bar.appendChild(card);
  });
}

function setupFloorPrefSelect(floorCfg) {
  const sel = document.getElementById('floorPrefSelect');
  if (sel.options.length === floorCfg.length + 1) return;
  sel.innerHTML = '<option value="">Any floor (auto-assign)</option>';
  floorCfg.forEach(fl => {
    const opt       = document.createElement('option');
    opt.value       = fl.name;
    opt.textContent = fl.name;
    sel.appendChild(opt);
  });
}

/* ══════════════════════════════════════════════════════════
   BLUEPRINT RENDER
══════════════════════════════════════════════════════════ */
function renderBlueprint(rowConfig, layout, floorCfg) {
  const grid = document.getElementById('blueprintGrid');
  grid.innerHTML = '';

  if (isMultiFloor && floorCfg) {
    const targetFloor = activeFloorTab || floorCfg[0].name;
    const floor       = floorCfg.find(f => f.name === targetFloor);
    if (!floor) return;
    floor.rows.forEach((slotCount, ri) => {
      const letter = String.fromCharCode(65 + ri);
      const row    = document.createElement('div');
      row.className = 'blueprint-row';
      const tag = document.createElement('span');
      tag.className   = 'row-tag';
      tag.textContent = letter;
      row.appendChild(tag);
      for (let ci = 0; ci < slotCount; ci++) {
        const slotId   = `${targetFloor}-${letter}${ci + 1}`;
        const slotData = layout[slotId];
        const occupied = slotData && slotData.status === 'occupied';
        row.appendChild(buildSlotCell(slotId, occupied, slotData));
      }
      grid.appendChild(row);
    });
  } else {
    rowConfig.forEach((slotCount, ri) => {
      const letter = String.fromCharCode(65 + ri);
      const row    = document.createElement('div');
      row.className = 'blueprint-row';
      const tag = document.createElement('span');
      tag.className   = 'row-tag';
      tag.textContent = letter;
      row.appendChild(tag);
      for (let ci = 0; ci < slotCount; ci++) {
        const slotId   = `${letter}${ci + 1}`;
        const slotData = layout[slotId];
        const occupied = slotData && slotData.status === 'occupied';
        row.appendChild(buildSlotCell(slotId, occupied, slotData));
      }
      grid.appendChild(row);
    });
  }
}

function buildSlotCell(slotId, occupied, slotData) {
  const cell = document.createElement('div');
  cell.className = 'slot-cell' + (occupied ? ' occupied' : '');
  cell.title     = occupied
    ? `${slotId} — ${slotData.vehicle.number_plate} — click for details`
    : `${slotId} — Available — click to park here`;
  cell.onclick = () => openSlotPopup(slotId);
  const idSpan       = document.createElement('span');
  idSpan.className   = 'slot-id';
  idSpan.textContent = slotId.includes('-') ? slotId.split('-')[1] : slotId;
  const plateSpan       = document.createElement('span');
  plateSpan.className   = 'slot-plate';
  plateSpan.textContent = occupied ? slotData.vehicle.number_plate : '';
  cell.appendChild(idSpan);
  cell.appendChild(plateSpan);
  return cell;
}

/* ══════════════════════════════════════════════════════════
   QUEUE RENDER
══════════════════════════════════════════════════════════ */
function renderQueue(queue) {
  const list  = document.getElementById('queueList');
  const badge = document.getElementById('queueCount');
  badge.textContent = queue.length;
  if (!queue.length) {
    list.innerHTML = '<div class="empty-state">No vehicles waiting</div>';
    return;
  }
  list.innerHTML = '';
  queue.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.innerHTML = `
      <span class="queue-pos">#${i + 1}</span>
      <span class="queue-plate">${v.number_plate}</span>
      <span class="queue-type">${v.vehicle_type}</span>
    `;
    list.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════════
   VEHICLE TYPE + ASSIGN MODE
══════════════════════════════════════════════════════════ */
function selectType(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedType = btn.dataset.type;
}

function setAssignMode(mode) {
  assignMode = mode;
  document.getElementById('assignAuto').classList.toggle('active',   mode === 'auto');
  document.getElementById('assignManual').classList.toggle('active', mode === 'manual');
  if (mode === 'auto') {
    clearChosenSlot();
  } else {
    openSlotPicker();
  }
}

function setAssignModeQuiet(mode) {
  assignMode = mode;
  document.getElementById('assignAuto').classList.toggle('active',   mode === 'auto');
  document.getElementById('assignManual').classList.toggle('active', mode === 'manual');
}

/* ══════════════════════════════════════════════════════════
   SLOT PICKER
══════════════════════════════════════════════════════════ */
function openSlotPicker() {
  const plate = document.getElementById('parkPlate').value.trim().toUpperCase() || '—';
  document.getElementById('spiPlate').textContent = plate;
  document.getElementById('spiSlot').textContent  = chosenSlot || 'NONE';
  document.getElementById('confirmSlotBtn').disabled = !chosenSlot;

  const tabsEl = document.getElementById('pickerFloorTabs');
  if (isMultiFloor && latestFloorCfg) {
    tabsEl.classList.remove('hidden');
    tabsEl.innerHTML = '';
    latestFloorCfg.forEach((fl, i) => {
      const tab = document.createElement('button');
      tab.className     = 'picker-floor-tab' + (i === 0 ? ' active' : '');
      tab.dataset.floor = fl.name;
      tab.textContent   = fl.name;
      tab.onclick       = () => switchPickerFloor(fl.name);
      tabsEl.appendChild(tab);
    });
    pickerFloorTab = latestFloorCfg[0].name;
  } else {
    tabsEl.classList.add('hidden');
    pickerFloorTab = null;
  }

  renderSlotPickerForFloor(pickerFloorTab);
  document.getElementById('slotPickerOverlay').classList.remove('hidden');
}

function switchPickerFloor(floorName) {
  pickerFloorTab = floorName;
  document.querySelectorAll('.picker-floor-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.floor === floorName);
  });
  renderSlotPickerForFloor(floorName);
}

function renderSlotPickerForFloor(floorName) {
  const grid = document.getElementById('slotPickerGrid');
  grid.innerHTML = '';
  if (isMultiFloor && latestFloorCfg && floorName) {
    const floor = latestFloorCfg.find(f => f.name === floorName);
    if (!floor) return;
    floor.rows.forEach((slotCount, ri) => {
      const letter = String.fromCharCode(65 + ri);
      const row    = document.createElement('div');
      row.className = 'sp-row';
      const tag = document.createElement('span');
      tag.className   = 'sp-row-label';
      tag.textContent = letter;
      row.appendChild(tag);
      for (let ci = 0; ci < slotCount; ci++) {
        const slotId = `${floorName}-${letter}${ci + 1}`;
        row.appendChild(buildPickerCell(slotId));
      }
      grid.appendChild(row);
    });
  } else {
    latestConfig.forEach((slotCount, ri) => {
      const letter = String.fromCharCode(65 + ri);
      const row    = document.createElement('div');
      row.className = 'sp-row';
      const tag = document.createElement('span');
      tag.className   = 'sp-row-label';
      tag.textContent = letter;
      row.appendChild(tag);
      for (let ci = 0; ci < slotCount; ci++) {
        const slotId = `${letter}${ci + 1}`;
        row.appendChild(buildPickerCell(slotId));
      }
      grid.appendChild(row);
    });
  }
}

function buildPickerCell(slotId) {
  const slotData = latestLayout[slotId];
  const occupied = slotData && slotData.status === 'occupied';
  const isChosen = slotId === chosenSlot;
  const cell = document.createElement('div');
  cell.className = occupied ? 'sp-cell taken' : isChosen ? 'sp-cell selected' : 'sp-cell available';
  const displayId       = slotId.includes('-') ? slotId.split('-')[1] : slotId;
  const idEl            = document.createElement('span');
  idEl.className        = 'sp-id';
  idEl.textContent      = displayId;
  const plateEl         = document.createElement('span');
  plateEl.className     = 'sp-plate';
  plateEl.textContent   = occupied ? slotData.vehicle.number_plate : 'FREE';
  cell.appendChild(idEl);
  cell.appendChild(plateEl);
  if (!occupied) cell.onclick = () => selectPickerSlot(slotId);
  return cell;
}

function selectPickerSlot(slotId) {
  chosenSlot = slotId;
  document.getElementById('spiSlot').textContent = slotId;
  document.getElementById('confirmSlotBtn').disabled = false;
  renderSlotPickerForFloor(pickerFloorTab);
}

function confirmSlotChoice() {
  if (!chosenSlot) return;
  document.getElementById('chosenSlotValue').textContent = chosenSlot;
  document.getElementById('chosenSlotDisplay').classList.remove('hidden');
  document.getElementById('slotPickerOverlay').classList.add('hidden');
  showToast(`Slot ${chosenSlot} selected`, 'info');
}

function closeSlotPicker() {
  document.getElementById('slotPickerOverlay').classList.add('hidden');
  if (!chosenSlot) {
    assignMode = 'auto';
    document.getElementById('assignAuto').classList.add('active');
    document.getElementById('assignManual').classList.remove('active');
  }
}

function clearChosenSlot() {
  chosenSlot = null;
  document.getElementById('chosenSlotDisplay').classList.add('hidden');
  const valEl = document.getElementById('chosenSlotValue');
  if (valEl) valEl.textContent = '—';
}

/* ══════════════════════════════════════════════════════════
   PARK VEHICLE
══════════════════════════════════════════════════════════ */
async function parkVehicle() {
  const plate = document.getElementById('parkPlate').value.trim().toUpperCase();
  const msgEl = document.getElementById('parkMsg');
  msgEl.textContent = '';
  msgEl.className   = 'form-msg';

  if (!plate) { setMsg(msgEl, 'Please enter a vehicle number.', 'error'); return; }

  const plateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$/;
  if (!plateRegex.test(plate)) {
    setMsg(msgEl, 'Invalid format. Use: AA00AA0000 (e.g. TS09AB1234)', 'error');
    return;
  }

  if (assignMode === 'manual' && !chosenSlot) {
    setMsg(msgEl, 'Please choose a slot from the picker first.', 'error');
    openSlotPicker(); return;
  }

  const body = { number_plate: plate, vehicle_type: selectedType };
  if (assignMode === 'manual' && chosenSlot) {
    body.preferred_slot = chosenSlot;
  } else if (isMultiFloor) {
    const selFloor = document.getElementById('floorPrefSelect').value;
    if (selFloor) body.preferred_floor = selFloor;
  }

  try {
    const res  = await fetch('/api/park', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { setMsg(msgEl, data.message, 'error'); return; }

    document.getElementById('parkPlate').value = '';
    clearChosenSlot();
    setAssignModeQuiet('auto');

    if (data.queued) {
      setMsg(msgEl, data.message, 'info');
      showToast('Added to waiting queue', 'info');
      showEntryReceipt(data, true);
    } else {
      const label = data.manual_slot
        ? `Parked at your chosen slot ${data.slot}`
        : `Auto-assigned to slot ${data.slot}`;
      setMsg(msgEl, label, 'success');
      if (data.nearly_full) showToast('⚠ Parking lot is nearly full!', 'info');
      showEntryReceipt(data, false);
    }
    pollStatus();
  } catch (e) { setMsg(msgEl, 'Server error. Try again.', 'error'); }
}

/* ══════════════════════════════════════════════════════════
   EXIT VEHICLE
══════════════════════════════════════════════════════════ */
async function exitVehicle() {
  const identifier = document.getElementById('exitIdentifier').value.trim().toUpperCase();
  const msgEl      = document.getElementById('exitMsg');
  msgEl.textContent = '';
  msgEl.className   = 'form-msg';

  if (!identifier) { setMsg(msgEl, 'Please enter a Ticket ID or Vehicle Number.', 'error'); return; }

  try {
    const res  = await fetch('/api/exit', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ identifier })
    });
    const data = await res.json();
    if (!data.success) { setMsg(msgEl, data.message, 'error'); return; }

    document.getElementById('exitIdentifier').value = '';
    setMsg(msgEl, `Exit processed — ₹${data.fee} charged`, 'success');
    showExitReceipt(data);

    if (data.queued_vehicle_parked) {
      showToast(
        `Queue: ${data.queued_vehicle_parked.number_plate} parked at ${data.queued_vehicle_parked.slot}`,
        'info'
      );
    }
    pollStatus();
  } catch (e) { setMsg(msgEl, 'Server error. Try again.', 'error'); }
}

/* ══════════════════════════════════════════════════════════
   RECEIPTS
══════════════════════════════════════════════════════════ */
function showEntryReceipt(data, queued) {
  document.getElementById('receiptIcon').textContent  = '🎫';
  document.getElementById('receiptTitle').textContent = queued ? 'QUEUE TICKET' : 'ENTRY TICKET';
  document.getElementById('receiptBody').innerHTML = `
    <div class="receipt-row">
      <span class="r-label">Vehicle Number</span>
      <span class="r-value">${data.number_plate}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Ticket ID</span>
      <span class="r-value">${data.ticket_id}</span>
    </div>
    ${queued ? `
    <div class="receipt-row">
      <span class="r-label">Queue Position</span>
      <span class="r-value">#${data.queue_position || '—'}</span>
    </div>` : `
    <div class="receipt-row">
      <span class="r-label">Assigned Slot</span>
      <span class="r-value">${data.slot}${data.manual_slot ? ' (your choice)' : ' (auto)'}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Entry Time</span>
      <span class="r-value">${data.entry_time}</span>
    </div>`}
  `;
  if (!queued && data.qr_data) {
    document.getElementById('qrReceiptSection').classList.remove('hidden');
    document.getElementById('qrTicketText').textContent = data.ticket_id;
    generateQRCode(data.qr_data);
  } else {
    document.getElementById('qrReceiptSection').classList.add('hidden');
  }
  document.getElementById('receiptOverlay').classList.remove('hidden');
}

function showExitReceipt(data) {
  document.getElementById('receiptIcon').textContent  = '💳';
  document.getElementById('receiptTitle').textContent = 'EXIT RECEIPT';
  const entry    = new Date(`1970-01-01T${data.entry_time}`);
  const exitT    = new Date(`1970-01-01T${data.exit_time}`);
  let   diffMins = Math.round((exitT - entry) / 60000);
  if (diffMins < 0) diffMins += 24 * 60;
  const durStr   = diffMins < 60 ? `${diffMins} min` : `${Math.floor(diffMins/60)}h ${diffMins%60}m`;
  document.getElementById('receiptBody').innerHTML = `
    <div class="receipt-row"><span class="r-label">Vehicle Number</span><span class="r-value">${data.number_plate}</span></div>
    <div class="receipt-row"><span class="r-label">Vehicle Type</span><span class="r-value">${data.vehicle_type.toUpperCase()}</span></div>
    <div class="receipt-row"><span class="r-label">Slot</span><span class="r-value">${data.slot}</span></div>
    <div class="receipt-row"><span class="r-label">Entry Time</span><span class="r-value">${data.entry_time}</span></div>
    <div class="receipt-row"><span class="r-label">Exit Time</span><span class="r-value">${data.exit_time}</span></div>
    <div class="receipt-row"><span class="r-label">Duration</span><span class="r-value">${durStr}</span></div>
    <div class="receipt-row total"><span class="r-label">AMOUNT CHARGED</span><span class="r-value">₹${data.fee}</span></div>
  `;
  document.getElementById('receiptOverlay').classList.remove('hidden');
}

function closeReceipt() { document.getElementById('receiptOverlay').classList.add('hidden'); }
function printReceipt() { window.print(); }

/* ══════════════════════════════════════════════════════════
   RESET
══════════════════════════════════════════════════════════ */
async function confirmReset() {
  const pin = prompt('Enter admin PIN to reset (default: 0000)');
  if (pin === null) return;
  if (pin !== '0000') { showToast('Incorrect PIN', 'error'); return; }
  try {
    const res  = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      document.getElementById('app').classList.add('hidden');
      document.getElementById('setupOverlay').classList.remove('hidden');
      document.getElementById('rowBuilder').innerHTML   = '';
      document.getElementById('floorBuilder').innerHTML = '';
      floorCount     = 0;
      floorMode      = 'single';
      activeFloorTab = null;
      pickerFloorTab = null;
      isMultiFloor   = false;
      latestLayout   = {};
      latestConfig   = [];
      latestFloorCfg = null;
      clearChosenSlot();
      setFloorMode('single');
      addRow();
      showToast('System reset', 'info');
    }
  } catch (e) { showToast('Reset failed', 'error'); }
}

/* ══════════════════════════════════════════════════════════
   SLOT POPUP
══════════════════════════════════════════════════════════ */
let popupSlotId      = null;
let popupVehicle     = null;
let durationInterval = null;
const RATES = { car: 30, bike: 15, truck: 60 };

function openSlotPopup(slotId) {
  const slotData = latestLayout[slotId];
  const occupied = slotData && slotData.status === 'occupied';
  popupSlotId  = slotId;
  popupVehicle = occupied ? slotData.vehicle : null;
  document.getElementById('popupOccupied').style.display = occupied ? 'block' : 'none';
  document.getElementById('popupEmpty').style.display    = occupied ? 'none'  : 'block';
  if (occupied) {
    const v = slotData.vehicle;
    const displayId = slotId.includes('-') ? slotId.split('-')[1] : slotId;
    document.getElementById('popupSlotId').textContent = displayId;
    document.getElementById('popupPlate').textContent  = v.number_plate;
    document.getElementById('popupType').textContent   = v.vehicle_type.toUpperCase();
    document.getElementById('popupTicket').textContent = v.ticket_id;
    const entryStr = v.entry_time.includes('T') ? v.entry_time.split('T')[1].slice(0, 8) : v.entry_time;
    document.getElementById('popupEntry').textContent = entryStr;
    if (durationInterval) clearInterval(durationInterval);
    function updateDuration() {
      const entryDate = new Date(v.entry_time);
      const now       = new Date();
      let   diffMins  = Math.floor((now - entryDate) / 60000);
      if (diffMins < 0) diffMins = 0;
      const hrs    = Math.floor(diffMins / 60);
      const mins   = diffMins % 60;
      document.getElementById('popupDuration').textContent = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      const rate      = RATES[v.vehicle_type] || 30;
      const billHours = Math.max(1, Math.ceil(diffMins / 60));
      document.getElementById('popupFee').textContent = `₹${billHours * rate}`;
    }
    updateDuration();
    durationInterval = setInterval(updateDuration, 30000);
  } else {
    const displayId = slotId.includes('-') ? slotId.split('-')[1] : slotId;
    document.getElementById('popupEmptySlotId').textContent = displayId;
  }
  document.getElementById('slotPopupOverlay').classList.remove('hidden');
}

function closeSlotPopup(event) {
  if (event && event.target !== document.getElementById('slotPopupOverlay')) return;
  if (durationInterval) { clearInterval(durationInterval); durationInterval = null; }
  document.getElementById('slotPopupOverlay').classList.add('hidden');
  popupSlotId  = null;
  popupVehicle = null;
}

function quickExit() {
  if (!popupVehicle) return;
  document.getElementById('exitIdentifier').value = popupVehicle.number_plate;
  closeSlotPopup();
  showToast(`Ready to exit ${popupVehicle.number_plate}`, 'info');
  document.getElementById('exitIdentifier').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('exitIdentifier').focus();
}

function quickPark() {
  if (!popupSlotId) return;
  chosenSlot = popupSlotId;
  document.getElementById('chosenSlotValue').textContent = popupSlotId;
  document.getElementById('chosenSlotDisplay').classList.remove('hidden');
  setAssignModeQuiet('manual');
  closeSlotPopup();
  showToast(`Slot ${popupSlotId} pre-selected`, 'info');
  document.getElementById('parkPlate').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('parkPlate').focus();
}

/* ══════════════════════════════════════════════════════════
   CAMERA — OCR FUNCTIONS
══════════════════════════════════════════════════════════ */
const PLATE_REGEX = /[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}/;
const PLATE_NOISE = ['INDIA', 'IND', 'BHARAT', 'BH', 'HSRP', 'INA', 'INIA', 'NDIA', 'INDO'];

function cleanOcrText(raw) {
  let text = raw.toUpperCase().replace(/\s+/g, '');
  PLATE_NOISE.forEach(word => { text = text.split(word).join(''); });
  return text.replace(/[^A-Z0-9]/g, '');
}

function extractBestPlate(raw) {
  const cleaned = cleanOcrText(raw);
  const matches = cleaned.match(new RegExp(PLATE_REGEX.source, 'g'));
  if (!matches) return null;
  return matches.reduce((a, b) => a.length >= b.length ? a : b);
}

let ocrWorker = null;

async function initOcrWorker() {
  if (ocrWorker) return;
  ocrWorker = await Tesseract.createWorker('eng', 1, { logger: () => {} });
  await ocrWorker.setParameters({
    tessedit_char_whitelist:  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode:    '6',
    tessedit_ocr_engine_mode: '1',
  });
}

function openCamera(mode) {
  cameraMode    = mode;
  capturedPlate = null;
  lastDetected  = null;
  scannedTicket = null;

  setOcrStrip('—', 'Starting camera…', false);
  document.getElementById('usePlateBtn').classList.add('hidden');
  document.getElementById('manualPlateInput').value       = '';
  document.getElementById('manualUseBtn').disabled        = true;
  document.getElementById('manualValidation').textContent = '';
  document.getElementById('manualValidation').className   = 'manual-validation';
  document.getElementById('manualPlateInput').className   = 'manual-always-input';
  document.getElementById('ocrSuggestion').classList.add('hidden');

  document.getElementById('qrScanStrip').classList.add('hidden');
  document.getElementById('useTicketBtn').classList.add('hidden');
  document.getElementById('qrDecodedTicket').textContent = '—';
  document.getElementById('qrScanStatus').textContent    = 'Scanning for QR…';

  if (mode === 'exit_qr') {
    _activateQRTab();
  } else {
    _activateOCRTab();
  }

  document.getElementById('cameraOverlay').classList.remove('hidden');

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
  })
  .then(stream => {
    cameraStream = stream;
    const video  = document.getElementById('cameraFeed');
    video.srcObject = stream;
    if (mode === 'exit_qr') {
      video.play().then(() => startQRScanLoop());
    } else {
      initOcrWorker();
      video.play().then(() => startAutoScan());
    }
  })
  .catch(() => {
    setOcrStrip('CAMERA ERROR', 'Permission denied or not available', false);
    document.getElementById('camLiveBadge').style.display = 'none';
    showToast('Camera unavailable — use manual entry', 'error');
  });
}

function closeCamera() {
  stopAutoScan();
  stopQRScanLoop();
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  const video = document.getElementById('cameraFeed');
  if (video) video.srcObject = null;
  document.getElementById('cameraOverlay').classList.add('hidden');
  lastDetected  = null;
  scannedTicket = null;
}

function startAutoScan() {
  stopAutoScan();
  setOcrStrip('—', 'Scanning…', false);
  setBadgeScanning(true);
  scanInterval = setInterval(() => { if (!scanCooldown) runOcrScan(); }, 1800);
  setTimeout(runOcrScan, 600);
}

function stopAutoScan() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  setBadgeScanning(false);
}

async function runOcrScan() {
  const video = document.getElementById('cameraFeed');
  if (!video || !video.srcObject || video.readyState < 2) return;
  if (scanCooldown) return;
  scanCooldown = true;
  try {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const fullCanvas = document.getElementById('cameraCanvas');
    fullCanvas.width = vw; fullCanvas.height = vh;
    fullCanvas.getContext('2d').drawImage(video, 0, 0, vw, vh);
    const cropX = Math.floor(vw * 0.10), cropY = Math.floor(vh * 0.25);
    const cropW = Math.floor(vw * 0.80), cropH = Math.floor(vh * 0.50);
    const scale = 2;
    const procCanvas = document.createElement('canvas');
    procCanvas.width = cropW * scale; procCanvas.height = cropH * scale;
    procCanvas.getContext('2d').drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, procCanvas.width, procCanvas.height);
    const processedCanvas = applyPreprocessing(procCanvas);
    await initOcrWorker();
    const result  = await ocrWorker.recognize(processedCanvas);
    const conf    = Math.round(result.data.confidence);
    let   plate   = extractBestPlate(result.data.text);
    if (!plate) { const r2 = await ocrWorker.recognize(applyPreprocessing(procCanvas, true)); plate = extractBestPlate(r2.data.text); }
    if (plate) {
      lastDetected = plate; capturedPlate = plate;
      setOcrStrip(plate, `Confidence ${conf}%`, true);
      document.getElementById('ocrStrip').style.borderColor = 'var(--green)';
      document.getElementById('ocrSuggestion').classList.add('hidden');
      document.getElementById('usePlateBtn').classList.remove('hidden');
      const manualInput = document.getElementById('manualPlateInput');
      if (!manualInput.value) { manualInput.value = plate; validateManualInput(manualInput); }
      stopAutoScan(); setBadgeScanning(false);
      showToast(`Plate detected: ${plate}`, 'success');
    } else {
      const cleaned = cleanOcrText(result.data.text);
      setOcrStrip('NO PLATE DETECTED', `Conf ${conf}% — aim at plate`, false);
      document.getElementById('ocrStrip').style.borderColor = 'var(--border)';
      document.getElementById('usePlateBtn').classList.add('hidden');
      if (cleaned.length >= 4) { document.getElementById('suggestionBtn').textContent = cleaned.slice(0, 10); document.getElementById('ocrSuggestion').classList.remove('hidden'); }
      else document.getElementById('ocrSuggestion').classList.add('hidden');
    }
  } catch (e) { setOcrStrip('SCAN ERROR', 'Retrying…', false); }
  finally { scanCooldown = false; }
}

function applyPreprocessing(sourceCanvas, invert = false) {
  const w = sourceCanvas.width, h = sourceCanvas.height;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'); ctx.drawImage(sourceCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h); const data = imageData.data;
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) grey[i] = Math.round(0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2]);
  const blurred = new Uint8Array(w * h); const kernel = [1,2,1,2,4,2,1,2,1]; const kSum = 16;
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) { let sum=0,ki=0; for (let ky=-1;ky<=1;ky++) for (let kx=-1;kx<=1;kx++) sum+=grey[(y+ky)*w+(x+kx)]*kernel[ki++]; blurred[y*w+x]=sum/kSum; }
  for (let x=0;x<w;x++){blurred[x]=grey[x];blurred[(h-1)*w+x]=grey[(h-1)*w+x];}
  for (let y=0;y<h;y++){blurred[y*w]=grey[y*w];blurred[y*w+w-1]=grey[y*w+w-1];}
  const blockSize=Math.max(11,Math.floor(Math.min(w,h)/20)|1),C=8,binary=new Uint8Array(w*h);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){const half=Math.floor(blockSize/2);let sum=0,cnt=0;for(let ky=Math.max(0,y-half);ky<=Math.min(h-1,y+half);ky++)for(let kx=Math.max(0,x-half);kx<=Math.min(w-1,x+half);kx++){sum+=blurred[ky*w+kx];cnt++;}binary[y*w+x]=blurred[y*w+x]<(sum/cnt-C)?0:255;}
  for (let i=0;i<w*h;i++){const val=invert?255-binary[i]:binary[i];data[i*4]=data[i*4+1]=data[i*4+2]=val;data[i*4+3]=255;}
  ctx.putImageData(imageData,0,0); return out;
}

function setOcrStrip(plateText, statusText, detected) {
  const plateEl  = document.getElementById('ocrPlate');
  const statusEl = document.getElementById('ocrStatus');
  if (plateEl)  { plateEl.textContent  = plateText; plateEl.className = 'ocr-strip-plate' + (detected ? ' detected' : plateText==='—'?'':' no-detect'); }
  if (statusEl)   statusEl.textContent = statusText;
}

function setBadgeScanning(scanning) {
  const badge = document.getElementById('camLiveBadge');
  if (!badge) return;
  if (scanning) { badge.classList.add('scanning'); badge.innerHTML = `<span class="cam-live-dot"></span> SCANNING`; }
  else          { badge.classList.remove('scanning'); badge.innerHTML = `<span class="cam-live-dot"></span> LIVE`; }
}

function useCapturedPlate() {
  if (!capturedPlate) return;
  if (cameraMode === 'park') document.getElementById('parkPlate').value = capturedPlate;
  else if (cameraMode === 'exit') document.getElementById('exitIdentifier').value = capturedPlate;
  closeCamera();
  showToast(`Plate ${capturedPlate} filled in form`, 'success');
}

function validateManualInput(inputEl) {
  const val = inputEl.value.toUpperCase().trim();
  const validEl = document.getElementById('manualValidation');
  const useBtn  = document.getElementById('manualUseBtn');
  const plateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$/;
  if (!val) { inputEl.className='manual-always-input'; validEl.textContent=''; validEl.className='manual-validation'; useBtn.disabled=true; return; }
  if (plateRegex.test(val)) { inputEl.className='manual-always-input valid'; validEl.textContent='✓ Valid plate format'; validEl.className='manual-validation ok'; useBtn.disabled=false; }
  else { inputEl.className='manual-always-input invalid'; validEl.textContent='✗ Format: AA00AA0000'; validEl.className='manual-validation err'; useBtn.disabled=true; }
}

function submitManualPlate() {
  const val = document.getElementById('manualPlateInput').value.toUpperCase().trim();
  const plateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$/;
  if (!val || !plateRegex.test(val)) { showToast('Please enter a valid plate number first', 'error'); return; }
  if (cameraMode === 'park') document.getElementById('parkPlate').value = val;
  else if (cameraMode === 'exit' || cameraMode === 'exit_qr') document.getElementById('exitIdentifier').value = val;
  closeCamera();
  showToast(`Plate ${val} filled in form`, 'success');
}

function useOcrSuggestion() {
  const suggestionBtn = document.getElementById('suggestionBtn');
  if (!suggestionBtn) return;
  const input = document.getElementById('manualPlateInput');
  input.value = suggestionBtn.textContent.trim();
  validateManualInput(input);
  input.focus();
  document.getElementById('ocrSuggestion').classList.add('hidden');
  showToast('Partial text copied — correct it and press USE', 'info');
}

/* ══════════════════════════════════════════════════════════
   TOAST & HELPERS
══════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type || ''}`;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function setMsg(el, msg, type) {
  el.textContent = msg;
  el.className   = `form-msg ${type}`;
}

/* ══════════════════════════════════════════════════════════
   v2.0 — QR CODE GENERATION (Entry Receipt)
══════════════════════════════════════════════════════════ */
async function generateQRCode(ticketId) {
  const container = document.getElementById('qrCodeContainer');
  if (!container) return;
  container.innerHTML = '';
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, ticketId, {
      width: 160, margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });
    canvas.className = 'qr-receipt-img';
    container.appendChild(canvas);
  } catch (err) {
    const fallback = document.createElement('div');
    fallback.style.cssText = 'padding:12px;font-family:monospace;font-size:0.75rem;color:var(--text-lo);text-align:center;';
    fallback.textContent = 'QR unavailable — use Ticket ID above';
    container.appendChild(fallback);
    console.warn('QR generation failed:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   v2.0 — QR SCANNER (Exit Gate)
══════════════════════════════════════════════════════════ */
function _activateOCRTab() {
  document.getElementById('tabOCR').classList.add('active');
  document.getElementById('tabQR').classList.remove('active');
  document.getElementById('cameraModalTitle').textContent = 'SCAN NUMBER PLATE';
  document.getElementById('cameraModalSub').textContent   = 'Camera scans automatically — or type the number on the right';
  document.getElementById('ocrStrip').classList.remove('hidden');
  document.getElementById('qrScanStrip').classList.add('hidden');
  document.getElementById('useTicketBtn').classList.add('hidden');
}

function _activateQRTab() {
  document.getElementById('tabQR').classList.add('active');
  document.getElementById('tabOCR').classList.remove('active');
  document.getElementById('cameraModalTitle').textContent = 'SCAN QR CODE';
  document.getElementById('cameraModalSub').textContent   = 'Point camera at the QR code on the entry receipt';
  document.getElementById('qrScanStrip').classList.remove('hidden');
  document.getElementById('ocrStrip').classList.add('hidden');
  document.getElementById('usePlateBtn').classList.add('hidden');
}

function switchCameraMode(mode) {
  if (mode === 'ocr') {
    stopQRScanLoop();
    _activateOCRTab();
    cameraMode = (cameraMode === 'exit_qr') ? 'exit' : cameraMode;
    const video = document.getElementById('cameraFeed');
    if (video && video.srcObject) { initOcrWorker(); startAutoScan(); }
  } else {
    stopAutoScan();
    _activateQRTab();
    cameraMode    = 'exit_qr';
    scannedTicket = null;
    document.getElementById('qrDecodedTicket').textContent = '—';
    document.getElementById('qrScanStatus').textContent    = 'Scanning for QR…';
    document.getElementById('useTicketBtn').classList.add('hidden');
    const video = document.getElementById('cameraFeed');
    if (video && video.srcObject) startQRScanLoop();
  }
}

function startQRScanLoop() {
  stopQRScanLoop();
  qrScanActive = true;
  setBadgeScanning(true);
  qrScanInterval = setInterval(() => { if (qrScanActive) runQRScan(); }, 250);
}

function stopQRScanLoop() {
  qrScanActive = false;
  if (qrScanInterval) { clearInterval(qrScanInterval); qrScanInterval = null; }
}

function runQRScan() {
  const video = document.getElementById('cameraFeed');
  if (!video || !video.srcObject || video.readyState < 2) return;
  const canvas = document.getElementById('cameraCanvas');
  const ctx    = canvas.getContext('2d');
  const w = video.videoWidth || 640, h = video.videoHeight || 480;
  canvas.width = w; canvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  try {
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code) onQRDetected(code);
  } catch (e) { console.warn('QR scan error:', e); }
}

function onQRDetected(code) {
  const raw = code.data.trim().toUpperCase();
  if (!validateQRTicket(raw)) { document.getElementById('qrScanStatus').textContent = 'Invalid QR — keep scanning…'; return; }
  showQRResult(raw);
}

function validateQRTicket(id) {
  return /^[A-Z0-9]{8}$/.test(id);
}

function showQRResult(ticketId) {
  scannedTicket = ticketId;
  stopQRScanLoop();
  setBadgeScanning(false);
  const strip = document.getElementById('qrScanStrip');
  strip.classList.remove('hidden');
  strip.classList.add('qr-detected');
  document.getElementById('qrDecodedTicket').textContent = ticketId;
  document.getElementById('qrScanStatus').textContent    = 'Valid ticket found';
  document.getElementById('useTicketBtn').classList.remove('hidden');
  showToast('QR scanned: ' + ticketId, 'success');
}

function useScannedQR() {
  if (!scannedTicket) return;
  document.getElementById('exitIdentifier').value = scannedTicket;
  closeCamera();
  exitVehicle();
}

/* ══════════════════════════════════════════════════════════
   v3.0 Day 25 — DYNAMIC PRICING RULES
══════════════════════════════════════════════════════════ */

let pricingVisible = false;

async function togglePricing() {
  pricingVisible = !pricingVisible;
  const panel = document.getElementById('pricingPanel');
  const btn   = document.querySelector('.btn-pricing');
  if (pricingVisible) {
    panel.classList.remove('hidden');
    btn.classList.add('active');
    await loadPricingRules();
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('active');
  }
}

async function loadPricingRules() {
  const list = document.getElementById('pricingRulesList');
  try {
    const res  = await fetch('/api/pricing-rules');
    const data = await res.json();
    if (!data.rules || data.rules.length === 0) {
      list.innerHTML = '<div class="empty-state">No pricing rules yet. Click + ADD RULE to create one.</div>';
      return;
    }
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    list.innerHTML = data.rules.map(r => `
      <div class="rule-card">
        <div class="rule-name">${r.name}</div>
        <div class="rule-hours">${String(r.hour_start).padStart(2,'0')}:00 – ${String(r.hour_end).padStart(2,'0')}:00</div>
        <div class="rule-day">${r.day_of_week !== null ? days[r.day_of_week] : 'All days'}</div>
        <div class="rule-multiplier">${r.multiplier}x</div>
        <button class="btn-delete-rule" onclick="deleteRule(${r.id})" title="Delete rule">✕</button>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">Could not load rules.</div>';
  }
}

function openAddRule() {
  document.getElementById('ruleName').value       = '';
  document.getElementById('ruleStart').value      = '9';
  document.getElementById('ruleEnd').value        = '11';
  document.getElementById('ruleMultiplier').value = '1.5';
  document.getElementById('ruleDow').value        = '';
  document.getElementById('ruleError').textContent = '';
  document.getElementById('addRuleOverlay').classList.remove('hidden');
}

function closeAddRule() {
  document.getElementById('addRuleOverlay').classList.add('hidden');
}

async function saveRule() {
  const errEl = document.getElementById('ruleError');
  errEl.textContent = '';
  const body = {
    name:        document.getElementById('ruleName').value.trim(),
    hour_start:  parseInt(document.getElementById('ruleStart').value),
    hour_end:    parseInt(document.getElementById('ruleEnd').value),
    multiplier:  parseFloat(document.getElementById('ruleMultiplier').value),
    day_of_week: document.getElementById('ruleDow').value || null,
  };
  if (!body.name) { errEl.textContent = 'Rule name is required'; return; }
  if (body.hour_start >= body.hour_end) { errEl.textContent = 'Start hour must be before end hour'; return; }
  try {
    const res  = await fetch('/api/pricing-rules', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    closeAddRule();
    await loadPricingRules();
    showToast('Pricing rule added', 'success');
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

async function deleteRule(ruleId) {
  try {
    const res  = await fetch(`/api/pricing-rules/${ruleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await loadPricingRules();
      showToast('Rule deleted', 'info');
    }
  } catch (e) { showToast('Could not delete rule', 'error'); }
}

async function checkSurgeBadge() {
  try {
    const res  = await fetch('/api/current-surge');
    const data = await res.json();
    const badge = document.getElementById('surgeBadge');
    if (data.active) {
      badge.textContent = `⚡ ${data.name.toUpperCase()} (${data.multiplier}x)`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) {}
}

// Check surge badge every 60 seconds
setInterval(checkSurgeBadge, 60000);

/* ══════════════════════════════════════════════════════════
   v3.0 Day 27 — ADMIN DASHBOARD
══════════════════════════════════════════════════════════ */

let adminVisible   = false;
let adminActiveTab = 'operators';

// Show admin button only for admin role
async function checkUserRole() {
  try {
    const res  = await fetch('/api/me');
    const data = await res.json();
    if (data.role === 'admin') {
      document.getElementById('adminBtn').classList.remove('hidden');
    }
  } catch (e) {}
}

async function toggleAdmin() {
  adminVisible = !adminVisible;
  const panel = document.getElementById('adminPanel');
  const btn   = document.getElementById('adminBtn');
  if (adminVisible) {
    panel.classList.remove('hidden');
    btn.classList.add('active');
    await loadAdminSummary();
    await loadOperators();
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('active');
  }
}

async function loadAdminSummary() {
  try {
    const res  = await fetch('/api/admin/summary');
    const data = await res.json();
    if (!data.success) return;
    document.getElementById('adminSummary').innerHTML = `
      <div class="admin-stat-card"><div class="admin-stat-val">${data.total_lots}</div><div class="admin-stat-lbl">TOTAL LOTS</div></div>
      <div class="admin-stat-card"><div class="admin-stat-val">${data.total_operators}</div><div class="admin-stat-lbl">OPERATORS</div></div>
      <div class="admin-stat-card"><div class="admin-stat-val">${data.total_exits}</div><div class="admin-stat-lbl">TOTAL EXITS</div></div>
      <div class="admin-stat-card"><div class="admin-stat-val">₹${Math.round(data.total_revenue)}</div><div class="admin-stat-lbl">TOTAL REVENUE</div></div>
    `;
  } catch (e) {}
}

function switchAdminTab(tab) {
  adminActiveTab = tab;
  document.querySelectorAll('.admin-tab').forEach((t, i) => {
    t.classList.toggle('active', ['operators','lots'][i] === tab);
  });
  document.getElementById('adminTabOperators').classList.toggle('hidden', tab !== 'operators');
  document.getElementById('adminTabLots').classList.toggle('hidden', tab !== 'lots');
  if (tab === 'operators') loadOperators();
  if (tab === 'lots')      loadLots();
}

async function loadOperators() {
  const list = document.getElementById('operatorsList');
  try {
    const res  = await fetch('/api/admin/operators');
    const data = await res.json();
    if (!data.operators || data.operators.length === 0) {
      list.innerHTML = '<div class="empty-state">No operators yet. Click + ADD OPERATOR.</div>';
      return;
    }
    list.innerHTML = data.operators.map(op => `
      <div class="operator-card">
        <div class="op-avatar">${op.name[0].toUpperCase()}</div>
        <div class="op-info">
          <div class="op-name">${op.name}</div>
          <div class="op-email">${op.email}</div>
        </div>
        <div class="op-lot">${op.lot_id ? 'Lot #' + op.lot_id : 'All lots'}</div>
        <button class="btn-delete-rule" onclick="deleteOperator(${op.id})" title="Deactivate">✕</button>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">Could not load operators.</div>';
  }
}

async function loadLots() {
  const list = document.getElementById('lotsList');
  try {
    const res  = await fetch('/api/admin/lots');
    const data = await res.json();
    if (!data.lots || data.lots.length === 0) {
      list.innerHTML = '<div class="empty-state">No lots configured yet.</div>';
      return;
    }
    list.innerHTML = data.lots.map(lot => `
      <div class="operator-card">
        <div class="op-avatar" style="background:var(--cyan-soft);color:var(--cyan);">${lot.id}</div>
        <div class="op-info">
          <div class="op-name">${lot.name}</div>
          <div class="op-email">Revenue: ₹${Math.round(lot.revenue)}</div>
        </div>
        <div class="op-lot">${lot.multi_floor ? 'Multi-floor' : 'Single floor'}</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">Could not load lots.</div>';
  }
}

function openAddOperator() {
  document.getElementById('opName').value     = '';
  document.getElementById('opEmail').value    = '';
  document.getElementById('opPassword').value = '';
  document.getElementById('opError').textContent = '';
  document.getElementById('addOperatorOverlay').classList.remove('hidden');
}

function closeAddOperator() {
  document.getElementById('addOperatorOverlay').classList.add('hidden');
}

async function saveOperator() {
  const errEl = document.getElementById('opError');
  errEl.textContent = '';
  const body = {
    name:     document.getElementById('opName').value.trim(),
    email:    document.getElementById('opEmail').value.trim(),
    password: document.getElementById('opPassword').value.trim(),
  };
  if (!body.name || !body.email || !body.password) {
    errEl.textContent = 'All fields are required';
    return;
  }
  try {
    const res  = await fetch('/api/admin/operators', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    closeAddOperator();
    await loadOperators();
    await loadAdminSummary();
    showToast('Operator created: ' + body.email, 'success');
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

async function deleteOperator(opId) {
  try {
    const res  = await fetch(`/api/admin/operators/${opId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await loadOperators();
      await loadAdminSummary();
      showToast('Operator deactivated', 'info');
    }
  } catch (e) { showToast('Could not deactivate operator', 'error'); }
}

// Run role check on load
document.addEventListener('DOMContentLoaded', () => {
  checkUserRole();
});

/* ══════════════════════════════════════════════════════════
   v3.0 Day 28 — BOOKING SYSTEM
══════════════════════════════════════════════════════════ */

let bookingVisible = false;

async function toggleBooking() {
  bookingVisible = !bookingVisible;
  const panel = document.getElementById('bookingPanel');
  const btn   = document.querySelector('.btn-booking');
  if (bookingVisible) {
    panel.classList.remove('hidden');
    btn.classList.add('active');
    await loadBookings();
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('active');
  }
}

async function loadBookings() {
  const list = document.getElementById('bookingsList');
  try {
    const res  = await fetch('/api/bookings');
    const data = await res.json();
    if (!data.bookings || data.bookings.length === 0) {
      list.innerHTML = '<div class="empty-state">No active bookings. Click + NEW BOOKING to create one.</div>';
      return;
    }
    list.innerHTML = data.bookings.map(b => {
      const arrivalDate = new Date(b.booked_for);
      const arrivalStr  = arrivalDate.toLocaleString('en-IN', {
        day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
      });
      return `
        <div class="rule-card">
          <div style="display:flex;flex-direction:column;gap:2px;flex:1;">
            <div class="rule-name">${b.number_plate}</div>
            <div class="rule-hours">${b.vehicle_type.toUpperCase()} · Ref: <b>${b.booking_ref}</b></div>
          </div>
          <div class="rule-day">${arrivalStr}</div>
          <button class="btn-add-rule" style="font-size:0.56rem;padding:5px 10px;"
                  onclick="openCheckin('${b.booking_ref}')">CHECK IN</button>
          <button class="btn-delete-rule" onclick="cancelBooking(${b.id})" title="Cancel">✕</button>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">Could not load bookings.</div>';
  }
}

function openAddBooking() {
  // Set default time to 1 hour from now
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const local = new Date(now - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
  document.getElementById('bookPlate').value = '';
  document.getElementById('bookTime').value  = local;
  document.getElementById('bookPhone').value = '';
  document.getElementById('bookError').textContent = '';
  document.getElementById('addBookingOverlay').classList.remove('hidden');
}

function closeAddBooking() {
  document.getElementById('addBookingOverlay').classList.add('hidden');
}

async function saveBooking() {
  const errEl = document.getElementById('bookError');
  errEl.textContent = '';
  const body = {
    number_plate: document.getElementById('bookPlate').value.trim().toUpperCase(),
    vehicle_type: document.getElementById('bookType').value,
    booked_for:   document.getElementById('bookTime').value,
    phone:        document.getElementById('bookPhone').value.trim(),
  };
  if (!body.number_plate || !body.booked_for) {
    errEl.textContent = 'Plate and arrival time are required';
    return;
  }
  try {
    const res  = await fetch('/api/bookings', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    closeAddBooking();
    await loadBookings();
    showToast(`Booking confirmed: ${data.booking_ref}`, 'success');
    // Show booking receipt
    showBookingReceipt(data, body.number_plate);
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

function showBookingReceipt(data, plate) {
  document.getElementById('receiptIcon').textContent  = '📅';
  document.getElementById('receiptTitle').textContent = 'BOOKING CONFIRMED';
  document.getElementById('receiptBody').innerHTML = `
    <div class="receipt-row">
      <span class="r-label">Vehicle Number</span>
      <span class="r-value">${plate}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Booking Reference</span>
      <span class="r-value" style="color:var(--gold);font-size:1.1rem;">${data.booking_ref}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Arrival Time</span>
      <span class="r-value">${data.booked_for}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Valid Until</span>
      <span class="r-value">${data.expires_at} (30 min grace)</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Check-in</span>
      <span class="r-value">Show reference at gate</span>
    </div>
  `;
  document.getElementById('qrReceiptSection').classList.add('hidden');
  document.getElementById('receiptOverlay').classList.remove('hidden');
}

async function cancelBooking(bookingId) {
  try {
    const res  = await fetch(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      await loadBookings();
      showToast('Booking cancelled', 'info');
    }
  } catch (e) { showToast('Could not cancel booking', 'error'); }
}

function openCheckin(ref) {
  document.getElementById('checkinRef').value = ref || '';
  document.getElementById('checkinError').textContent = '';
  document.getElementById('checkinOverlay').classList.remove('hidden');
}

function closeCheckin() {
  document.getElementById('checkinOverlay').classList.add('hidden');
}

async function doCheckin() {
  const errEl = document.getElementById('checkinError');
  errEl.textContent = '';
  const ref = document.getElementById('checkinRef').value.trim().toUpperCase();
  if (!ref) { errEl.textContent = 'Enter booking reference'; return; }
  try {
    const res  = await fetch('/api/bookings/checkin', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ booking_ref: ref })
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    closeCheckin();
    await loadBookings();
    pollStatus();
    showEntryReceipt(data, false);
    showToast(`Checked in: ${data.number_plate} → Slot ${data.slot}`, 'success');
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

/* ══════════════════════════════════════════════════════════
   v3.0 Day 30 — AI PEAK PREDICTION
══════════════════════════════════════════════════════════ */

let aiVisible = false;

async function toggleAI() {
  aiVisible = !aiVisible;
  const panel = document.getElementById('aiPanel');
  const btn   = document.querySelector('.btn-ai');
  if (aiVisible) {
    panel.classList.remove('hidden');
    btn.classList.add('active');
    await loadPrediction();
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('active');
  }
}

async function loadPrediction() {
  const content = document.getElementById('aiContent');
  content.innerHTML = '<div class="empty-state">Analysing history data…</div>';
  try {
    const res  = await fetch('/api/prediction');
    const data = await res.json();

    if (!data.success) {
      content.innerHTML = '<div class="empty-state">Could not load prediction.</div>';
      return;
    }

    if (data.data_points < 5) {
      content.innerHTML = `<div class="empty-state">Not enough data yet (${data.data_points} exits recorded). Need at least 5 exits for prediction.</div>`;
      return;
    }

    const best    = data.best_time;
    const pred    = data.prediction;
    const levels  = { peak: 'var(--red)', normal: 'var(--gold)', quiet: 'var(--green)' };
    const labels  = { peak: '🔴 PEAK', normal: '🟡 BUSY', quiet: '🟢 QUIET' };

    // Best time card
    let html = '';
    if (best) {
      html += `
        <div style="background:var(--bg-surface);border:1px solid var(--green);border-radius:var(--r-md);padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:14px;">
          <div style="font-size:1.6rem;">✨</div>
          <div>
            <div style="font-family:var(--font-display);font-size:0.65rem;color:var(--green);letter-spacing:0.1em;margin-bottom:4px;">BEST TIME TO PARK (next 6 hrs)</div>
            <div style="font-family:var(--font-display);font-size:1rem;font-weight:700;color:var(--text-hi);">${best.label}</div>
            <div style="font-family:var(--font-data);font-size:0.65rem;color:var(--text-lo);">Predicted ${best.predicted} vehicles · ${labels[best.level]}</div>
          </div>
        </div>`;
    }

    // 24-hour bar chart
    html += `<div style="font-family:var(--font-display);font-size:0.58rem;letter-spacing:0.12em;color:var(--text-lo);margin-bottom:12px;">NEXT 24 HOURS</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:6px;">`;

    const maxPred = Math.max(...pred.map(p => p.predicted), 1);
    pred.forEach(p => {
      const pct   = Math.round((p.predicted / maxPred) * 100);
      const color = levels[p.level];
      html += `
        <div style="display:grid;grid-template-columns:80px 1fr 50px;align-items:center;gap:10px;">
          <div style="font-family:var(--font-data);font-size:0.65rem;color:var(--text-mid);">${p.label}</div>
          <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width 0.6s ease;"></div>
          </div>
          <div style="font-family:var(--font-display);font-size:0.6rem;color:${color};text-align:right;">${labels[p.level]}</div>
        </div>`;
    });
    html += '</div>';

    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = '<div class="empty-state">Could not load prediction.</div>';
  }
}

/* ══════════════════════════════════════════════════════════
   v3.0 Day 31 — EV CHARGING
══════════════════════════════════════════════════════════ */

let evVisible = false;

async function toggleEV() {
  evVisible = !evVisible;
  const panel = document.getElementById('evPanel');
  const btn   = document.querySelector('.btn-ev');
  if (evVisible) {
    panel.classList.remove('hidden');
    btn.classList.add('active');
    await loadEVSessions();
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('active');
  }
}

async function loadEVSessions() {
  const list = document.getElementById('evActiveList');
  try {
    const res  = await fetch('/api/ev/active');
    const data = await res.json();
    if (!data.sessions || data.sessions.length === 0) {
      list.innerHTML = '<div class="empty-state">No active charging sessions. Click + START CHARGING.</div>';
      return;
    }
    list.innerHTML = data.sessions.map(s => {
      const start   = new Date(s.start_time);
      const elapsed = Math.round((Date.now() - start) / 60000);
      return `
        <div class="rule-card">
          <div style="font-size:1.2rem;">⚡</div>
          <div style="flex:1;">
            <div class="rule-name">${s.number_plate} — Slot ${s.slot_id}</div>
            <div class="rule-hours">Ticket: ${s.ticket_id} · ${elapsed} min · ₹${s.kwh_rate}/kWh</div>
          </div>
          <button class="btn-add-rule" style="font-size:0.56rem;padding:5px 10px;"
                  onclick="openStopCharging('${s.ticket_id}')">STOP</button>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state">Could not load sessions.</div>';
  }
}

function openStartCharging() {
  document.getElementById('evTicket').value = '';
  document.getElementById('evSlot').value   = '';
  document.getElementById('evPlate').value  = '';
  document.getElementById('evRate').value   = '12';
  document.getElementById('evError').textContent = '';
  document.getElementById('startChargingOverlay').classList.remove('hidden');
}

function closeStartCharging() {
  document.getElementById('startChargingOverlay').classList.add('hidden');
}

async function startCharging() {
  const errEl = document.getElementById('evError');
  errEl.textContent = '';
  const body = {
    ticket_id:    document.getElementById('evTicket').value.trim().toUpperCase(),
    slot_id:      document.getElementById('evSlot').value.trim().toUpperCase(),
    number_plate: document.getElementById('evPlate').value.trim().toUpperCase(),
    kwh_rate:     parseFloat(document.getElementById('evRate').value),
  };
  if (!body.ticket_id || !body.slot_id) {
    errEl.textContent = 'Ticket ID and Slot ID are required';
    return;
  }
  try {
    const res  = await fetch('/api/ev/start', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    closeStartCharging();
    await loadEVSessions();
    showToast('EV charging started — ₹' + body.kwh_rate + '/kWh', 'success');
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

function openStopCharging(ticketId) {
  document.getElementById('stopEvTicket').value = ticketId || '';
  document.getElementById('evKwh').value        = '';
  document.getElementById('stopEvError').textContent = '';
  document.getElementById('stopChargingOverlay').classList.remove('hidden');
}

function closeStopCharging() {
  document.getElementById('stopChargingOverlay').classList.add('hidden');
}

async function stopCharging() {
  const errEl = document.getElementById('stopEvError');
  errEl.textContent = '';
  const body = {
    ticket_id:     document.getElementById('stopEvTicket').value.trim().toUpperCase(),
    kwh_delivered: parseFloat(document.getElementById('evKwh').value),
  };
  if (!body.ticket_id || !body.kwh_delivered) {
    errEl.textContent = 'Ticket ID and kWh delivered are required';
    return;
  }
  try {
    const res  = await fetch('/api/ev/stop', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    closeStopCharging();
    await loadEVSessions();
    showToast(`Charging complete — ${data.kwh_delivered} kWh — ₹${data.charging_fee}`, 'success');
    // Show EV receipt
    showEVReceipt(data, body.ticket_id);
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

function showEVReceipt(data, ticketId) {
  document.getElementById('receiptIcon').textContent  = '⚡';
  document.getElementById('receiptTitle').textContent = 'EV CHARGING RECEIPT';
  document.getElementById('receiptBody').innerHTML = `
    <div class="receipt-row">
      <span class="r-label">Ticket ID</span>
      <span class="r-value">${ticketId}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Energy Delivered</span>
      <span class="r-value">${data.kwh_delivered} kWh</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Rate</span>
      <span class="r-value">₹${data.kwh_rate}/kWh</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Duration</span>
      <span class="r-value">${data.duration_min} min</span>
    </div>
    <div class="receipt-row total">
      <span class="r-label">CHARGING FEE</span>
      <span class="r-value">₹${data.charging_fee}</span>
    </div>
  `;
  document.getElementById('qrReceiptSection').classList.add('hidden');
  document.getElementById('receiptOverlay').classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════
   v3.0 Day 35 — LOT NAME · SESSION TIMEOUT · PASSWORD CHANGE
══════════════════════════════════════════════════════════ */

// ── LOT NAME IN HEADER ───────────────────────────────────
function updateLotName(name) {
  const el = document.getElementById('lotNameDisplay');
  if (!el || !name || name === 'Smart Parking') return;
  el.textContent = name;
  el.classList.remove('hidden');
}

// ── SESSION TIMEOUT ──────────────────────────────────────
let sessionTimer    = null;
let sessionWarning  = null;
const SESSION_MS    = 30 * 60 * 1000;  // 30 minutes
const WARNING_MS    = 29 * 60 * 1000;  // warn at 29 minutes

function startSessionTimer() {
  clearTimeout(sessionTimer);
  clearTimeout(sessionWarning);
  sessionWarning = setTimeout(() => {
    document.getElementById('sessionWarningOverlay').classList.remove('hidden');
  }, WARNING_MS);
  sessionTimer = setTimeout(() => {
    window.location = '/logout';
  }, SESSION_MS);
}

function resetSessionTimer() {
  document.getElementById('sessionWarningOverlay').classList.add('hidden');
  startSessionTimer();
}

// Reset timer on any user interaction
['click','keydown','mousemove','touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (sessionTimer) startSessionTimer();
  }, { passive: true });
});

// ── PASSWORD CHANGE MODAL ─────────────────────────────────
function openChangePassword() {
  document.getElementById('cpCurrent').value  = '';
  document.getElementById('cpNew').value      = '';
  document.getElementById('cpConfirm').value  = '';
  document.getElementById('cpError').textContent  = '';
  document.getElementById('cpSuccess').textContent = '';
  document.getElementById('changePasswordOverlay').classList.remove('hidden');
}

function closeChangePassword() {
  document.getElementById('changePasswordOverlay').classList.add('hidden');
}

async function submitChangePassword() {
  const errEl = document.getElementById('cpError');
  const okEl  = document.getElementById('cpSuccess');
  errEl.textContent = '';
  okEl.textContent  = '';
  const body = {
    current_password: document.getElementById('cpCurrent').value,
    new_password:     document.getElementById('cpNew').value,
    confirm_password: document.getElementById('cpConfirm').value,
  };
  try {
    const res  = await fetch('/api/change-password', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    okEl.textContent = 'Password changed successfully!';
    setTimeout(closeChangePassword, 1500);
    showToast('Password updated', 'success');
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

// ── PATCH applyStatus TO UPDATE LOT NAME ─────────────────
const _origApplyStatus = applyStatus;
applyStatus = function(data) {
  _origApplyStatus(data);
  if (data.lot_name) updateLotName(data.lot_name);
};

// ── START SESSION TIMER ON PAGE LOAD ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startSessionTimer();
});

/* ══════════════════════════════════════════════════════════
   v3.0 Day 36 — SLOT NOTES + DARK/LIGHT MODE
══════════════════════════════════════════════════════════ */

// ── SLOT NOTES ────────────────────────────────────────────

let slotNotes    = {};  // {slot_id: {note_type, note_text}}
let noteSlotId   = null;

const NOTE_ICONS = {
  vip:      '⭐',
  disabled: '♿',
  reserved: '🔒',
  ev:       '⚡',
  blocked:  '🚫',
};

async function loadSlotNotes() {
  try {
    const res  = await fetch('/api/slots/notes');
    const data = await res.json();
    if (data.success) {
      slotNotes = data.notes;
      renderBlueprint(latestConfig, latestLayout, latestFloorCfg);
    }
  } catch (e) {}
}

function openSlotNote(slotId) {
  if (!slotId) return;
  noteSlotId = slotId;
  const existing = slotNotes[slotId];
  document.getElementById('noteType').value = existing ? existing.note_type : '';
  document.getElementById('noteText').value = existing ? (existing.note_text || '') : '';
  document.getElementById('noteError').textContent = '';
  document.getElementById('noteSlotId').textContent = 'Slot: ' + slotId;
  document.getElementById('slotNoteOverlay').classList.remove('hidden');
  // Close slot popup first
  document.getElementById('slotPopupOverlay').classList.add('hidden');
}

function closeSlotNote() {
  document.getElementById('slotNoteOverlay').classList.add('hidden');
  noteSlotId = null;
}

async function saveSlotNote() {
  if (!noteSlotId) return;
  const errEl = document.getElementById('noteError');
  errEl.textContent = '';
  const body = {
    note_type: document.getElementById('noteType').value,
    note_text: document.getElementById('noteText').value.trim(),
  };
  try {
    const res  = await fetch(`/api/slots/${noteSlotId}/note`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    if (body.note_type) {
      slotNotes[noteSlotId] = { note_type: body.note_type, note_text: body.note_text };
      showToast(`Note set: ${NOTE_ICONS[body.note_type]} ${body.note_type.toUpperCase()} on ${noteSlotId}`, 'success');
    } else {
      delete slotNotes[noteSlotId];
      showToast(`Note cleared on ${noteSlotId}`, 'info');
    }
    closeSlotNote();
    renderBlueprint(latestConfig, latestLayout, latestFloorCfg);
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

// Override buildSlotCell to show note icons
const _origBuildSlotCell = buildSlotCell;
buildSlotCell = function(slotId, occupied, slotData) {
  const cell = _origBuildSlotCell(slotId, occupied, slotData);
  const note = slotNotes[slotId];
  if (note && note.note_type) {
    const noteEl = document.createElement('div');
    noteEl.style.cssText = 'position:absolute;top:2px;right:3px;font-size:0.55rem;line-height:1;';
    noteEl.textContent = NOTE_ICONS[note.note_type] || '📌';
    noteEl.title = note.note_text || note.note_type;
    cell.style.position = 'relative';
    cell.appendChild(noteEl);
  }
  return cell;
};

// Load notes on startup
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadSlotNotes, 1000);
});

// ── DARK / LIGHT MODE ─────────────────────────────────────

let isDarkMode = true;

function toggleTheme() {
  isDarkMode = !isDarkMode;
  applyTheme();
  localStorage.setItem('smartpark_theme', isDarkMode ? 'dark' : 'light');
}

function applyTheme() {
  const btn = document.getElementById('themeToggle');
  if (isDarkMode) {
    document.documentElement.style.setProperty('--bg-base',    '#080e14');
    document.documentElement.style.setProperty('--bg-deep',    '#050a10');
    document.documentElement.style.setProperty('--bg-surface', '#0d1a26');
    document.documentElement.style.setProperty('--bg-card',    '#101f2e');
    document.documentElement.style.setProperty('--bg-input',   '#070d14');
    document.documentElement.style.setProperty('--text-hi',    '#e8f4ff');
    document.documentElement.style.setProperty('--text-mid',   '#7aa0be');
    document.documentElement.style.setProperty('--text-lo',    '#3a5570');
    document.documentElement.style.setProperty('--border',     '#0f2035');
    document.documentElement.style.setProperty('--border-lit', '#1a3a55');
    if (btn) btn.textContent = '🌙';
  } else {
    document.documentElement.style.setProperty('--bg-base',    '#f0f4f8');
    document.documentElement.style.setProperty('--bg-deep',    '#e2e8f0');
    document.documentElement.style.setProperty('--bg-surface', '#ffffff');
    document.documentElement.style.setProperty('--bg-card',    '#ffffff');
    document.documentElement.style.setProperty('--bg-input',   '#f8fafc');
    document.documentElement.style.setProperty('--text-hi',    '#1a2332');
    document.documentElement.style.setProperty('--text-mid',   '#4a6080');
    document.documentElement.style.setProperty('--text-lo',    '#8aa0be');
    document.documentElement.style.setProperty('--border',     '#d0dce8');
    document.documentElement.style.setProperty('--border-lit', '#b0c8e0');
    if (btn) btn.textContent = '☀️';
  }
}

// Load saved theme on startup
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('smartpark_theme');
  if (saved === 'light') { isDarkMode = false; applyTheme(); }
});

/* ══════════════════════════════════════════════════════════
   LOW COMPLEXITY TASKS — ALL 14
   #3 Vehicle History · #4 PDF Export · #5 Monthly Report
   #6 Shifts · #7 FASTag · #8 Slot Types · #9 Custom Rates
   #10 Heatmap · #11 Forecasting · #12 Public API
   #13 Dark Mode DB · #14 Print Receipt
══════════════════════════════════════════════════════════ */

// ── LOW #3 — VEHICLE HISTORY SEARCH ─────────────────────

let historyVisible = false;

async function toggleVehicleHistory() {
  historyVisible = !historyVisible;
  const panel = document.getElementById('vehicleHistoryPanel');
  const btn   = document.querySelector('.btn-history');
  if (historyVisible) { panel.classList.remove('hidden'); btn.classList.add('active'); }
  else                { panel.classList.add('hidden');    btn.classList.remove('active'); }
}

async function searchVehicleHistory() {
  const plate = document.getElementById('historySearchPlate').value.trim().toUpperCase();
  if (!plate) return;
  const summary = document.getElementById('vehicleHistorySummary');
  const list    = document.getElementById('vehicleHistoryList');
  list.innerHTML    = '<div class="empty-state">Searching...</div>';
  summary.style.display = 'none';

  try {
    const res  = await fetch(`/api/vehicle-history/${plate}`);
    const data = await res.json();
    if (!data.success) { list.innerHTML = `<div class="empty-state">${data.message}</div>`; return; }
    if (data.records.length === 0) {
      list.innerHTML = `<div class="empty-state">No history found for ${plate}</div>`; return;
    }

    summary.style.display = 'block';
    summary.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;">
        <div class="admin-stat-card"><div class="admin-stat-val" style="font-size:1.4rem;color:var(--cyan);">${data.total_visits}</div><div class="admin-stat-lbl">TOTAL VISITS</div></div>
        <div class="admin-stat-card"><div class="admin-stat-val" style="font-size:1.4rem;color:var(--gold);">₹${Math.round(data.total_fee)}</div><div class="admin-stat-lbl">TOTAL SPENT</div></div>
        <div class="admin-stat-card"><div class="admin-stat-val" style="font-size:1.4rem;color:var(--green);">${data.total_hours}h</div><div class="admin-stat-lbl">TOTAL HOURS</div></div>
        <div class="admin-stat-card"><div class="admin-stat-val" style="font-size:0.7rem;color:var(--text-mid);">${data.last_visit ? data.last_visit.slice(0,10) : 'N/A'}</div><div class="admin-stat-lbl">LAST VISIT</div></div>
      </div>`;

    list.innerHTML = data.records.map(r => `
      <div class="rule-card">
        <div style="flex:1;">
          <div class="rule-name">${r.slot} · ${r.vehicle_type.toUpperCase()}</div>
          <div class="rule-hours">${r.entry_time.slice(0,16)} → ${r.exit_time.slice(0,16)}</div>
        </div>
        <div class="rule-day">${r.duration_min} min</div>
        <div class="rule-multiplier">₹${r.fee}</div>
      </div>`).join('');
  } catch (e) { list.innerHTML = '<div class="empty-state">Error. Try again.</div>'; }
}

// ── LOW #4 — PDF EXPORT (Analytics) ─────────────────────

async function exportAnalyticsPDF() {
  showToast('Generating PDF...', 'info');
  try {
    const res = await fetch('/api/reports/analytics-pdf');
    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `analytics_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      showToast('Analytics PDF downloaded', 'success');
    } else {
      const d = await res.json();
      showToast(d.message || 'PDF failed', 'error');
    }
  } catch (e) { showToast('PDF generation failed', 'error'); }
}

// ── LOW #5 — MONTHLY REPORT ──────────────────────────────

async function downloadMonthlyReport(month) {
  month = month || new Date().toISOString().slice(0,7);
  showToast(`Generating ${month} report...`, 'info');
  try {
    const res = await fetch(`/api/reports/monthly?month=${month}`);
    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `report_${month}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      showToast('Monthly report downloaded', 'success');
    } else {
      const d = await res.json();
      showToast(d.message || 'Report failed', 'error');
    }
  } catch (e) { showToast('Report generation failed', 'error'); }
}

// ── LOW #6 — OPERATOR SHIFTS ─────────────────────────────

let shiftsVisible = false;

async function toggleShifts() {
  shiftsVisible = !shiftsVisible;
  const panel = document.getElementById('shiftsPanel');
  const btn   = document.querySelector('.btn-shifts');
  if (shiftsVisible) { panel.classList.remove('hidden'); btn.classList.add('active'); await loadShifts(); }
  else               { panel.classList.add('hidden');    btn.classList.remove('active'); }
}

async function loadShifts() {
  try {
    const res  = await fetch('/api/shifts');
    const data = await res.json();
    const startBtn = document.getElementById('shiftStartBtn');
    const endBtn   = document.getElementById('shiftEndBtn');
    const activeCard = document.getElementById('activeShiftCard');

    if (data.active) {
      startBtn.style.display = 'none';
      endBtn.style.display   = 'block';
      const elapsed = Math.round((Date.now() - new Date(data.active.start_time)) / 60000);
      activeCard.style.display = 'block';
      activeCard.innerHTML = `
        <div class="rule-card" style="border-left-color:var(--green);">
          <div style="font-size:1.2rem;">🟢</div>
          <div style="flex:1;">
            <div class="rule-name" style="color:var(--green);">SHIFT ACTIVE</div>
            <div class="rule-hours">Started ${data.active.start_time.slice(11,16)} · ${elapsed} min elapsed</div>
          </div>
        </div>`;
    } else {
      startBtn.style.display = 'block';
      endBtn.style.display   = 'none';
      activeCard.style.display = 'none';
    }

    const list = document.getElementById('shiftsList');
    if (!data.shifts || data.shifts.length === 0) {
      list.innerHTML = '<div class="empty-state">No shifts yet.</div>'; return;
    }
    list.innerHTML = data.shifts.filter(s => s.status === 'ended').map(s => `
      <div class="rule-card">
        <div style="flex:1;">
          <div class="rule-name">${s.start_time.slice(0,10)} · ${s.start_time.slice(11,16)} – ${s.end_time ? s.end_time.slice(11,16) : '?'}</div>
          <div class="rule-hours">${s.exits_processed} exits · ${s.duration_min} min</div>
        </div>
        <div class="rule-multiplier">₹${Math.round(s.revenue_collected)}</div>
      </div>`).join('');
  } catch (e) {}
}

async function startShift() {
  try {
    const res  = await fetch('/api/shifts/start', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
    const data = await res.json();
    if (data.success) { await loadShifts(); showToast('Shift started', 'success'); }
    else showToast(data.message, 'error');
  } catch (e) { showToast('Error starting shift', 'error'); }
}

async function endShift() {
  try {
    const res  = await fetch('/api/shifts/end', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
    const data = await res.json();
    if (data.success) {
      await loadShifts();
      showToast(`Shift ended · ${data.shift.exits_processed} exits · ₹${Math.round(data.shift.revenue_collected)}`, 'success');
    } else showToast(data.message, 'error');
  } catch (e) { showToast('Error ending shift', 'error'); }
}

// ── LOW #7 — FASTTAG ─────────────────────────────────────

let fastagVisible = false;

async function toggleFastag() {
  fastagVisible = !fastagVisible;
  const panel = document.getElementById('fastagPanel');
  const btn   = document.querySelector('.btn-fastag');
  if (fastagVisible) { panel.classList.remove('hidden'); btn.classList.add('active'); await loadFastagList(); }
  else               { panel.classList.add('hidden');    btn.classList.remove('active'); }
}

async function fastagLookup() {
  const id  = document.getElementById('fastagLookupId').value.trim().toUpperCase();
  const div = document.getElementById('fastagLookupResult');
  if (!id) return;
  try {
    const res  = await fetch(`/api/fasttag/${id}`);
    const data = await res.json();
    if (data.success) {
      div.innerHTML = `<div class="rule-card" style="border-left-color:var(--green);">
        <div style="font-size:1.4rem;">✅</div>
        <div style="flex:1;">
          <div class="rule-name">${data.entry.number_plate}</div>
          <div class="rule-hours">${data.entry.vehicle_type.toUpperCase()} · ${data.entry.owner_name || 'Unknown'}</div>
        </div>
        <button class="btn-add-rule" style="font-size:0.56rem;padding:5px 10px;"
                onclick="document.getElementById('plateInput').value='${data.entry.number_plate}';document.getElementById('vehicleTypeSelect').value='${data.entry.vehicle_type}';showToast('Plate auto-filled','success');">
          USE PLATE
        </button>
      </div>`;
    } else {
      div.innerHTML = `<div class="empty-state" style="color:var(--red);">FASTag not registered</div>`;
    }
  } catch (e) { div.innerHTML = `<div class="empty-state">Lookup failed</div>`; }
}

async function loadFastagList() {
  const list = document.getElementById('fastagList');
  try {
    const res  = await fetch('/api/fasttag');
    const data = await res.json();
    if (!data.entries || data.entries.length === 0) {
      list.innerHTML = '<div class="empty-state">No registrations yet.</div>'; return;
    }
    list.innerHTML = data.entries.map(e => `
      <div class="rule-card">
        <div style="font-size:1.1rem;">📡</div>
        <div style="flex:1;">
          <div class="rule-name">${e.number_plate} · ${e.vehicle_type.toUpperCase()}</div>
          <div class="rule-hours">Tag: ${e.fasttag_id} · ${e.owner_name || 'No name'}</div>
        </div>
      </div>`).join('');
  } catch (e) {}
}

function openFastagRegister() {
  ['ftId','ftPlate','ftName','ftPhone'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ftError').textContent = '';
  document.getElementById('fastagRegisterOverlay').classList.remove('hidden');
}
function closeFastagRegister() { document.getElementById('fastagRegisterOverlay').classList.add('hidden'); }

async function saveFastag() {
  const errEl = document.getElementById('ftError');
  errEl.textContent = '';
  const body = {
    fasttag_id:   document.getElementById('ftId').value.trim().toUpperCase(),
    number_plate: document.getElementById('ftPlate').value.trim().toUpperCase(),
    vehicle_type: document.getElementById('ftType').value,
    owner_name:   document.getElementById('ftName').value.trim(),
    owner_phone:  document.getElementById('ftPhone').value.trim(),
  };
  if (!body.fasttag_id || !body.number_plate) { errEl.textContent = 'FASTag ID and plate are required'; return; }
  try {
    const res  = await fetch('/api/fasttag/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }
    closeFastagRegister();
    await loadFastagList();
    showToast(`FASTag registered: ${body.number_plate}`, 'success');
  } catch (e) { errEl.textContent = 'Server error. Try again.'; }
}

// ── LOW #9 — CUSTOM RATES ────────────────────────────────

let ratesVisible = false;

async function toggleCustomRates() {
  ratesVisible = !ratesVisible;
  const panel = document.getElementById('customRatesPanel');
  const btn   = document.querySelector('.btn-rates');
  if (ratesVisible) { panel.classList.remove('hidden'); btn.classList.add('active'); await loadCustomRates(); }
  else              { panel.classList.add('hidden');    btn.classList.remove('active'); }
}

async function loadCustomRates() {
  try {
    const res  = await fetch('/api/custom-rates');
    const data = await res.json();
    if (data.rates) {
      document.getElementById('ratecar').value   = data.rates.car   || 30;
      document.getElementById('ratebike').value  = data.rates.bike  || 15;
      document.getElementById('ratetruck').value = data.rates.truck || 60;
    }
  } catch (e) {}
}

async function saveCustomRates() {
  const errEl = document.getElementById('ratesError');
  errEl.textContent = '';
  const types = ['car','bike','truck'];
  try {
    for (const vtype of types) {
      const rate = parseFloat(document.getElementById(`rate${vtype}`).value);
      if (!rate || rate <= 0) { errEl.textContent = `Invalid rate for ${vtype}`; return; }
      const res = await fetch('/api/custom-rates', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ vehicle_type: vtype, rate_per_hour: rate })
      });
      const data = await res.json();
      if (!data.success) { errEl.textContent = data.message; return; }
    }
    showToast('Rates saved successfully', 'success');
  } catch (e) { errEl.textContent = 'Error saving rates'; }
}

// ── LOW #10 — ANALYTICS HEATMAP ─────────────────────────

function renderHeatmap(hourlyData) {
  const container = document.getElementById('analyticsHeatmap');
  if (!container || !hourlyData || hourlyData.length === 0) return;

  const maxCount = Math.max(...hourlyData.map(h => h.count), 1);
  container.innerHTML = '';

  // Build 24-hour heatmap
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(12,1fr);gap:3px;margin-top:8px;';

  for (let h = 0; h < 24; h++) {
    const item  = hourlyData.find(x => x.hour === h) || { hour: h, count: 0, revenue: 0 };
    const pct   = item.count / maxCount;
    const alpha = 0.1 + pct * 0.9;
    const cell  = document.createElement('div');
    cell.style.cssText = `
      background: rgba(0,200,240,${alpha});
      border-radius: 4px;
      padding: 8px 4px;
      text-align: center;
      cursor: default;
    `;
    cell.title = `${h}:00 — ${item.count} vehicles · ₹${Math.round(item.revenue)}`;
    cell.innerHTML = `
      <div style="font-family:var(--font-display);font-size:0.55rem;color:var(--text-lo);">${String(h).padStart(2,'0')}</div>
      <div style="font-family:var(--font-display);font-size:0.75rem;font-weight:700;color:var(--cyan);">${item.count}</div>`;
    grid.appendChild(cell);
  }
  container.appendChild(grid);
}

// ── LOW #11 — REVENUE FORECASTING ───────────────────────

function renderForecast(dailyData) {
  const container = document.getElementById('revenueForecast');
  if (!container || !dailyData || dailyData.length < 3) return;

  // Linear regression on last 14 days
  const n     = dailyData.length;
  const xMean = (n - 1) / 2;
  const yMean = dailyData.reduce((s, d) => s + d.revenue, 0) / n;
  let num = 0, den = 0;
  dailyData.forEach((d, i) => { num += (i - xMean) * (d.revenue - yMean); den += (i - xMean) ** 2; });
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;

  // Project next 7 days
  const forecasts = [];
  for (let i = 1; i <= 7; i++) {
    const projected = Math.max(0, Math.round(intercept + slope * (n + i - 1)));
    const date = new Date();
    date.setDate(date.getDate() + i);
    forecasts.push({ date: date.toISOString().slice(0,10), projected });
  }

  container.innerHTML = `
    <div style="font-family:var(--font-display);font-size:0.58rem;letter-spacing:0.12em;color:var(--text-lo);margin-bottom:10px;">7-DAY REVENUE FORECAST</div>
    <div style="display:flex;flex-direction:column;gap:5px;">
      ${forecasts.map(f => `
        <div style="display:grid;grid-template-columns:90px 1fr 80px;align-items:center;gap:8px;">
          <div style="font-family:var(--font-data);font-size:0.65rem;color:var(--text-mid);">${f.date}</div>
          <div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(100, (f.projected / (yMean * 2 || 1)) * 100)}%;background:var(--green);border-radius:3px;"></div>
          </div>
          <div style="font-family:var(--font-display);font-size:0.65rem;color:var(--green);text-align:right;">₹${f.projected}</div>
        </div>`).join('')}
    </div>`;
}

// ── LOW #12 — PUBLIC API LINK ────────────────────────────

function copyPublicApiUrl() {
  const url = window.location.origin + '/api/public/lots';
  navigator.clipboard.writeText(url).then(() => showToast('Public API URL copied: ' + url, 'success'));
}

// ── LOW #13 — DARK MODE DB PERSIST ──────────────────────

const _origToggleTheme = toggleTheme;
toggleTheme = async function() {
  _origToggleTheme();
  // Save to DB
  try {
    await fetch('/api/preferences', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ theme: isDarkMode ? 'dark' : 'light' })
    });
  } catch (e) {}
};

// Load theme from DB on startup
async function loadThemeFromDB() {
  try {
    const res  = await fetch('/api/preferences');
    const data = await res.json();
    if (data.theme === 'light' && isDarkMode) {
      isDarkMode = false; applyTheme();
    } else if (data.theme === 'dark' && !isDarkMode) {
      isDarkMode = true; applyTheme();
    }
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  loadThemeFromDB();
});

// ── PATCH applyStatus TO RENDER HEATMAP + FORECAST ──────
const _origApplyStatusLow = applyStatus;
applyStatus = function(data) {
  _origApplyStatusLow(data);
};

// Called when analytics panel loads
async function loadAnalyticsWithCharts() {
  try {
    const res  = await fetch('/api/analytics');
    const data = await res.json();
    if (data.success && data.analytics) {
      renderHeatmap(data.analytics.hourly_breakdown || []);
      renderForecast(data.analytics.daily_breakdown || []);
    }
  } catch (e) {}
}

/* ══════════════════════════════════════════════════════════
   MEDIUM COMPLEXITY TASKS — ALL 14
   #1 Razorpay · #2 GST Invoice · #3-6 WhatsApp/SMS
   #7 Subscriptions · #8 Email Reports · #9 City Map
   #10 Customer App · #11 WebSockets · #12 White-label
   #13 Google SSO · #14 AI Surge Suggestions
══════════════════════════════════════════════════════════ */

// ── MEDIUM #1 — RAZORPAY PAYMENTS ───────────────────────

let currentPaymentData = null;
let paymentsVisible    = false;

async function togglePayments() {
  paymentsVisible = !paymentsVisible;
  const panel = document.getElementById('paymentsPanel');
  const btn   = document.querySelector('.btn-pay');
  if (paymentsVisible) { panel.classList.remove('hidden'); btn.classList.add('active'); await loadPayments(); }
  else                 { panel.classList.add('hidden');    btn.classList.remove('active'); }
}

async function loadPayments() {
  const list = document.getElementById('paymentsList');
  try {
    const res  = await fetch('/api/payments');
    const data = await res.json();
    if (!data.payments || data.payments.length === 0) {
      list.innerHTML = '<div class="empty-state">No payments yet.</div>'; return;
    }
    list.innerHTML = data.payments.map(p => `
      <div class="rule-card">
        <div style="flex:1;">
          <div class="rule-name">${p.number_plate} · ${p.ticket_id}</div>
          <div class="rule-hours">${p.created_at.slice(0,16)} · ${p.status.toUpperCase()}</div>
        </div>
        <div class="rule-multiplier" style="color:var(--${p.status==='paid'?'green':'red'});">₹${p.total_amount}</div>
        <button class="btn-delete-rule" onclick="downloadInvoice('${p.ticket_id}')" title="Download Invoice">🧾</button>
      </div>`).join('');
  } catch (e) {}
}

async function openPaymentModal(ticketId, plate, amount) {
  currentPaymentData = { ticketId, plate, amount };
  const gst   = Math.round(amount * 0.18 * 100) / 100;
  const total = Math.round((amount + gst) * 100) / 100;
  document.getElementById('paymentDetails').innerHTML = `
    <div class="receipt-row"><span class="r-label">Vehicle</span><span class="r-value">${plate}</span></div>
    <div class="receipt-row"><span class="r-label">Parking Fee</span><span class="r-value">₹${amount}</span></div>
    <div class="receipt-row"><span class="r-label">GST (18%)</span><span class="r-value">₹${gst}</span></div>
    <div class="receipt-row total"><span class="r-label">TOTAL</span><span class="r-value">₹${total}</span></div>`;
  document.getElementById('paymentError').textContent = '';
  document.getElementById('paymentOverlay').classList.remove('hidden');
}

async function initiatePayment() {
  if (!currentPaymentData) return;
  const errEl = document.getElementById('paymentError');
  errEl.textContent = '';
  try {
    const res  = await fetch('/api/create-payment-order', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        ticket_id: currentPaymentData.ticketId,
        number_plate: currentPaymentData.plate,
        amount: currentPaymentData.amount
      })
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = data.message; return; }

    if (data.mock) {
      // Mock payment — no real Razorpay key yet
      showToast('Payment recorded (test mode — add RAZORPAY_KEY_ID to .env for live)', 'info');
      document.getElementById('paymentOverlay').classList.add('hidden');
      await loadPayments();
      return;
    }

    // Real Razorpay checkout
    const options = {
      key:         data.key_id,
      amount:      data.amount * 100,
      currency:    'INR',
      name:        'Smart Parking System',
      description: `Parking — ${currentPaymentData.plate}`,
      order_id:    data.order_id,
      handler: async (response) => {
        const vRes = await fetch('/api/verify-payment', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            ticket_id:           currentPaymentData.ticketId,
          })
        });
        const vData = await vRes.json();
        if (vData.success) {
          showToast('Payment successful!', 'success');
          document.getElementById('paymentOverlay').classList.add('hidden');
          await loadPayments();
        }
      },
      theme: { color: '#f0c040' }
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (e) { errEl.textContent = 'Payment error. Try again.'; }
}

function skipPayment() {
  document.getElementById('paymentOverlay').classList.add('hidden');
  showToast('Payment skipped — cash collected', 'info');
}

// ── MEDIUM #2 — GST INVOICE DOWNLOAD ────────────────────

async function downloadInvoice(ticketId) {
  showToast('Generating invoice...', 'info');
  try {
    const res = await fetch(`/api/invoice/${ticketId}`);
    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `invoice_${ticketId}.pdf`;
      a.click(); URL.revokeObjectURL(url);
      showToast('Invoice downloaded', 'success');
    } else {
      const d = await res.json();
      showToast(d.message || 'Invoice failed', 'error');
    }
  } catch (e) { showToast('Invoice generation failed', 'error'); }
}

// ── MEDIUM #7 — SUBSCRIPTIONS ────────────────────────────

async function subscribePlan(plan) {
  try {
    const res  = await fetch('/api/subscriptions', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ plan })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Subscribed to ${plan.toUpperCase()} plan${data.mock ? ' (test mode)' : ''}`, 'success');
      await loadSubscription();
    } else {
      showToast(data.message, 'error');
    }
  } catch (e) { showToast('Subscription error', 'error'); }
}

async function loadSubscription() {
  try {
    const res  = await fetch('/api/subscriptions');
    const data = await res.json();
    const info = document.getElementById('currentSubInfo');
    if (!info) return;
    if (data.subscription) {
      const s = data.subscription;
      info.innerHTML = `
        <div class="rule-card" style="border-left-color:var(--green);">
          <div style="flex:1;">
            <div class="rule-name">${s.plan.toUpperCase()} PLAN — ${s.status.toUpperCase()}</div>
            <div class="rule-hours">Rs ${s.amount}/month · Next billing: ${s.next_billing ? s.next_billing.slice(0,10) : 'N/A'}</div>
          </div>
        </div>`;
    } else {
      info.innerHTML = '<div class="empty-state">No active subscription. Choose a plan below.</div>';
    }
  } catch (e) {}
}

// ── MEDIUM #8 — EMAIL REPORTS ────────────────────────────

function openEmailReport() {
  const now = new Date();
  document.getElementById('reportMonth').value = now.toISOString().slice(0,7);
  document.getElementById('reportEmail').value = '';
  document.getElementById('reportEmailError').textContent = '';
  document.getElementById('emailReportOverlay').classList.remove('hidden');
}

function closeEmailReport() {
  document.getElementById('emailReportOverlay').classList.add('hidden');
}

async function sendEmailReport() {
  const errEl = document.getElementById('reportEmailError');
  errEl.textContent = '';
  const body = {
    email: document.getElementById('reportEmail').value.trim(),
    month: document.getElementById('reportMonth').value,
  };
  if (!body.email) { errEl.textContent = 'Email is required'; return; }
  try {
    const res  = await fetch('/api/reports/email', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) { closeEmailReport(); showToast('Report sent successfully', 'success'); }
    else errEl.textContent = data.message;
  } catch (e) { errEl.textContent = 'Error sending email'; }
}

// ── MEDIUM #12 — WHITE-LABEL TENANT ──────────────────────

let tenantVisible = false;

async function toggleTenant() {
  tenantVisible = !tenantVisible;
  const panel = document.getElementById('tenantPanel');
  if (tenantVisible) { panel.classList.remove('hidden'); await loadTenant(); }
  else               { panel.classList.add('hidden'); }
}

async function loadTenant() {
  try {
    const res  = await fetch('/api/tenant');
    const data = await res.json();
    if (data.tenant) {
      document.getElementById('tenantBrandName').value    = data.tenant.brand_name || '';
      document.getElementById('tenantLogoUrl').value      = data.tenant.logo_url || '';
      document.getElementById('tenantPrimaryColor').value = data.tenant.primary_color || '#f0c040';
      document.getElementById('tenantAccentColor').value  = data.tenant.accent_color || '#00c8f0';
      document.getElementById('tenantDomain').value       = data.tenant.domain || '';
    }
  } catch (e) {}
}

async function saveTenant() {
  const errEl = document.getElementById('tenantError');
  errEl.textContent = '';
  const body = {
    brand_name:    document.getElementById('tenantBrandName').value.trim(),
    logo_url:      document.getElementById('tenantLogoUrl').value.trim(),
    primary_color: document.getElementById('tenantPrimaryColor').value,
    accent_color:  document.getElementById('tenantAccentColor').value,
    domain:        document.getElementById('tenantDomain').value.trim(),
  };
  try {
    const res  = await fetch('/api/tenant', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Branding saved', 'success');
      // Apply colors live
      document.documentElement.style.setProperty('--gold', body.primary_color);
      document.documentElement.style.setProperty('--cyan', body.accent_color);
      if (body.brand_name) {
        document.querySelector('.brand-name').textContent = body.brand_name.toUpperCase();
      }
    } else errEl.textContent = data.message;
  } catch (e) { errEl.textContent = 'Error saving branding'; }
}

// ── MEDIUM #14 — AI SURGE SUGGESTIONS ───────────────────

async function loadSurgeSuggestions() {
  const content = document.getElementById('aiSuggestContent');
  content.innerHTML = '<div class="empty-state">Analysing peak patterns...</div>';
  try {
    const res  = await fetch('/api/ai/suggest-surge');
    const data = await res.json();
    if (!data.suggestions || data.suggestions.length === 0) {
      content.innerHTML = '<div class="empty-state">No peak patterns detected yet. Need more exit history.</div>'; return;
    }
    content.innerHTML = data.suggestions.map(s => `
      <div class="rule-card">
        <div style="flex:1;">
          <div class="rule-name">${s.name}</div>
          <div class="rule-hours">${String(s.hour_start).padStart(2,'0')}:00 – ${String(s.hour_end).padStart(2,'0')}:00 · ${s.reason}</div>
        </div>
        <div class="rule-multiplier">${s.multiplier}x</div>
        <button class="btn-add-rule" style="font-size:0.56rem;padding:5px 10px;"
                onclick="applyAISuggestion(${JSON.stringify(s).replace(/"/g,'&quot;')})">APPLY</button>
      </div>`).join('');
  } catch (e) { content.innerHTML = '<div class="empty-state">Error loading suggestions.</div>'; }
}

async function applyAISuggestion(suggestion) {
  try {
    const res  = await fetch('/api/ai/apply-suggestion', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(suggestion)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Rule applied: ${suggestion.name}`, 'success');
      await loadPricingRules();
    }
  } catch (e) { showToast('Error applying suggestion', 'error'); }
}

// ── SHOW AI SUGGEST TAB IN AI PANEL ─────────────────────
// Patch toggleAI to also show suggestions button
const _origToggleAI = toggleAI;
toggleAI = async function() {
  await _origToggleAI();
  // Add suggest button to AI panel if not present
  const header = document.querySelector('#aiPanel .pricing-header');
  if (header && !document.getElementById('aiSuggestBtn')) {
    const btn = document.createElement('button');
    btn.id = 'aiSuggestBtn';
    btn.className = 'btn-add-rule';
    btn.style.marginLeft = '8px';
    btn.textContent = '⚡ SURGE SUGGESTIONS';
    btn.onclick = async () => {
      const panel = document.getElementById('aiSuggestPanel');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) await loadSurgeSuggestions();
    };
    header.appendChild(btn);
  }
};

// ── SHOW TENANT BTN FOR ADMIN ────────────────────────────
const _origCheckUserRole = checkUserRole;
checkUserRole = async function() {
  await _origCheckUserRole();
  try {
    const res  = await fetch('/api/me');
    const data = await res.json();
    if (data.role === 'admin') {
      const btn = document.getElementById('tenantBtn');
      if (btn) btn.style.display = 'block';
    }
  } catch (e) {}
};