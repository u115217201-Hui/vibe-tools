
'use strict';

const STORAGE_KEY = 'direct-draw-v1';
const $ = (selector) => document.querySelector(selector);
const state = loadState();
let messageTimer;

// ===== 資料處理 =====

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normal(p) {
  return {
    id: String(p.id || uid()),
    name: String(p.name ?? '').trim(),
    studentId: String(p.studentId ?? '').trim()
  };
}

function loadState() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      senior: Array.isArray(d.senior) ? d.senior.map(normal) : [],
      junior: Array.isArray(d.junior) ? d.junior.map(normal) : [],
      matches: Array.isArray(d.matches) ? d.matches : []
    };
  } catch {
    return { senior: [], junior: [], matches: [] };
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    notice('瀏覽器無法保存資料，請確認儲存空間與隱私設定。', true);
  }
}

function notice(text, isError = false) {
  const box = $('#message');
  box.textContent = text;
  box.classList.toggle('error', isError);
  box.hidden = false;

  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => box.hidden = true, 7000);
}

function validateLists(senior = state.senior, junior = state.junior) {
  const seen = new Set();

  for (const p of [...senior, ...junior]) {
    if (!p.name) throw Error('姓名不可空白。');

    if (p.studentId) {
      if (seen.has(p.studentId)) {
        throw Error(`發現重複學號：${p.studentId}，請先修正。`);
      }
      seen.add(p.studentId);
    }
  }
}

function applyLists(senior, junior, successText = '名單已更新。') {
  senior = senior.map(normal);
  junior = junior.map(normal);
  validateLists(senior, junior);

  const hadMatches = state.matches.length > 0;

  state.senior = senior;
  state.junior = junior;

  if (hadMatches) {
    if (senior.length && junior.length) {
      state.matches = drawMatches();
      successText += ' 已自動重新抽籤。';
    } else {
      state.matches = [];
      successText += ' 由於名單不足，已清除舊配對。';
    }
  }

  save();
  render();
  notice(successText);
}

// ===== 公平隨機抽籤 =====

function secureIndex(max) {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    return Math.floor(Math.random() * max);
  }

  const arr = new Uint32Array(1);
  const limit = Math.floor(4294967296 / max) * max;

  do {
    crypto.getRandomValues(arr);
  } while (arr[0] >= limit);

  return arr[0] % max;
}

