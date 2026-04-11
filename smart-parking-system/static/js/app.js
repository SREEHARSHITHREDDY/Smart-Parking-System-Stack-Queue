/* ═══════════════════════════════════════════════════════════
   SMART PARKING SYSTEM — app.js  v4
   Author: C. Sree Harshith Reddy
   Includes: single floor, multi-floor, slot picker
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
let floorMode       = 'single';        // setup modal state
let activeFloorTab  = null;            // blueprint tab
let pickerFloorTab  = null;            // picker floor tab

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
function addRow(builderId, btnLabel) {
  const bId    = builderId || 'rowBuilder';
  const builder = document.getElementById(bId);
  const rowCount = builder.children.length;
  if (rowCount >= 26) { showToast('Maximum 26 rows allowed', 'error'); return; }

  const rowLetter = String.fromCharCode(65 + rowCount);
  const div = document.createElement('div');
  div.className  = 'row-item';
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
  card.className  = 'floor-card';
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
  addFloorRow(fid);   // start with one row
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
  div.className  = 'floor-row-item row-item';
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
  const cards = document.querySelectorAll('.floor-card');
  const result = [];
  cards.forEach(card => {
    const fid   = card.dataset.fid;
    const name  = card.querySelector('.floor-name-input').value.trim() || `Floor ${result.length + 1}`;
    const rows  = getRowConfigFromBuilder(`rows_${fid}`);
    result.push({ name, rows });
  });
  return result;
}

/* ══════════════════════════════════════════════════════════
   PREVIEW (works for both modes)
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
      // Floor label
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

  // Header stats
  document.getElementById('hstatCapacity').querySelector('.hstat-val').textContent = stats.capacity;
  document.getElementById('hstatOccupied').querySelector('.hstat-val').textContent = stats.occupied;
  document.getElementById('hstatEmpty').querySelector('.hstat-val').textContent    = stats.empty;
  document.getElementById('hstatQueue').querySelector('.hstat-val').textContent    = stats.queue_length;

  // Occupancy bar
  const pct  = stats.occupancy_pct;
  const fill = document.getElementById('occBarFill');
  fill.style.width = pct + '%';
  fill.className   = 'occ-bar-fill' + (pct >= 85 ? ' full' : pct >= 60 ? ' warn' : '');
  document.getElementById('occBarLabel').textContent = Math.round(pct) + '% OCCUPIED';

  // Revenue
  document.getElementById('revenueAmount').textContent = '₹' + data.revenue.toFixed(0);

  // Multi-floor UI updates
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

  // Blueprint
  renderBlueprint(data.row_config, data.layout, data.floor_config);
  renderQueue(data.queue);

  // Refresh picker if open
  if (!document.getElementById('slotPickerOverlay').classList.contains('hidden')) {
    renderSlotPickerForFloor(pickerFloorTab);
  }

  // Invalidate chosen slot if taken
  if (chosenSlot && latestLayout[chosenSlot] && latestLayout[chosenSlot].status === 'occupied') {
    clearChosenSlot();
    showToast(`Slot ${chosenSlot} was just taken — please choose again`, 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   FLOOR TABS (blueprint)
══════════════════════════════════════════════════════════ */
function setupFloorTabs(floorCfg, floorStats) {
  const tabBar = document.getElementById('floorTabs');
  tabBar.classList.remove('hidden');

  // Only rebuild if floor count changed
  const existing = tabBar.querySelectorAll('.floor-tab');
  if (existing.length === floorCfg.length) {
    // Just update occupancy text
    floorCfg.forEach((fl, i) => {
      const fs = floorStats ? floorStats[i] : null;
      const occ = existing[i].querySelector('.tab-occ');
      if (occ && fs) occ.textContent = `${fs.occupied}/${fs.capacity}`;
    });
    return;
  }

  tabBar.innerHTML = '';
  floorCfg.forEach((fl, i) => {
    const fs  = floorStats ? floorStats[i] : null;
    const tab = document.createElement('button');
    tab.className   = 'floor-tab' + (i === 0 ? ' active' : '');
    tab.dataset.floor = fl.name;
    tab.innerHTML   = `${fl.name}<span class="tab-occ">${fs ? `${fs.occupied}/${fs.capacity}` : ''}</span>`;
    tab.onclick     = () => switchFloorTab(fl.name);
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

/* ══════════════════════════════════════════════════════════
   FLOOR SUMMARY BAR
══════════════════════════════════════════════════════════ */
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
        <div class="fsc-bar-fill ${pct >= 85 ? 'full' : pct >= 60 ? 'warn' : ''}"
             style="width:${pct}%"></div>
      </div>
      <div class="fsc-nums"><span>${fs.empty}</span> free · <span>${fs.occupied}</span> used</div>
    `;
    bar.appendChild(card);
  });
}

/* ══════════════════════════════════════════════════════════
   FLOOR PREFERENCE SELECT
══════════════════════════════════════════════════════════ */
function setupFloorPrefSelect(floorCfg) {
  const sel = document.getElementById('floorPrefSelect');
  if (sel.options.length === floorCfg.length + 1) return; // already built

  sel.innerHTML = '<option value="">Any floor (auto-assign)</option>';
  floorCfg.forEach(fl => {
    const opt    = document.createElement('option');
    opt.value    = fl.name;
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

        const cell = buildSlotCell(slotId, occupied, slotData);
        row.appendChild(cell);
      }
      grid.appendChild(row);
    });

  } else {
    // Single floor
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

  // Click opens popup
  cell.onclick = () => openSlotPopup(slotId);

  const idSpan    = document.createElement('span');
  idSpan.className   = 'slot-id';
  idSpan.textContent = slotId.includes('-') ? slotId.split('-')[1] : slotId;

  const plateSpan    = document.createElement('span');
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
   VEHICLE TYPE
══════════════════════════════════════════════════════════ */
function selectType(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedType = btn.dataset.type;
}

/* ══════════════════════════════════════════════════════════
   ASSIGN MODE
══════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════
   SLOT PICKER
══════════════════════════════════════════════════════════ */
function openSlotPicker() {
  const plate = document.getElementById('parkPlate').value.trim().toUpperCase() || '—';
  document.getElementById('spiPlate').textContent = plate;
  document.getElementById('spiSlot').textContent  = chosenSlot || 'NONE';
  document.getElementById('confirmSlotBtn').disabled = !chosenSlot;

  // Setup picker floor tabs if multi-floor
  const tabsEl = document.getElementById('pickerFloorTabs');
  if (isMultiFloor && latestFloorCfg) {
    tabsEl.classList.remove('hidden');
    tabsEl.innerHTML = '';
    latestFloorCfg.forEach((fl, i) => {
      const tab = document.createElement('button');
      tab.className    = 'picker-floor-tab' + (i === 0 ? ' active' : '');
      tab.dataset.floor = fl.name;
      tab.textContent  = fl.name;
      tab.onclick      = () => switchPickerFloor(fl.name);
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
    // Single floor
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

  // Show short ID (strip floor prefix for display)
  const displayId = slotId.includes('-') ? slotId.split('-')[1] : slotId;

  const idEl    = document.createElement('span');
  idEl.className   = 'sp-id';
  idEl.textContent = displayId;

  const plateEl    = document.createElement('span');
  plateEl.className   = 'sp-plate';
  plateEl.textContent = occupied ? slotData.vehicle.number_plate : 'FREE';

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
  const plate  = document.getElementById('parkPlate').value.trim().toUpperCase();
  const msgEl  = document.getElementById('parkMsg');
  msgEl.textContent = '';
  msgEl.className   = 'form-msg';

  if (!plate) { setMsg(msgEl, 'Please enter a vehicle number.', 'error'); return; }

  const plateRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;
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

function setAssignModeQuiet(mode) {
  assignMode = mode;
  document.getElementById('assignAuto').classList.toggle('active',   mode === 'auto');
  document.getElementById('assignManual').classList.toggle('active', mode === 'manual');
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
    <div class="receipt-row">
      <span class="r-label">Vehicle Number</span>
      <span class="r-value">${data.number_plate}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Vehicle Type</span>
      <span class="r-value">${data.vehicle_type.toUpperCase()}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Slot</span>
      <span class="r-value">${data.slot}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Entry Time</span>
      <span class="r-value">${data.entry_time}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Exit Time</span>
      <span class="r-value">${data.exit_time}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Duration</span>
      <span class="r-value">${durStr}</span>
    </div>
    <div class="receipt-row total">
      <span class="r-label">AMOUNT CHARGED</span>
      <span class="r-value">₹${data.fee}</span>
    </div>
  `;
  document.getElementById('receiptOverlay').classList.remove('hidden');
}

function closeReceipt() { document.getElementById('receiptOverlay').classList.add('hidden'); }
function printReceipt() { window.print(); }

/* ── STATE ─ (keep everything above this unchanged) ── */

/* ══════════════════════════════════════════════════════════
   CAMERA — Stage 2.1 + Plate Format Fix
   Auto-scan, side-by-side, all Indian plate formats
══════════════════════════════════════════════════════════ */

let scanInterval    = null;
let lastDetected    = null;
let scanCooldown    = false;

// ── PLATE MATCHING ────────────────────────
// Matches all Indian formats:
// TS09AB1234, TN33J1364, MH12ABC1234
const PLATE_REGEX = /[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}/;

// Noise words printed on Indian plates
const PLATE_NOISE = ['INDIA', 'IND', 'BHARAT', 'BH', 'HSRP',
                     'INA', 'INIA', 'NDIA', 'INDO'];

function cleanOcrText(raw) {
  let text = raw.toUpperCase().replace(/\s+/g, '');
  PLATE_NOISE.forEach(word => { text = text.split(word).join(''); });
  text = text.replace(/[^A-Z0-9]/g, '');
  return text;
}

function extractBestPlate(raw) {
  const cleaned = cleanOcrText(raw);
  const matches = cleaned.match(new RegExp(PLATE_REGEX.source, 'g'));
  if (!matches) return null;
  return matches.reduce((a, b) => a.length >= b.length ? a : b);
}

// Tesseract worker reused across scans
let ocrWorker = null;

async function initOcrWorker() {
  if (ocrWorker) return;
  ocrWorker = await Tesseract.createWorker('eng', 1, {
    logger: () => {}
  });
  await ocrWorker.setParameters({
    tessedit_char_whitelist:  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode:    '6',   // PSM 6 — block of text (better for multi-line plates)
    tessedit_ocr_engine_mode: '1',   // OEM 1 — LSTM only
  });
}

function openCamera(mode) {
  cameraMode    = mode;
  capturedPlate = null;
  lastDetected  = null;

  setOcrStrip('—', 'Starting camera…', false);
  document.getElementById('usePlateBtn').classList.add('hidden');
  document.getElementById('manualPlateInput').value       = '';
  document.getElementById('manualUseBtn').disabled        = true;
  document.getElementById('manualValidation').textContent = '';
  document.getElementById('manualValidation').className   = 'manual-validation';
  document.getElementById('manualPlateInput').className   = 'manual-always-input';
  document.getElementById('ocrSuggestion').classList.add('hidden');
  document.getElementById('cameraOverlay').classList.remove('hidden');

  initOcrWorker();

  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width:      { ideal: 1280 },
      height:     { ideal: 720 },
      frameRate:  { ideal: 30 }
    }
  })
  .then(stream => {
    cameraStream = stream;
    const video  = document.getElementById('cameraFeed');
    video.srcObject = stream;
    video.play().then(() => startAutoScan());
  })
  .catch(() => {
    setOcrStrip('CAMERA ERROR', 'Permission denied or not available', false);
    document.getElementById('camLiveBadge').style.display = 'none';
    showToast('Camera unavailable — use manual entry', 'error');
  });
}

