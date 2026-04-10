/* ═══════════════════════════════════════════════════════════
   SMART PARKING SYSTEM — app.js
   Author: C. Sree Harshith Reddy
   Phase 1 — Full frontend logic, API calls, blueprint render
═══════════════════════════════════════════════════════════ */

/* ── STATE ───────────────────────────────────────────────── */
let cameraStream   = null;
let cameraMode     = null;   // 'park' | 'exit'
let capturedPlate  = null;
let pollTimer      = null;
let selectedType   = 'car';

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  checkStatus();
  addRow();          // start setup modal with one row
});

/* ══════════════════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════════════════ */
function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('liveClock').textContent =
      now.toTimeString().slice(0, 8);
    document.getElementById('liveDate').textContent =
      now.toDateString();
  }
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════════════════
   SETUP MODAL — ROW BUILDER
══════════════════════════════════════════════════════════ */
function addRow() {
  const builder = document.getElementById('rowBuilder');
  const rowCount = builder.children.length;
  if (rowCount >= 26) { showToast('Maximum 26 rows allowed', 'error'); return; }

  const rowLetter = String.fromCharCode(65 + rowCount);
  const div = document.createElement('div');
  div.className = 'row-item';
  div.dataset.row = rowLetter;
  div.innerHTML = `
    <span class="row-label">ROW ${rowLetter}</span>
    <label>Number of slots</label>
    <input type="number" min="1" max="20" value="4"
           oninput="updatePreview()" />
    <button class="btn-remove-row" onclick="removeRow(this)">✕</button>
  `;
  builder.appendChild(div);
  updatePreview();
}

function removeRow(btn) {
  const builder = document.getElementById('rowBuilder');
  if (builder.children.length <= 1) {
    showToast('At least one row is required', 'error');
    return;
  }
  btn.closest('.row-item').remove();
  // re-label rows
  Array.from(builder.children).forEach((item, i) => {
    const letter = String.fromCharCode(65 + i);
    item.dataset.row = letter;
    item.querySelector('.row-label').textContent = `ROW ${letter}`;
  });
  updatePreview();
}

function getRowConfig() {
  const items = document.querySelectorAll('#rowBuilder .row-item input');
  return Array.from(items).map(inp => Math.max(1, Math.min(20, parseInt(inp.value) || 1)));
}

function updatePreview() {
  const config = getRowConfig();
  const grid   = document.getElementById('previewGrid');
  const stats  = document.getElementById('previewStats');
  grid.innerHTML = '';

  config.forEach((slots, i) => {
    const letter = String.fromCharCode(65 + i);
    const row = document.createElement('div');
    row.className = 'preview-row';
    row.innerHTML = `<span class="preview-row-label">${letter}</span>`;
    for (let s = 0; s < slots; s++) {
      const cell = document.createElement('div');
      cell.className = 'preview-slot';
      row.appendChild(cell);
    }
    grid.appendChild(row);
  });

  const total = config.reduce((a, b) => a + b, 0);
  stats.textContent = `${config.length} rows · ${total} total slots`;
}

async function submitSetup() {
  const config = getRowConfig();
  const errEl  = document.getElementById('setupError');
  errEl.textContent = '';

  if (config.length === 0) { errEl.textContent = 'Add at least one row.'; return; }
  if (config.some(n => n < 1 || n > 20)) { errEl.textContent = 'Each row must have 1–20 slots.'; return; }

  try {
    const res  = await fetch('/api/setup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ row_config: config })
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
  } catch (e) {
    errEl.textContent = 'Could not connect to server.';
  }
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
  } catch (e) { /* server not ready yet */ }
}

async function pollStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (data.setup) applyStatus(data);
  } catch (e) { /* silent fail on poll */ }
}

