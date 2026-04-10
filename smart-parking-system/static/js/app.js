/* ═══════════════════════════════════════════════════════════
   SMART PARKING SYSTEM — app.js  v3
   Author: C. Sree Harshith Reddy
   Includes: auto-assign + manual slot picker
═══════════════════════════════════════════════════════════ */

/* ── STATE ───────────────────────────────────────────────── */
let cameraStream  = null;
let cameraMode    = null;
let capturedPlate = null;
let pollTimer     = null;
let selectedType  = 'car';
let assignMode    = 'auto';      // 'auto' | 'manual'
let chosenSlot    = null;        // slot ID chosen in picker e.g. 'B3'
let latestLayout  = {};          // last known layout from status poll
let latestConfig  = [];          // last known row_config from status poll

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
   SETUP MODAL — ROW BUILDER
══════════════════════════════════════════════════════════ */
function addRow() {
  const builder  = document.getElementById('rowBuilder');
  const rowCount = builder.children.length;
  if (rowCount >= 26) { showToast('Maximum 26 rows allowed', 'error'); return; }

  const rowLetter = String.fromCharCode(65 + rowCount);
  const div = document.createElement('div');
  div.className  = 'row-item';
  div.dataset.row = rowLetter;
  div.innerHTML = `
    <span class="row-label">ROW ${rowLetter}</span>
    <label>Slots in this row</label>
    <div class="slot-stepper">
      <button type="button" onclick="stepSlot(this,-1)">−</button>
      <input type="number" min="1" max="20" value="4" oninput="updatePreview()" />
      <button type="button" onclick="stepSlot(this,1)">+</button>
    </div>
    <button class="btn-remove-row" onclick="removeRow(this)" title="Remove row">✕</button>
  `;
  builder.appendChild(div);
  updatePreview();
}

function stepSlot(btn, delta) {
  const input = btn.closest('.slot-stepper').querySelector('input');
  const val   = Math.min(20, Math.max(1, (parseInt(input.value) || 1) + delta));
  input.value = val;
  updatePreview();
}

function removeRow(btn) {
  const builder = document.getElementById('rowBuilder');
  if (builder.children.length <= 1) { showToast('At least one row is required', 'error'); return; }
  btn.closest('.row-item').remove();
  Array.from(builder.children).forEach((item, i) => {
    const letter = String.fromCharCode(65 + i);
    item.dataset.row = letter;
    item.querySelector('.row-label').textContent = `ROW ${letter}`;
  });
  updatePreview();
}

function getRowConfig() {
  return Array.from(document.querySelectorAll('#rowBuilder .row-item input'))
    .map(inp => Math.max(1, Math.min(20, parseInt(inp.value) || 1)));
}