function shuffle(input) {
  const a = [...input];

  for (let i = a.length - 1; i > 0; i--) {
    const j = secureIndex(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function drawMatches() {
  const seniors = shuffle(state.senior);
  const juniors = shuffle(state.junior);
  const matched = new Map();

  juniors.forEach((p, i) => {
    matched.set(p.id, seniors[i % seniors.length].id);
  });

  return state.junior.map(j => ({
    juniorId: j.id,
    seniorId: matched.get(j.id)
  }));
}

// ===== 畫面渲染 =====

function makeButton(text, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  btn.className = className;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderList(kind) {
  const ul = $(`#${kind}List`);
  ul.replaceChildren();

  if (!state[kind].length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = '尚無名單，從上方新增第一位吧！';
    ul.append(empty);
    return;
  }

  state[kind].forEach((p, i) => {
    const li = document.createElement('li');
    const main = document.createElement('div');
    main.className = 'person-main';

    const name = document.createElement('b');
    name.textContent = `${i + 1}. ${p.name}`;

    const id = document.createElement('span');
    id.textContent = `學號：${p.studentId || '未填寫'}`;

    main.append(name, id);

    const actions = document.createElement('div');
    actions.className = 'person-buttons';

    actions.append(
      makeButton('編輯', 'mini', () => editPerson(kind, p.id)),
      makeButton('刪除', 'mini remove', () => deletePerson(kind, p.id))
    );

    li.append(main, actions);
    ul.append(li);
  });
}

function renderResults() {
  const visible = state.matches.length > 0;
  $('#resultsSection').hidden = !visible;
  $('#drawBtn').textContent = visible ? '重新抽籤 🔄' : '開始抽籤 ✨';
  $('#drawBtn').disabled = !(state.senior.length && state.junior.length);

  $('#drawHint').textContent = visible
    ? '修改名單後將自動重新配對。'
    : '請先備妥兩份名單，再按開始抽籤。';

  if (!visible) return;

  const body = $('#resultBody');
  body.replaceChildren();

  const seniors = new Map(state.senior.map(p => [p.id, p]));
  const juniors = new Map(state.junior.map(p => [p.id, p]));
  const counts = new Map();

  state.matches.forEach(m => {
    const j = juniors.get(m.juniorId);
    const s = seniors.get(m.seniorId);

    if (!j || !s) return;

    counts.set(s.id, (counts.get(s.id) || 0) + 1);

    const tr = document.createElement('tr');

    [j.name, j.studentId, s.name, s.studentId].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v || '—';
      tr.append(td);
    });

    body.append(tr);
  });

  const values = state.senior.map(s => counts.get(s.id) || 0);

  $('#resultSummary').textContent =
    `共 ${state.matches.length} 位學弟妹，分配給 ` +
    `${state.senior.length} 位學長姐（每位約 ` +
    `${Math.min(...values)}～${Math.max(...values)} 人）。`;
}

function render() {
  $('#seniorCount').textContent = state.senior.length;
  $('#juniorCount').textContent = state.junior.length;

  renderList('senior');
  renderList('junior');
  renderResults();
}

// ===== 名單新增、編輯、刪除 =====

function editPerson(kind, id) {
  const found = state[kind].find(p => p.id === id);
  if (!found) return;

  const name = prompt('請輸入姓名：', found.name);
  if (name === null) return;

  const studentId = prompt('請輸入學號（可留白）：', found.studentId);
  if (studentId === null) return;

  const next = state[kind].map(p =>
    p.id === id ? { ...p, name, studentId } : p
  );

  try {
    applyLists(
      kind === 'senior' ? next : state.senior,
      kind === 'junior' ? next : state.junior
    );
  } catch (e) {
    notice(e.message, true);
  }
}

function deletePerson(kind, id) {
  const next = state[kind].filter(p => p.id !== id);

  try {
    applyLists(
      kind === 'senior' ? next : state.senior,
      kind === 'junior' ? next : state.junior
    );
  } catch (e) {
    notice(e.message, true);
  }
}

function addPeople(kind, items, mode = 'merge') {
  if (!['merge', 'replace'].includes(mode)) {
    throw Error('不支援的匯入模式。');
  }

  const next = mode === 'replace'
    ? items.map(normal)
    : [...state[kind], ...items.map(normal)];

  applyLists(
    kind === 'senior' ? next : state.senior,
    kind === 'junior' ? next : state.junior,
    `已${mode === 'replace' ? '覆蓋' : '合併'} ${items.length} 筆` +
    `${kind === 'senior' ? '學長姐' : '學弟妹'}資料。`
  );
}

// ===== 貼上與 CSV 解析 =====

function parsePaste(text) {
  return text
    .split(/\r?\n/)
    .map(v => v.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.includes('\t')
        ? line.split('\t')
        : line.split(',');

      if (parts.length > 2) {
        throw Error(`第 ${i + 1} 行格式錯誤：只能有姓名及學號兩欄。`);
      }

      return {
        name: (parts[0] || '').trim(),
        studentId: (parts[1] || '').trim()
      };
    });
}

function parseRows(rows) {
  if (!rows.length) return [];

  let start = 0;
  const first = (rows[0] || []).map(x =>
    String(x ?? '').replace(/^\uFEFF/, '').trim()
  );

  if (/^(姓名|name)$/i.test(first[0])) {
    start = 1;
  }

  return rows.slice(start)
    .filter(row => row.some(c => String(c ?? '').trim()))
    .map(row => ({
      name: String(row[0] ?? '').trim(),
      studentId: String(row[1] ?? '').trim()
    }));
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (quoted) throw Error('CSV 引號不完整。');

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return parseRows(rows);
}

// ===== Excel 匯入 =====

function sheetPeople(sheet) {
  if (!sheet) throw Error('找不到指定工作表。');

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false
  });

  return parseRows(rows);
}