function closeCamera() {
  stopAutoScan();
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraFeed');
  if (video) video.srcObject = null;
  document.getElementById('cameraOverlay').classList.add('hidden');
  lastDetected = null;
}

function startAutoScan() {
  stopAutoScan();
  setOcrStrip('—', 'Scanning…', false);
  setBadgeScanning(true);
  scanInterval = setInterval(() => {
    if (!scanCooldown) runOcrScan();
  }, 1800);
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
    const vw = video.videoWidth  || 640;
    const vh = video.videoHeight || 480;

    // ── STEP 1: CAPTURE FULL FRAME ────────────────────────
    const fullCanvas = document.getElementById('cameraCanvas');
    fullCanvas.width  = vw;
    fullCanvas.height = vh;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(video, 0, 0, vw, vh);

    // ── STEP 2: CROP CENTRE REGION ────────────────────────
    // Plates are typically in the centre 80% width, middle 60% height
    const cropX = Math.floor(vw * 0.10);
    const cropY = Math.floor(vh * 0.25);
    const cropW = Math.floor(vw * 0.80);
    const cropH = Math.floor(vh * 0.50);

    // Create processing canvas — upscale 2x for better OCR
    const scale     = 2;
    const procCanvas = document.createElement('canvas');
    procCanvas.width  = cropW * scale;
    procCanvas.height = cropH * scale;
    const procCtx = procCanvas.getContext('2d');

    // Draw cropped + upscaled region
    procCtx.drawImage(
      fullCanvas,
      cropX, cropY, cropW, cropH,        // source crop
      0, 0, procCanvas.width, procCanvas.height  // dest (scaled up)
    );

    // ── STEP 3: PREPROCESS FOR OCR ────────────────────────
    const processedCanvas = applyPreprocessing(procCanvas);

    // ── STEP 4: OCR ON PROCESSED IMAGE ───────────────────
    await initOcrWorker();
    const result   = await ocrWorker.recognize(processedCanvas);
    const rawFull  = result.data.text;
    const conf     = Math.round(result.data.confidence);
    let   plate    = extractBestPlate(rawFull);

    // ── STEP 5: TRY INVERTED IF NO MATCH ─────────────────
    // Handles dark/night plates (white bg → black text already done)
    // Some plates: black bg + white text — invert helps
    if (!plate) {
      const invertedCanvas = applyPreprocessing(procCanvas, true);
      const result2  = await ocrWorker.recognize(invertedCanvas);
      const rawFull2 = result2.data.text;
      plate = extractBestPlate(rawFull2);
    }

    // ── STEP 6: HANDLE RESULT ─────────────────────────────
    if (plate) {
      lastDetected  = plate;
      capturedPlate = plate;

      setOcrStrip(plate, `Confidence ${conf}%`, true);
      document.getElementById('ocrStrip').style.borderColor = 'var(--green)';
      document.getElementById('ocrSuggestion').classList.add('hidden');
      document.getElementById('usePlateBtn').classList.remove('hidden');

      // Auto-fill manual input if empty
      const manualInput = document.getElementById('manualPlateInput');
      if (!manualInput.value) {
        manualInput.value = plate;
        validateManualInput(manualInput);
      }

      stopAutoScan();
      setBadgeScanning(false);
      showToast(`Plate detected: ${plate}`, 'success');

    } else {
      const cleaned = cleanOcrText(rawFull);
      setOcrStrip('NO PLATE DETECTED', `Conf ${conf}% — aim at plate`, false);
      document.getElementById('ocrStrip').style.borderColor = 'var(--border)';
      document.getElementById('usePlateBtn').classList.add('hidden');

      if (cleaned.length >= 4) {
        document.getElementById('suggestionBtn').textContent = cleaned.slice(0, 10);
        document.getElementById('ocrSuggestion').classList.remove('hidden');
      } else {
        document.getElementById('ocrSuggestion').classList.add('hidden');
      }
    }

  } catch (e) {
    setOcrStrip('SCAN ERROR', 'Retrying…', false);
  } finally {
    scanCooldown = false;
  }
}