function applyStatus(data) {
  const stats = data.stats;

  // Header stats
  document.getElementById('hstatCapacity').querySelector('.hstat-val').textContent = stats.capacity;
  document.getElementById('hstatOccupied').querySelector('.hstat-val').textContent = stats.occupied;
  document.getElementById('hstatEmpty').querySelector('.hstat-val').textContent    = stats.empty;
  document.getElementById('hstatQueue').querySelector('.hstat-val').textContent    = stats.queue_length;

  // Occupancy bar
  const pct   = stats.occupancy_pct;
  const fill  = document.getElementById('occBarFill');
  const label = document.getElementById('occBarLabel');
  fill.style.width = pct + '%';
  fill.className   = 'occ-bar-fill' + (pct >= 85 ? ' full' : pct >= 60 ? ' warn' : '');
  label.textContent = Math.round(pct) + '% OCCUPIED';

  // Revenue
  document.getElementById('revenueAmount').textContent = '₹' + data.revenue.toFixed(0);

  // Blueprint + queue
  renderBlueprint(data.row_config, data.layout);
  renderQueue(data.queue);
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
      cell.title     = occupied
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

  if (queue.length === 0) {
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
   VEHICLE TYPE SELECTION
══════════════════════════════════════════════════════════ */
function selectType(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedType = btn.dataset.type;
}

/* ══════════════════════════════════════════════════════════
   PARK VEHICLE
══════════════════════════════════════════════════════════ */
async function parkVehicle() {
  const plate  = document.getElementById('parkPlate').value.trim().toUpperCase();
  const msgEl  = document.getElementById('parkMsg');
  msgEl.textContent = '';
  msgEl.className   = 'form-msg';

  if (!plate) {
    setMsg(msgEl, 'Please enter a vehicle number.', 'error');
    return;
  }

  const plateRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;
  if (!plateRegex.test(plate)) {
    setMsg(msgEl, 'Invalid format. Use: AA00AA0000 (e.g. TS09AB1234)', 'error');
    return;
  }

  try {
    const res  = await fetch('/api/park', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ number_plate: plate, vehicle_type: selectedType })
    });
    const data = await res.json();

    if (!data.success) {
      setMsg(msgEl, data.message, 'error');
      return;
    }

    document.getElementById('parkPlate').value = '';

    if (data.queued) {
      setMsg(msgEl, data.message, 'info');
      showToast('Added to waiting queue', 'info');
      showEntryReceipt(data, true);
    } else {
      setMsg(msgEl, `Parked at slot ${data.slot}`, 'success');
      if (data.nearly_full) showToast('⚠ Parking lot is nearly full!', 'info');
      showEntryReceipt(data, false);
    }

    pollStatus();
  } catch (e) {
    setMsg(msgEl, 'Server error. Try again.', 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   EXIT VEHICLE
══════════════════════════════════════════════════════════ */
async function exitVehicle() {
  const identifier = document.getElementById('exitIdentifier').value.trim().toUpperCase();
  const msgEl      = document.getElementById('exitMsg');
  msgEl.textContent = '';
  msgEl.className   = 'form-msg';

  if (!identifier) {
    setMsg(msgEl, 'Please enter a Ticket ID or Vehicle Number.', 'error');
    return;
  }

  try {
    const res  = await fetch('/api/exit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ identifier })
    });
    const data = await res.json();

    if (!data.success) {
      setMsg(msgEl, data.message, 'error');
      return;
    }

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
  } catch (e) {
    setMsg(msgEl, 'Server error. Try again.', 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   RECEIPTS
══════════════════════════════════════════════════════════ */
function showEntryReceipt(data, queued) {
  document.getElementById('receiptIcon').textContent  = '🎫';
  document.getElementById('receiptTitle').textContent = queued ? 'QUEUE TICKET' : 'ENTRY TICKET';

  const body = document.getElementById('receiptBody');
  body.innerHTML = `
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
      <span class="r-value">${data.slot}</span>
    </div>
    <div class="receipt-row">
      <span class="r-label">Entry Time</span>
      <span class="r-value">${data.entry_time}</span>
    </div>`}
  `;

  buildPrintArea(body.innerHTML, queued ? 'QUEUE TICKET' : 'ENTRY TICKET');
  document.getElementById('receiptOverlay').classList.remove('hidden');
}

function showExitReceipt(data) {
  document.getElementById('receiptIcon').textContent  = '💳';
  document.getElementById('receiptTitle').textContent = 'EXIT RECEIPT';

  // calculate duration string
  const entry    = new Date(`1970-01-01T${data.entry_time}`);
  const exitT    = new Date(`1970-01-01T${data.exit_time}`);
  let   diffMins = Math.round((exitT - entry) / 60000);
  if (diffMins < 0) diffMins += 24 * 60;
  const durStr   = diffMins < 60
    ? `${diffMins} min`
    : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;

  const body = document.getElementById('receiptBody');
  body.innerHTML = `
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

  buildPrintArea(body.innerHTML, 'EXIT RECEIPT');
  document.getElementById('receiptOverlay').classList.remove('hidden');
}

function buildPrintArea(html, title) {
  document.getElementById('printArea').innerHTML = `
    <div style="font-family:monospace;padding:20px;max-width:320px;">
      <div style="text-align:center;font-weight:bold;margin-bottom:12px;">
        🅿 SMART PARKING SYSTEM<br>
        <small>${title}</small>
      </div>
      ${html}
      <div style="text-align:center;margin-top:12px;font-size:0.7rem;color:#666;">
        Thank you for using Smart Parking
      </div>
    </div>
  `;
}

function closeReceipt() {
  document.getElementById('receiptOverlay').classList.add('hidden');
}

function printReceipt() {
  window.print();
}

/* ══════════════════════════════════════════════════════════
   CAMERA
══════════════════════════════════════════════════════════ */
function openCamera(mode) {
  cameraMode    = mode;
  capturedPlate = null;

  // Reset UI state
  document.getElementById('ocrPlate').textContent  = '—';
  document.getElementById('ocrStatus').textContent = '';
  document.getElementById('usePlateBtn').classList.add('hidden');
  document.getElementById('captureBtn').classList.remove('hidden');
  document.getElementById('manualEntryBody').classList.remove('open');
  document.getElementById('manualToggle').classList.remove('open');
  document.getElementById('manualPlateInput').value = '';

  document.getElementById('cameraOverlay').classList.remove('hidden');

  const constraints = {
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      cameraStream = stream;
      const video  = document.getElementById('cameraFeed');
      video.srcObject = stream;
      video.play();
    })
    .catch(err => {
      document.getElementById('ocrStatus').textContent = '⚠ Camera access denied. Use manual entry below.';
      document.getElementById('manualEntryBody').classList.add('open');
      document.getElementById('manualToggle').classList.add('open');
    });
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
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
          document.getElementById('ocrStatus').textContent =
            `Scanning… ${Math.round(m.progress * 100)}%`;
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
      document.getElementById('ocrStatus').textContent =
        `No valid plate found (conf ${conf}%). Try again or enter manually.`;
      // auto-expand manual entry on failure
      document.getElementById('manualEntryBody').classList.add('open');
      document.getElementById('manualToggle').classList.add('open');
    }
  } catch (e) {
    document.getElementById('ocrStatus').textContent = 'OCR error. Please enter manually.';
    document.getElementById('manualEntryBody').classList.add('open');
    document.getElementById('manualToggle').classList.add('open');
  }
}