async function loadWorkbook(file) {
  if (typeof XLSX === 'undefined') {
    throw Error('Excel 功能需要網路連線，請確認已成功載入函式庫。');
  }

  const array = await file.arrayBuffer();
  return XLSX.read(array, { type: 'array', cellText: true });
}

async function handleIndividual(kind, file) {
  let items;

  if (/\.csv$/i.test(file.name)) {
    items = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
  } else {
    const book = await loadWorkbook(file);
    items = sheetPeople(book.Sheets[book.SheetNames[0]]);
  }

  const merge = confirm(
    `即將匯入 ${items.length} 筆資料。\n` +
    '按「確定」＝合併到原本名單\n' +
    '按「取消」＝改為選擇是否覆蓋'
  );

  const mode = merge
    ? 'merge'
    : (confirm('要使用新檔案覆蓋原本的這份名單嗎？')
        ? 'replace'
        : null);

  if (!mode) return;
  addPeople(kind, items, mode);
}

async function handleCombined(file) {
  const book = await loadWorkbook(file);

  if (!book.Sheets['學長姐'] || !book.Sheets['學弟妹']) {
    throw Error('Excel 必須包含「學長姐」和「學弟妹」兩個工作表。');
  }

  const seniors = sheetPeople(book.Sheets['學長姐']);
  const juniors = sheetPeople(book.Sheets['學弟妹']);

  const merge = confirm(
    `即將匯入學長姐 ${seniors.length} 位、` +
    `學弟妹 ${juniors.length} 位。\n` +
    '按「確定」＝合併\n' +
    '按「取消」＝再選擇是否覆蓋'
  );

  const mode = merge
    ? 'merge'
    : (confirm('要以新檔案覆蓋兩份舊名單嗎？')
        ? 'replace'
        : null);

  if (!mode) return;

  const nextS = mode === 'replace'
    ? seniors
    : [...state.senior, ...seniors];

  const nextJ = mode === 'replace'
    ? juniors
    : [...state.junior, ...juniors];

  applyLists(
    nextS,
    nextJ,
    `已${mode === 'merge' ? '合併' : '覆蓋'}兩份名單。`
  );
}

// ===== Excel 匯出 =====

function requireXlsx() {
  if (typeof XLSX === 'undefined') {
    throw Error('Excel 函式庫尚未載入，請檢查網路後重新整理。');
  }
}

function downloadBook(book, name) {
  requireXlsx();
  XLSX.writeFile(book, name);
}

function exportTemplate() {
  requireXlsx();

  const book = XLSX.utils.book_new();

  for (const kind of ['學長姐', '學弟妹']) {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['姓名', '學號']
    ]);

    sheet['!cols'] = [{ wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(book, sheet, kind);
  }

  downloadBook(book, '直屬抽籤_名單範本.xlsx');
}

function exportResults() {
  requireXlsx();

  if (!state.matches.length) {
    throw Error('尚無抽籤結果。');
  }

  const seniors = new Map(state.senior.map(p => [p.id, p]));
  const juniors = new Map(state.junior.map(p => [p.id, p]));

  const rows = [[
    '學弟妹姓名',
    '學弟妹學號',
    '直屬學長姐',
    '學長姐學號'
  ]];

  for (const m of state.matches) {
    const j = juniors.get(m.juniorId);
    const s = seniors.get(m.seniorId);

    if (j && s) {
      rows.push([j.name, j.studentId, s.name, s.studentId]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 20 }, { wch: 20 },
    { wch: 20 }, { wch: 20 }
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '配對結果');

  downloadBook(book, '直屬抽籤_配對結果.xlsx');
}

// ===== 彩紙動畫 =====

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layer = $('#confettiLayer');
  layer.replaceChildren();

  const colors = [
    '#fd78ab', '#7655ea', '#facc55',
    '#56d6cc', '#7fc6f2'
  ];

  for (let i = 0; i < 90; i++) {
    const piece = document.createElement('i');
    piece.className = 'confetti';

    piece.style.setProperty('--left', `${Math.random() * 100}%`);
    piece.style.setProperty('--color', colors[i % colors.length]);
    piece.style.setProperty('--time', `${2 + Math.random() * 2.8}s`);
    piece.style.setProperty('--rotate', `${Math.random() * 360}deg`);
    piece.style.animationDelay = `${Math.random() * .5}s`;

    layer.append(piece);
  }

  setTimeout(() => layer.replaceChildren(), 5500);
}