function updatePreview() {
  const config = getRowConfig();
  const grid   = document.getElementById('previewGrid');
  const stats  = document.getElementById('previewStats');
  grid.innerHTML = '';

  config.forEach((slots, i) => {
    const letter = String.fromCharCode(65 + i);
    const row    = document.createElement('div');
    row.className = 'preview-row';
    row.innerHTML = `<span class="preview-row-label">${letter}</span>`;
    for (let s = 0; s < slots; s++) {
      const cell = document.createElement('div');
      cell.className = 'preview-slot';
      cell.style.animationDelay = `${s * 30}ms`;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  });

  const total = config.reduce((a, b) => a + b, 0);
  stats.innerHTML = `<span>${config.length}</span> rows &nbsp;·&nbsp; <span>${total}</span> total slots`;
}

async function submitSetup() {
  const config = getRowConfig();
  const errEl  = document.getElementById('setupError');
  errEl.textContent = '';

  if (!config.length)              { errEl.textContent = 'Add at least one row.'; return; }
  if (config.some(n => n < 1 || n > 20)) { errEl.textContent = 'Each row must have 1–20 slots.'; return; }

  try {
    const res  = await fetch('/api/setup', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ row_config: config })
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

  // cache for slot picker
  latestLayout = data.layout;
  latestConfig = data.row_config;

  // header stats
  document.getElementById('hstatCapacity').querySelector('.hstat-val').textContent = stats.capacity;
  document.getElementById('hstatOccupied').querySelector('.hstat-val').textContent = stats.occupied;
  document.getElementById('hstatEmpty').querySelector('.hstat-val').textContent    = stats.empty;
  document.getElementById('hstatQueue').querySelector('.hstat-val').textContent    = stats.queue_length;

  // occupancy bar
  const pct  = stats.occupancy_pct;
  const fill = document.getElementById('occBarFill');
  fill.style.width = pct + '%';
  fill.className   = 'occ-bar-fill' + (pct >= 85 ? ' full' : pct >= 60 ? ' warn' : '');
  document.getElementById('occBarLabel').textContent = Math.round(pct) + '% OCCUPIED';

  // revenue
  document.getElementById('revenueAmount').textContent = '₹' + data.revenue.toFixed(0);

  // blueprint + queue
  renderBlueprint(data.row_config, data.layout);
  renderQueue(data.queue);

  // if slot picker is open, refresh it too
  if (!document.getElementById('slotPickerOverlay').classList.contains('hidden')) {
    renderSlotPicker(data.row_config, data.layout);
  }

  // if chosen slot is now occupied (taken by someone else), clear it
  if (chosenSlot && latestLayout[chosenSlot] && latestLayout[chosenSlot].status === 'occupied') {
    clearChosenSlot();
    showToast(`Slot ${chosenSlot} was just taken — please choose again`, 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   BLUEPRINT RENDER
══════════════════════════════════════════════════════════ */
function renderBlueprint(rowConfig, layout) {
  const grid = document.getElementById('blueprintGrid');
  grid.innerHTML = '';

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

      const cell = document.createElement('div');
      cell.className = 'slot-cell' + (occupied ? ' occupied' : '');
      cell.title = occupied
        ? `${slotId} — ${slotData.vehicle.number_plate} (${slotData.vehicle.vehicle_type})`
        : `${slotId} — Available`;

      const idSpan    = document.createElement('span');
      idSpan.className   = 'slot-id';
      idSpan.textContent = slotId;

      const plateSpan    = document.createElement('span');
      plateSpan.className   = 'slot-plate';
      plateSpan.textContent = occupied ? slotData.vehicle.number_plate : '';

      cell.appendChild(idSpan);
      cell.appendChild(plateSpan);
      row.appendChild(cell);
    }
    grid.appendChild(row);
  });
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
    document.getElementById('chosenSlotDisplay').classList.add('hidden');
  } else {
    // open picker immediately
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

  const confirmBtn = document.getElementById('confirmSlotBtn');
  confirmBtn.disabled = !chosenSlot;

  renderSlotPicker(latestConfig, latestLayout);
  document.getElementById('slotPickerOverlay').classList.remove('hidden');
}

function closeSlotPicker() {
  document.getElementById('slotPickerOverlay').classList.add('hidden');
  // if user closed without choosing, revert to auto
  if (!chosenSlot) {
    assignMode = 'auto';
    document.getElementById('assignAuto').classList.add('active');
    document.getElementById('assignManual').classList.remove('active');
  }
}

function renderSlotPicker(rowConfig, layout) {
  const grid = document.getElementById('slotPickerGrid');
  grid.innerHTML = '';

  rowConfig.forEach((slotCount, ri) => {
    const letter = String.fromCharCode(65 + ri);
    const row    = document.createElement('div');
    row.className = 'sp-row';

    const tag = document.createElement('span');
    tag.className   = 'sp-row-label';
    tag.textContent = letter;
    row.appendChild(tag);

    for (let ci = 0; ci < slotCount; ci++) {
      const slotId   = `${letter}${ci + 1}`;
      const slotData = layout[slotId];
      const occupied = slotData && slotData.status === 'occupied';
      const isChosen = slotId === chosenSlot;

      const cell = document.createElement('div');
      if (occupied)      cell.className = 'sp-cell taken';
      else if (isChosen) cell.className = 'sp-cell selected';
      else               cell.className = 'sp-cell available';

      const idSpan    = document.createElement('span');
      idSpan.className   = 'sp-id';
      idSpan.textContent = slotId;

      const plateSpan    = document.createElement('span');
      plateSpan.className   = 'sp-plate';
      plateSpan.textContent = occupied ? slotData.vehicle.number_plate : 'FREE';

      cell.appendChild(idSpan);
      cell.appendChild(plateSpan);

      if (!occupied) {
        cell.onclick = () => selectPickerSlot(slotId);
      }

      row.appendChild(cell);
    }
    grid.appendChild(row);
  });
}

function selectPickerSlot(slotId) {
  chosenSlot = slotId;
  document.getElementById('spiSlot').textContent = slotId;
  document.getElementById('confirmSlotBtn').disabled = false;
  // re-render to show selection highlight
  renderSlotPicker(latestConfig, latestLayout);
}

function confirmSlotChoice() {
  if (!chosenSlot) return;
  document.getElementById('chosenSlotValue').textContent = chosenSlot;
  document.getElementById('chosenSlotDisplay').classList.remove('hidden');
  document.getElementById('slotPickerOverlay').classList.add('hidden');
  showToast(`Slot ${chosenSlot} selected`, 'info');
}

function clearChosenSlot() {
  chosenSlot = null;
  document.getElementById('chosenSlotDisplay').classList.add('hidden');
  document.getElementById('chosenSlotValue').textContent = '—';
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

  // manual mode but no slot chosen yet
  if (assignMode === 'manual' && !chosenSlot) {
    setMsg(msgEl, 'Please choose a slot from the picker first.', 'error');
    openSlotPicker();
    return;
  }

  const body = { number_plate: plate, vehicle_type: selectedType };
  if (assignMode === 'manual' && chosenSlot) {
    body.preferred_slot = chosenSlot;
  }

  try {
    const res  = await fetch('/api/park', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!data.success) { setMsg(msgEl, data.message, 'error'); return; }

    // reset form
    document.getElementById('parkPlate').value = '';
    clearChosenSlot();
    setAssignMode('auto');

    if (data.queued) {
      setMsg(msgEl, data.message, 'info');
      showToast('Added to waiting queue', 'info');
      showEntryReceipt(data, true);
    } else {
      const label = data.manual_slot ? `Parked at your chosen slot ${data.slot}` : `Auto-assigned to slot ${data.slot}`;
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
        `Queue: ${data.queued_vehicle_parked.number_plate} auto-parked at ${data.queued_vehicle_parked.slot}`,
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

/* ══════════════════════════════════════════════════════════
   CAMERA
══════════════════════════════════════════════════════════ */
function openCamera(mode) {
  cameraMode    = mode;
  capturedPlate = null;

  document.getElementById('ocrPlate').textContent  = '—';
  document.getElementById('ocrStatus').textContent = '';
  document.getElementById('usePlateBtn').classList.add('hidden');
  document.getElementById('captureBtn').classList.remove('hidden');
  document.getElementById('manualEntryBody').classList.remove('open');
  document.getElementById('manualToggle').classList.remove('open');
  document.getElementById('manualPlateInput').value = '';
  document.getElementById('cameraOverlay').classList.remove('hidden');

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
  })
  .then(stream => {
    cameraStream = stream;
    const video  = document.getElementById('cameraFeed');
    video.srcObject = stream;
    video.play();
  })
  .catch(() => {
    document.getElementById('ocrStatus').textContent = '⚠ Camera access denied. Use manual entry below.';
    document.getElementById('manualEntryBody').classList.add('open');
    document.getElementById('manualToggle').classList.add('open');
  });
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('cameraFeed').srcObject = null;
  document.getElementById('cameraOverlay').classList.add('hidden');
}

async function captureFrame() {
  const video  = document.getElementById('cameraFeed');
  const canvas = document.getElementById('cameraCanvas');

  if (!video.srcObject) {
    document.getElementById('ocrStatus').textContent = 'Camera not active. Use manual entry.';
    return;
  }

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  document.getElementById('ocrStatus').textContent = 'Scanning…';
  document.getElementById('ocrPlate').textContent  = '—';

  try {
    const result = await Tesseract.recognize(canvas, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          document.getElementById('ocrStatus').textContent = `Scanning… ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    const raw     = result.data.text.replace(/\s+/g, '').toUpperCase();
    const matches = raw.match(/[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}/);
    const conf    = Math.round(result.data.confidence);

    if (matches) {
      capturedPlate = matches[0];
      document.getElementById('ocrPlate').textContent  = capturedPlate;
      document.getElementById('ocrStatus').textContent = `Detected · Confidence ${conf}%`;
      document.getElementById('usePlateBtn').classList.remove('hidden');
      document.getElementById('captureBtn').classList.add('hidden');
    } else {
      document.getElementById('ocrPlate').textContent  = raw.slice(0, 12) || '—';
      document.getElementById('ocrStatus').textContent = `No valid plate found (conf ${conf}%). Try again or enter manually.`;
      document.getElementById('manualEntryBody').classList.add('open');
      document.getElementById('manualToggle').classList.add('open');
    }
  } catch (e) {
    document.getElementById('ocrStatus').textContent = 'OCR error. Please enter manually.';
    document.getElementById('manualEntryBody').classList.add('open');
    document.getElementById('manualToggle').classList.add('open');
  }
}

function useCapturedPlate() { if (capturedPlate) { fillPlateField(capturedPlate); closeCamera(); } }

function toggleManualEntry() {
  const body   = document.getElementById('manualEntryBody');
  const toggle = document.getElementById('manualToggle');
  const open   = body.classList.toggle('open');
  toggle.classList.toggle('open', open);
}

function submitManualPlate() {
  const val   = document.getElementById('manualPlateInput').value.trim().toUpperCase();
  const regex = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;
  if (!val)             { showToast('Enter a plate number', 'error'); return; }
  if (!regex.test(val)) { showToast('Invalid format: AA00AA0000', 'error'); return; }
  fillPlateField(val);
  closeCamera();
}

function fillPlateField(plate) {
  if (cameraMode === 'park')      document.getElementById('parkPlate').value      = plate;
  else if (cameraMode === 'exit') document.getElementById('exitIdentifier').value = plate;
  showToast(`Plate set: ${plate}`, 'success');
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
      clearChosenSlot();
      assignMode   = 'auto';
      latestLayout = {};
      latestConfig = [];
      addRow();
      showToast('System reset', 'info');
    }
  } catch (e) { showToast('Reset failed', 'error'); }
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