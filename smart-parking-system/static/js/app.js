/* ═══════════════════════════════════════════════════════════
   SMART PARKING SYSTEM — app.js  v6  (Phase 3 Complete)
   Author: C. Sree Harshith Reddy
   Adds: blueprint image upload · image mode · draggable slot
         markers · position persistence · save positions API
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

/* ── PHASE 3 STATE ───────────────────────────────────────── */
let blueprintMode      = 'grid';   // 'grid' | 'image'
let hasBlueprint       = false;
let bupSelectedFile    = null;     // File object chosen in setup modal
let draggingMarker     = null;     // { slotId, el, startX, startY, origX, origY }
let pendingPositions   = {};       // { slotId: {x,y} } — unsaved drag changes

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
   PHASE 3 — BLUEPRINT UPLOAD (setup modal)
══════════════════════════════════════════════════════════ */

function bupDragOver(e) {
  e.preventDefault();
  document.getElementById('bupDropzone').classList.add('dragover');
}
function bupDragLeave(e) {
  document.getElementById('bupDropzone').classList.remove('dragover');
}
function bupDrop(e) {
  e.preventDefault();
  document.getElementById('bupDropzone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) bupLoadFile(file);
}
function bupFileSelected(input) {
  if (input.files[0]) bupLoadFile(input.files[0]);
}

function bupLoadFile(file) {
  const allowed = ['image/png','image/jpeg','image/gif','image/webp'];
  if (!allowed.includes(file.type)) {
    showToast('Invalid file type — use PNG, JPG, GIF or WEBP', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('File too large — max 10MB', 'error');
    return;
  }

  bupSelectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('bupPreviewImg').src = e.target.result;
    document.getElementById('bupPreviewName').textContent = file.name;
    document.getElementById('bupDropzone').classList.add('hidden');
    document.getElementById('bupPreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function bupRemoveFile() {
  bupSelectedFile = null;
  document.getElementById('bupPreviewImg').src    = '';
  document.getElementById('bupPreviewName').textContent = '';
  document.getElementById('bupFileInput').value   = '';
  document.getElementById('bupDropzone').classList.remove('hidden');
  document.getElementById('bupPreview').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   SUBMIT SETUP  (uploads image first if selected, then config)
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

  // Upload blueprint image first if one was selected
  if (bupSelectedFile) {
    const formData = new FormData();
    formData.append('blueprint', bupSelectedFile);
    try {
      const upRes  = await fetch('/api/upload-blueprint', { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (!upData.success) {
        errEl.textContent = `Image upload failed: ${upData.message}`;
        return;
      }
    } catch (e) {
      errEl.textContent = 'Image upload failed — check server connection.';
      return;
    }
  }

  // Then POST lot configuration
  try {
    const res  = await fetch('/api/setup', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
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
  hasBlueprint   = data.hasBlueprint || false;

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

  // Show/hide the Grid vs Map toggle
  const modeToggle = document.getElementById('bpModeToggle');
  if (hasBlueprint) {
    modeToggle.classList.remove('hidden');
  } else {
    modeToggle.classList.add('hidden');
    // If blueprint removed, fall back to grid
    if (blueprintMode === 'image') setBlueprintMode('grid');
  }

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

  // Render whichever blueprint mode is active
  if (blueprintMode === 'image' && hasBlueprint) {
    renderImageBlueprint();
  } else {
    renderBlueprint(data.row_config, data.layout, data.floor_config);
  }

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
   FLOOR TABS (blueprint)
══════════════════════════════════════════════════════════ */
function setupFloorTabs(floorCfg, floorStats) {
  const tabBar = document.getElementById('floorTabs');
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
  if (blueprintMode === 'image' && hasBlueprint) {
    renderImageBlueprint();
  } else {
    renderBlueprint(latestConfig, latestLayout, latestFloorCfg);
  }
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
        <div class="fsc-bar-fill ${pct >= 85 ? 'full' : pct >= 60 ? 'warn' : ''}" style="width:${pct}%"></div>
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
   BLUEPRINT MODE TOGGLE  — Phase 3
══════════════════════════════════════════════════════════ */
function setBlueprintMode(mode) {
  blueprintMode = mode;
  document.getElementById('bpModeGrid').classList.toggle('active',  mode === 'grid');
  document.getElementById('bpModeImage').classList.toggle('active', mode === 'image');

  const gridEl  = document.getElementById('blueprintGrid');
  const imageEl = document.getElementById('blueprintImageWrap');

  if (mode === 'image' && hasBlueprint) {
    gridEl.classList.add('hidden');
    imageEl.classList.remove('hidden');
    renderImageBlueprint();
  } else {
    gridEl.classList.remove('hidden');
    imageEl.classList.add('hidden');
    renderBlueprint(latestConfig, latestLayout, latestFloorCfg);
  }
}

/* ══════════════════════════════════════════════════════════
   GRID BLUEPRINT RENDER
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
   IMAGE BLUEPRINT RENDER  — Phase 3
   Slot markers overlaid absolutely on the blueprint image,
   positioned by saved x%/y% or spread in a grid as default.
══════════════════════════════════════════════════════════ */
function renderImageBlueprint() {
  const wrap      = document.getElementById('blueprintImageWrap');
  const markersEl = document.getElementById('blueprintMarkers');
  const bgImg     = document.getElementById('blueprintBgImage');

  // Set image src with cache-bust so it reloads if changed
  bgImg.src = `/static/uploads/blueprint.png?t=${Date.now()}`;

  markersEl.innerHTML = '';
  pendingPositions    = {};

  // Build list of slot IDs for current view
  let slotIds = [];
  if (isMultiFloor && latestFloorCfg) {
    const targetFloor = activeFloorTab || latestFloorCfg[0].name;
    const floor       = latestFloorCfg.find(f => f.name === targetFloor);
    if (floor) {
      floor.rows.forEach((count, ri) => {
        const letter = String.fromCharCode(65 + ri);
        for (let ci = 0; ci < count; ci++) {
          slotIds.push(`${targetFloor}-${letter}${ci + 1}`);
        }
      });
    }
  } else {
    latestConfig.forEach((count, ri) => {
      const letter = String.fromCharCode(65 + ri);
      for (let ci = 0; ci < count; ci++) {
        slotIds.push(`${letter}${ci + 1}`);
      }
    });
  }

  const total = slotIds.length;

  slotIds.forEach((slotId, idx) => {
    const slotData = latestLayout[slotId];
    const occupied = slotData && slotData.status === 'occupied';

    // Use saved position if exists, else spread in grid across image
    let posX, posY;
    if (slotData && slotData.position) {
      posX = slotData.position.x;
      posY = slotData.position.y;
    } else {
      // Default grid spread: evenly across image in rows of ~10
      const cols    = Math.ceil(Math.sqrt(total * 1.6));
      const col     = idx % cols;
      const row     = Math.floor(idx / cols);
      const totalRows = Math.ceil(total / cols);
      posX = 5 + (col / Math.max(cols - 1, 1)) * 88;
      posY = 8 + (row / Math.max(totalRows - 1, 1)) * 80;
    }

    const marker = document.createElement('div');
    marker.className     = 'bp-marker' + (occupied ? ' bp-marker-occupied' : ' bp-marker-empty');
    marker.dataset.slot  = slotId;
    marker.style.left    = posX + '%';
    marker.style.top     = posY + '%';

    const displayId = slotId.includes('-') ? slotId.split('-')[1] : slotId;
    marker.innerHTML = `
      <span class="bp-marker-id">${displayId}</span>
      ${occupied ? `<span class="bp-marker-plate">${slotData.vehicle.number_plate}</span>` : ''}
    `;

    // Tooltip on hover
    marker.title = occupied
      ? `${slotId} · ${slotData.vehicle.number_plate} · ${slotData.vehicle.vehicle_type}`
      : `${slotId} · Available`;

    // Click opens slot popup
    marker.addEventListener('click', (e) => {
      if (!e._wasDragged) openSlotPopup(slotId);
    });

    // Drag to reposition
    attachMarkerDrag(marker, slotId, markersEl);

    markersEl.appendChild(marker);
  });
}

/* ══════════════════════════════════════════════════════════
   DRAGGABLE MARKER LOGIC  — Phase 3
   Works for both mouse (desktop) and touch (mobile)
══════════════════════════════════════════════════════════ */
function attachMarkerDrag(marker, slotId, container) {
  let startClientX, startClientY;
  let startPctX, startPctY;
  let moved = false;

  function getClientXY(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function onStart(e) {
    e.preventDefault();
    moved = false;
    const { x, y } = getClientXY(e);
    startClientX = x;
    startClientY = y;
    startPctX    = parseFloat(marker.style.left);
    startPctY    = parseFloat(marker.style.top);
    marker.classList.add('bp-marker-dragging');

    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('mouseup',   onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onEnd);
  }

  function onMove(e) {
    e.preventDefault();
    const { x, y }  = getClientXY(e);
    const rect       = container.getBoundingClientRect();
    const dx         = x - startClientX;
    const dy         = y - startClientY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

    const newPctX = Math.min(95, Math.max(0, startPctX + (dx / rect.width)  * 100));
    const newPctY = Math.min(95, Math.max(0, startPctY + (dy / rect.height) * 100));

    marker.style.left = newPctX + '%';
    marker.style.top  = newPctY + '%';

    // Stage in pending (not yet saved to backend)
    pendingPositions[slotId] = { x: newPctX, y: newPctY };
  }

  function onEnd(e) {
    marker.classList.remove('bp-marker-dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onEnd);

    // Mark event so click handler knows it was a drag
    if (moved && e.type === 'mouseup') {
      const clickEv = new MouseEvent('click', { bubbles: false });
      clickEv._wasDragged = true;
      // suppress — don't open popup after drag
    }
  }

  marker.addEventListener('mousedown', onStart, { passive: false });
  marker.addEventListener('touchstart', onStart, { passive: false });
}

/* ══════════════════════════════════════════════════════════
   SAVE SLOT POSITIONS  — Phase 3
   Sends all dragged positions to the backend.
══════════════════════════════════════════════════════════ */
async function saveSlotPositions() {
  if (Object.keys(pendingPositions).length === 0) {
    showToast('No changes to save — drag markers first', 'info');
    return;
  }

  try {
    const res  = await fetch('/api/save-slot-positions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ positions: pendingPositions })
    });
    const data = await res.json();

    if (data.success) {
      // Merge saved positions into latestLayout so they survive next poll
      for (const [slotId, pos] of Object.entries(pendingPositions)) {
        if (latestLayout[slotId]) latestLayout[slotId].position = pos;
      }
      pendingPositions = {};
      showToast('Slot positions saved', 'success');
    } else {
      showToast('Save failed: ' + data.message, 'error');
    }
  } catch (e) {
    showToast('Server error while saving positions', 'error');
  }
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
      method: 'POST', headers: {'Content-Type': 'application/json'},
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
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ identifier })
    });
    const data = await res.json();

    if (!data.success) { setMsg(msgEl, data.message, 'error'); return; }

    document.getElementById('exitIdentifier').value = '';
    setMsg(msgEl, `Exit processed — ₹${data.fee} charged`, 'success');
    showExitReceipt(data);

    if (data.queued_vehicle_parked) {
      showToast(`Queue: ${data.queued_vehicle_parked.number_plate} parked at ${data.queued_vehicle_parked.slot}`, 'info');
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
  const durStr   = diffMins < 60 ? `${diffMins} min` : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;

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
function confirmReset() {
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').textContent = '';
  document.getElementById('pinOverlay').classList.remove('hidden');
}

function pinCancel() {
  document.getElementById('pinOverlay').classList.add('hidden');
}

function pinClearError() {
  document.getElementById('pinError').textContent = '';
}

async function pinConfirm() {
  const pin = document.getElementById('pinInput').value.trim();
  if (pin !== '0000') {
    document.getElementById('pinError').textContent = 'Incorrect PIN — try again';
    document.getElementById('pinInput').value = '';
    return;
  }
  document.getElementById('pinOverlay').classList.add('hidden');

  try {
    const res  = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      document.getElementById('app').classList.add('hidden');
      document.getElementById('setupOverlay').classList.remove('hidden');
      document.getElementById('rowBuilder').innerHTML   = '';
      document.getElementById('floorBuilder').innerHTML = '';
      floorCount       = 0;
      floorMode        = 'single';
      activeFloorTab   = null;
      pickerFloorTab   = null;
      isMultiFloor     = false;
      latestLayout     = {};
      latestConfig     = [];
      latestFloorCfg   = null;
      hasBlueprint     = false;
      blueprintMode    = 'grid';
      bupSelectedFile  = null;
      pendingPositions = {};
      analyticsVisible = false;
      fullHistory      = [];
      document.getElementById('analyticsPanel').classList.add('hidden');
      document.getElementById('analyticsToggleBtn').classList.remove('active');
      clearChosenSlot();
      setFloorMode('single');
      bupRemoveFile();
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
   CAMERA OCR  (Phase 2 — unchanged)
══════════════════════════════════════════════════════════ */
let scanInterval  = null;
let lastDetected  = null;
let scanCooldown  = false;

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
  cameraMode = mode; capturedPlate = null; lastDetected = null;
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
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } })
  .then(stream => {
    cameraStream = stream;
    const video  = document.getElementById('cameraFeed');
    video.srcObject = stream;
    video.play().then(() => startAutoScan());
  })
  .catch(() => {
    setOcrStrip('CAMERA ERROR', 'Permission denied or unavailable', false);
    document.getElementById('camLiveBadge').style.display = 'none';
    showToast('Camera unavailable — use manual entry on the right', 'error');
  });
}

function closeCamera() {
  stopAutoScan();
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  const video = document.getElementById('cameraFeed');
  if (video) video.srcObject = null;
  document.getElementById('cameraOverlay').classList.add('hidden');
  lastDetected = null;
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
      if (cleaned.length >= 4) {
        document.getElementById('suggestionBtn').textContent = cleaned.slice(0, 10);
        document.getElementById('ocrSuggestion').classList.remove('hidden');
      } else { document.getElementById('ocrSuggestion').classList.add('hidden'); }
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
  const blockSize = Math.max(11, Math.floor(Math.min(w,h)/20)|1); const C = 8; const binary = new Uint8Array(w*h);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) { const half=Math.floor(blockSize/2); let sum=0,cnt=0; for (let ky=Math.max(0,y-half);ky<=Math.min(h-1,y+half);ky++) for (let kx=Math.max(0,x-half);kx<=Math.min(w-1,x+half);kx++){sum+=blurred[ky*w+kx];cnt++;} binary[y*w+x]=blurred[y*w+x]<(sum/cnt-C)?0:255; }
  for (let i=0;i<w*h;i++){const val=invert?255-binary[i]:binary[i];data[i*4]=data[i*4+1]=data[i*4+2]=val;data[i*4+3]=255;}
  ctx.putImageData(imageData,0,0); return out;
}

function setOcrStrip(plateText, statusText, detected) {
  const plateEl  = document.getElementById('ocrPlate');
  const statusEl = document.getElementById('ocrStatus');
  if (plateEl) { plateEl.textContent = plateText; plateEl.className = 'ocr-strip-plate' + (detected ? ' detected' : plateText === '—' ? '' : ' no-detect'); }
  if (statusEl) statusEl.textContent = statusText;
}
function setBadgeScanning(scanning) {
  const badge = document.getElementById('camLiveBadge');
  if (!badge) return;
  if (scanning) { badge.classList.add('scanning'); badge.innerHTML = `<span class="cam-live-dot"></span> SCANNING`; }
  else { badge.classList.remove('scanning'); badge.innerHTML = `<span class="cam-live-dot"></span> LIVE`; }
}
function useCapturedPlate() {
  if (!capturedPlate) return;
  if (cameraMode === 'park') document.getElementById('parkPlate').value = capturedPlate;
  else if (cameraMode === 'exit') document.getElementById('exitIdentifier').value = capturedPlate;
  closeCamera(); showToast(`Plate ${capturedPlate} filled in form`, 'success');
}
function validateManualInput(inputEl) {
  const val = inputEl.value.toUpperCase().trim();
  const validEl = document.getElementById('manualValidation'); const useBtn = document.getElementById('manualUseBtn');
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
  else if (cameraMode === 'exit') document.getElementById('exitIdentifier').value = val;
  closeCamera(); showToast(`Plate ${val} filled in form`, 'success');
}
function useOcrSuggestion() {
  const suggestionBtn = document.getElementById('suggestionBtn'); if (!suggestionBtn) return;
  const input = document.getElementById('manualPlateInput');
  input.value = suggestionBtn.textContent.trim(); validateManualInput(input); input.focus();
  document.getElementById('ocrSuggestion').classList.add('hidden');
  showToast('Partial text copied — correct it and press USE', 'info');
}

/* ══════════════════════════════════════════════════════════
   TOAST & HELPERS
══════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type || ''}`; el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}
function setMsg(el, msg, type) { el.textContent = msg; el.className = `form-msg ${type}`; }

/* ══════════════════════════════════════════════════════════
   ██████████████████████████████████████████████████████
   PHASE 4 — ANALYTICS, HISTORY, CSV EXPORT
   ██████████████████████████████████████████████████████
══════════════════════════════════════════════════════════ */

let analyticsVisible = false;
let fullHistory      = [];      // master history array for client-side filter

/* ── TOGGLE ANALYTICS PANEL ─────────────────────────────── */
function toggleAnalytics() {
  analyticsVisible = !analyticsVisible;
  const panel  = document.getElementById('analyticsPanel');
  const btn    = document.getElementById('analyticsToggleBtn');
  panel.classList.toggle('hidden', !analyticsVisible);
  btn.classList.toggle('active', analyticsVisible);

  if (analyticsVisible) {
    loadAnalytics();
    loadHistory();
  }
}

/* ── LOAD ANALYTICS FROM API ─────────────────────────────── */
async function loadAnalytics() {
  try {
    const res  = await fetch('/api/analytics');
    const data = await res.json();
    if (!data.success) return;

    const a = data.analytics;

    document.getElementById('astatToday').textContent   = a.total_today;
    document.getElementById('astatAvgStay').textContent = a.avg_stay_min > 0 ? a.avg_stay_min : '—';
    document.getElementById('astatPeak').textContent    = a.peak_hour || '—';
    document.getElementById('astatRevenue').textContent = '₹' + Math.round(a.total_revenue);

    // Revenue bars
    const rb = a.revenue_by_type;
    ['car', 'bike', 'truck'].forEach(type => {
      const info = rb[type] || { amount: 0, pct: 0 };
      document.getElementById(`revBar${cap(type)}`).style.width  = info.pct + '%';
      document.getElementById(`revAmt${cap(type)}`).textContent  = '₹' + Math.round(info.amount);
    });

  } catch (e) { console.error('Analytics load failed', e); }
}

function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

/* ── LOAD HISTORY FROM API ───────────────────────────────── */
async function loadHistory() {
  try {
    const res  = await fetch('/api/history');
    const data = await res.json();
    if (!data.success) return;

    fullHistory = data.history;
    renderHistoryTable(fullHistory);
  } catch (e) { console.error('History load failed', e); }
}

/* ── RENDER HISTORY TABLE ────────────────────────────────── */
function renderHistoryTable(records) {
  const tbody = document.getElementById('historyTableBody');

  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="history-empty">No exit records yet</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const entryTime = r.entry_time.includes('T')
      ? r.entry_time.split('T')[1].slice(0, 8)
      : r.entry_time;
    const exitTime  = r.exit_time.includes('T')
      ? r.exit_time.split('T')[1].slice(0, 8)
      : r.exit_time;
    const durStr = r.duration_min < 60
      ? `${r.duration_min}m`
      : `${Math.floor(r.duration_min / 60)}h ${Math.round(r.duration_min % 60)}m`;

    const typeClass = `type-${r.vehicle_type.toLowerCase()}`;

    return `<tr>
      <td class="plate-col">${r.number_plate}</td>
      <td class="${typeClass}">${r.vehicle_type.toUpperCase()}</td>
      <td>${r.slot}</td>
      <td>${entryTime}</td>
      <td>${exitTime}</td>
      <td>${durStr}</td>
      <td class="fee-col">₹${r.fee}</td>
    </tr>`;
  }).join('');
}

/* ── CLIENT-SIDE HISTORY FILTER ──────────────────────────── */
function filterHistory(query) {
  const q = query.trim().toUpperCase();
  if (!q) {
    renderHistoryTable(fullHistory);
    return;
  }
  const filtered = fullHistory.filter(r =>
    r.number_plate.includes(q) ||
    r.ticket_id.includes(q) ||
    r.slot.toUpperCase().includes(q)
  );
  renderHistoryTable(filtered);
}

/* ── EXPORT HISTORY CSV ──────────────────────────────────── */
function exportHistoryCSV() {
  if (!fullHistory.length) {
    showToast('No history records to export', 'info');
    return;
  }

  const headers = ['Ticket ID', 'Plate', 'Type', 'Slot', 'Entry Time', 'Exit Time', 'Duration (min)', 'Fee (₹)'];
  const rows = fullHistory.map(r => [
    r.ticket_id,
    r.number_plate,
    r.vehicle_type,
    r.slot,
    r.entry_time,
    r.exit_time,
    r.duration_min,
    r.fee
  ]);

  downloadCSV('parking_history.csv', headers, rows);
  showToast('History CSV downloaded', 'success');
}

/* ── EXPORT REVENUE SUMMARY CSV ──────────────────────────── */
async function exportRevenueCSV() {
  try {
    const res  = await fetch('/api/analytics');
    const data = await res.json();
    if (!data.success) { showToast('Could not fetch analytics', 'error'); return; }

    const a   = data.analytics;
    const rb  = a.revenue_by_type;
    const now = new Date().toLocaleString();

    const headers = ['Date/Time', 'Total Revenue (₹)', 'Car Revenue (₹)', 'Bike Revenue (₹)', 'Truck Revenue (₹)', 'Vehicles Today', 'Avg Stay (min)', 'Peak Hour'];
    const rows = [[
      now,
      Math.round(a.total_revenue),
      Math.round((rb.car  || {}).amount || 0),
      Math.round((rb.bike || {}).amount || 0),
      Math.round((rb.truck|| {}).amount || 0),
      a.total_today,
      a.avg_stay_min,
      a.peak_hour
    ]];

    downloadCSV('parking_revenue_summary.csv', headers, rows);
    showToast('Revenue CSV downloaded', 'success');
  } catch (e) { showToast('Export failed', 'error'); }
}

/* ── CSV HELPER ──────────────────────────────────────────── */
function downloadCSV(filename, headers, rows) {
  const escape = val => {
    const str = String(val ?? '');
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const csvContent = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ── AUTO-REFRESH ANALYTICS WHEN PANEL IS OPEN ───────────── */
// Hook into the existing pollStatus — after every poll, refresh analytics if open
const _originalApplyStatus = applyStatus;
// We extend applyStatus to also refresh analytics data when panel is open
window._analyticsRefreshBound = false;
(function patchApplyStatus() {
  const orig = window.applyStatus || function(){};
  // applyStatus is already defined above — we just extend the polling
})();

// Simpler: override the pollStatus to also call loadAnalytics when visible
const _origPollStatus = pollStatus;
async function pollStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (data.setup) applyStatus(data);
    // Phase 4 — refresh analytics panel if it's open
    if (analyticsVisible) {
      loadAnalytics();
      loadHistory();
    }
  } catch (e) {}
}