// ===== 開始抽籤 =====

function beginDraw() {
  if (!state.senior.length || !state.junior.length) {
    notice('兩份名單至少都需要一位成員。', true);
    return;
  }

  try {
    validateLists();

    if (state.matches.length &&
        !confirm('重新抽籤會覆蓋原本的配對結果，確定要繼續嗎？')) {
      return;
    }

    state.matches = drawMatches();
    save();
    render();
    confetti();

    notice('抽籤完成！祝大家找到命運中的直屬 🎉');

    $('#resultsSection').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  } catch (e) {
    notice(e.message, true);
  }
}

// ===== 清除名單 =====

function clearKind(kind) {
  if (!state[kind].length) return;

  if (!confirm(
    `確定清除全部${kind === 'senior' ? '學長姐' : '學弟妹'}名單？` +
    `${state.matches.length ? '原配對結果也會失效。' : ''}`
  )) return;

  try {
    applyLists(
      kind === 'senior' ? [] : state.senior,
      kind === 'junior' ? [] : state.junior,
      '已清除指定名單。'
    );
  } catch (e) {
    notice(e.message, true);
  }
}

function safeAction(fn) {
  try {
    fn();
  } catch (e) {
    notice(e.message || String(e), true);
  }
}

// ===== 按鈕事件 =====

// 手動新增
for (const form of document.querySelectorAll('.add-form')) {
  form.addEventListener('submit', e => {
    e.preventDefault();

    const kind = form.dataset.kind;
    const name = form.elements.name.value;
    const studentId = form.elements.studentId.value;

    safeAction(() => {
      addPeople(kind, [{ name, studentId }]);
      form.reset();
      form.elements.name.focus();
    });
  });
}

// 批次貼上
for (const btn of document.querySelectorAll('[data-paste]')) {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.paste;
    const area = $(`#${kind}Paste`);

    safeAction(() => {
      const items = parsePaste(area.value);

      if (!items.length) {
        throw Error('請先貼上至少一位成員。');
      }

      addPeople(kind, items);
      area.value = '';
    });
  });
}

// 分別匯入 CSV / Excel
for (const input of document.querySelectorAll('[data-file]')) {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';

    if (!file) return;

    try {
      await handleIndividual(input.dataset.file, file);
    } catch (e) {
      notice(e.message, true);
    }
  });
}

// 匯入雙工作表 Excel
$('#combinedFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';

  if (!file) return;

  try {
    await handleCombined(file);
  } catch (err) {
    notice(err.message, true);
  }
});

// 清空單一名單
for (const btn of document.querySelectorAll('[data-clear]')) {
  btn.addEventListener('click', () => clearKind(btn.dataset.clear));
}

// 抽籤與輸出
$('#drawBtn').addEventListener('click', beginDraw);
$('#downloadTemplate').addEventListener('click',
  () => safeAction(exportTemplate));
$('#exportBtn').addEventListener('click',
  () => safeAction(exportResults));
$('#printBtn').addEventListener('click', () => window.print());

// 清除全部
$('#resetAll').addEventListener('click', () => {
  if (!confirm(
    '確定清除所有學長姐、學弟妹及配對結果？此操作無法復原。'
  )) return;

  state.senior = [];
  state.junior = [];
  state.matches = [];

  save();
  render();
  notice('已清除所有資料。');
});

// ===== 初始化與資料檢查 =====

try {
  validateLists();

  if (state.matches.length) {
    const s = new Set(state.senior.map(p => p.id));
    const j = new Set(state.junior.map(p => p.id));

    if (
      state.matches.length !== state.junior.length ||
      state.matches.some(m =>
        !s.has(m.seniorId) || !j.has(m.juniorId)
      )
    ) {
      state.matches = [];
    }
  }
} catch {
  state.matches = [];
  notice('儲存的名單有重複學號或不完整資料，請檢查。', true);
}

render();