/* ══════════════════════════════════════════════════════════
   IMAGE PREPROCESSING — Stage 2.2
   Greyscale → Adaptive threshold → Optional invert
══════════════════════════════════════════════════════════ */

function applyPreprocessing(sourceCanvas, invert = false) {
  const w   = sourceCanvas.width;
  const h   = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width  = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data      = imageData.data;

  // ── 1. GREYSCALE ──────────────────────────
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    grey[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // ── 2. GAUSSIAN BLUR (3x3) — reduce noise ─
  const blurred = new Uint8Array(w * h);
  const kernel  = [1,2,1, 2,4,2, 1,2,1];
  const kSum    = 16;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      let ki  = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += grey[(y + ky) * w + (x + kx)] * kernel[ki++];
        }
      }
      blurred[y * w + x] = sum / kSum;
    }
  }
  // Fill edges
  for (let x = 0; x < w; x++) {
    blurred[x]             = grey[x];
    blurred[(h-1)*w + x]   = grey[(h-1)*w + x];
  }
  for (let y = 0; y < h; y++) {
    blurred[y * w]         = grey[y * w];
    blurred[y * w + w - 1] = grey[y * w + w - 1];
  }

  // ── 3. ADAPTIVE THRESHOLD ─────────────────
  // For each pixel, compare to local average in a window
  // Makes text sharp black regardless of lighting
  const blockSize = Math.max(11, Math.floor(Math.min(w, h) / 20) | 1); // must be odd
  const C         = 8;   // constant subtracted from mean
  const binary    = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const half = Math.floor(blockSize / 2);
      let   sum  = 0;
      let   cnt  = 0;

      for (let ky = Math.max(0, y - half); ky <= Math.min(h - 1, y + half); ky++) {
        for (let kx = Math.max(0, x - half); kx <= Math.min(w - 1, x + half); kx++) {
          sum += blurred[ky * w + kx];
          cnt++;
        }
      }

      const mean     = sum / cnt;
      const pixelVal = blurred[y * w + x];
      binary[y * w + x] = pixelVal < (mean - C) ? 0 : 255;
    }
  }

  // ── 4. OPTIONAL INVERT ────────────────────
  for (let i = 0; i < w * h; i++) {
    let val = binary[i];
    if (invert) val = 255 - val;
    data[i * 4]     = val;
    data[i * 4 + 1] = val;
    data[i * 4 + 2] = val;
    data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}

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
      document.getElementById('rowBuilder').innerHTML = '';
      document.getElementById('floorBuilder').innerHTML = '';
      floorCount   = 0;
      floorMode    = 'single';
      activeFloorTab  = null;
      pickerFloorTab  = null;
      isMultiFloor    = false;
      latestLayout    = {};
      latestConfig    = [];
      latestFloorCfg  = null;
      clearChosenSlot();
      setFloorMode('single');
      addRow();
      showToast('System reset', 'info');
    }
  } catch (e) { showToast('Reset failed', 'error'); }
}
/* ══════════════════════════════════════════════════════════
   SLOT CLICK POPUP
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

  // Show correct panel
  document.getElementById('popupOccupied').style.display = occupied ? 'block' : 'none';
  document.getElementById('popupEmpty').style.display    = occupied ? 'none'  : 'block';

  if (occupied) {
    const v = slotData.vehicle;

    // Short slot ID for display (strip floor prefix)
    const displayId = slotId.includes('-') ? slotId.split('-')[1] : slotId;
    document.getElementById('popupSlotId').textContent = displayId;
    document.getElementById('popupPlate').textContent  = v.number_plate;
    document.getElementById('popupType').textContent   = v.vehicle_type.toUpperCase();
    document.getElementById('popupTicket').textContent = v.ticket_id;

    // Entry time
    const entryStr = v.entry_time.includes('T')
      ? v.entry_time.split('T')[1].slice(0, 8)
      : v.entry_time;
    document.getElementById('popupEntry').textContent = entryStr;

    // Live duration + fee ticker
    if (durationInterval) clearInterval(durationInterval);
    function updateDuration() {
      const entryDate = new Date(v.entry_time);
      const now       = new Date();
      let   diffMins  = Math.floor((now - entryDate) / 60000);
      if (diffMins < 0) diffMins = 0;

      const hrs    = Math.floor(diffMins / 60);
      const mins   = diffMins % 60;
      const durStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      document.getElementById('popupDuration').textContent = durStr;

      // Estimated fee
      const rate       = RATES[v.vehicle_type] || 30;
      const billHours  = Math.max(1, Math.ceil(diffMins / 60));
      const estFee     = billHours * rate;
      document.getElementById('popupFee').textContent = `₹${estFee}`;
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
  // Close on overlay click (but not modal click)
  if (event && event.target !== document.getElementById('slotPopupOverlay')) return;
  if (durationInterval) { clearInterval(durationInterval); durationInterval = null; }
  document.getElementById('slotPopupOverlay').classList.add('hidden');
  popupSlotId  = null;
  popupVehicle = null;
}

function quickExit() {
  if (!popupVehicle) return;
  // Pre-fill exit form with plate number
  document.getElementById('exitIdentifier').value = popupVehicle.number_plate;
  closeSlotPopup();
  showToast(`Ready to exit ${popupVehicle.number_plate}`, 'info');
  // Scroll to exit panel
  document.getElementById('exitIdentifier').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('exitIdentifier').focus();
}

function quickPark() {
  if (!popupSlotId) return;
  // Switch to manual mode with this slot pre-selected
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