function useCapturedPlate() {
  if (!capturedPlate) return;
  fillPlateField(capturedPlate);
  closeCamera();
}

function toggleManualEntry() {
  const body   = document.getElementById('manualEntryBody');
  const toggle = document.getElementById('manualToggle');
  const open   = body.classList.toggle('open');
  toggle.classList.toggle('open', open);
}

function submitManualPlate() {
  const val   = document.getElementById('manualPlateInput').value.trim().toUpperCase();
  const regex = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/;
  if (!val) { showToast('Enter a plate number', 'error'); return; }
  if (!regex.test(val)) { showToast('Invalid format: AA00AA0000', 'error'); return; }
  fillPlateField(val);
  closeCamera();
}

function fillPlateField(plate) {
  if (cameraMode === 'park') {
    document.getElementById('parkPlate').value = plate;
  } else if (cameraMode === 'exit') {
    document.getElementById('exitIdentifier').value = plate;
  }
  showToast(`Plate set: ${plate}`, 'success');
}

/* ══════════════════════════════════════════════════════════
   RESET
══════════════════════════════════════════════════════════ */
async function confirmReset() {
  const pin = prompt('Enter admin PIN to reset (default: 0000)');
  if (pin === null) return;           // cancelled
  if (pin !== '0000') { showToast('Incorrect PIN', 'error'); return; }

  try {
    const res  = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      document.getElementById('app').classList.add('hidden');
      document.getElementById('setupOverlay').classList.remove('hidden');
      document.getElementById('rowBuilder').innerHTML = '';
      addRow();
      showToast('System reset', 'info');
    }
  } catch (e) {
    showToast('Reset failed', 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   TOAST
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

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function setMsg(el, msg, type) {
  el.textContent = msg;
  el.className   = `form-msg ${type}`;
}