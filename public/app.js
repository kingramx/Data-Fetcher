// public/app.js
let rootHandle = null;
let treeModel = null;
let selectedFiles = new Map();

// === Default ignored folders ===
let ignoredFolders = new Set([".idea", "node_modules", ".git", "migrations", "__pycache__", ".venv"]);

const chooseBtn = document.getElementById('chooseBtn');
const extractBtn = document.getElementById('extractBtn');
const copyBtn = document.getElementById('copyBtn');
const saveFileBtn = document.getElementById('saveFileBtn');
const showTreeBtn = document.getElementById('showTreeBtn');

const treeRootEl = document.getElementById('treeRoot');
const extensionsEl = document.getElementById('extensions');
const selectedListEl = document.getElementById('selectedList');
const selectAllBtn = document.getElementById('selectAllBtn');
const rootNameEl = document.getElementById('rootName');
const contentsBox = document.getElementById('contentsBox');

const ignoreInput = document.getElementById('ignoreInput');
const addIgnoreBtn = document.getElementById('addIgnoreBtn');
const ignoreListEl = document.getElementById('ignoreList');

// === IGNORE LIST HANDLING ===
function renderIgnoreList() {
  ignoreListEl.innerHTML = '';
  ignoredFolders.forEach(name => {
    const badge = document.createElement('span');
    badge.className = 'bg-amber-100 text-amber-800 px-2 py-1 rounded flex items-center gap-1';
    badge.textContent = name;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.className = 'text-xs text-red-500 ml-1';
    removeBtn.addEventListener('click', () => {
      ignoredFolders.delete(name);
      renderIgnoreList();
    });
    badge.appendChild(removeBtn);
    ignoreListEl.appendChild(badge);
  });
}

addIgnoreBtn.addEventListener('click', () => {
  const name = ignoreInput.value.trim();
  if (name && !ignoredFolders.has(name)) {
    ignoredFolders.add(name);
    renderIgnoreList();
    ignoreInput.value = '';
  }
});

function getExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx).toLowerCase() : '';
}

async function buildTree(handle, basePath = '') {
  const node = { name: handle.name, kind: handle.kind, path: basePath, children: [] };
  for await (const entry of handle.values()) {
    // skip ignored folders
    if (entry.kind === 'directory' && ignoredFolders.has(entry.name)) continue;

    const childPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      node.children.push(await buildTree(entry, childPath));
    } else {
      node.children.push({ name: entry.name, kind: 'file', path: childPath, handle: entry });
    }
  }
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return node;
}

function renderExtensions(tree) {
  const set = new Set();
  function walk(n) {
    if (n.kind === 'file') set.add(getExtension(n.name));
    for (const c of n.children || []) walk(c);
  }
  walk(tree);
  extensionsEl.innerHTML = '';
  for (const ext of Array.from(set).sort()) {
    const badge = document.createElement('span');
    badge.className = 'px-2 py-1 rounded bg-slate-100 border text-slate-700 text-xs';
    badge.textContent = ext || '(no extension)';
    extensionsEl.appendChild(badge);
  }
}

function renderSelectedList() {
  selectedListEl.innerHTML = '';
  for (const p of Array.from(selectedFiles.keys()).sort()) {
    const li = document.createElement('li');
    li.textContent = p;
    selectedListEl.appendChild(li);
  }
  extractBtn.disabled = selectedFiles.size === 0;
}

function toggleDirectory(node, checked) {
  if (node.kind === 'file') {
    if (checked) selectedFiles.set(node.path, node.handle);
    else selectedFiles.delete(node.path);
    return;
  }

  for (const child of node.children || []) {
    toggleDirectory(child, checked);
  }
}

function renderTree(node, container) {
  container.innerHTML = '';

  const rootUl = document.createElement('ul');
  rootUl.className = 'space-y-1 text-sm';

  function renderNode(n, parentEl) {
    const li = document.createElement('li');
    li.className = 'select-none';

    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 cursor-pointer hover:bg-slate-100 rounded px-1';

    // icon
    const icon = document.createElement('span');
    icon.className = 'inline-block w-4 text-slate-500';
    icon.textContent = n.kind === 'directory' ? '📁' : '📄';
    row.appendChild(icon);

    // name element
    const nameEl = document.createElement('span');
    nameEl.textContent = n.name;
    nameEl.className = 'text-slate-800';
    row.appendChild(nameEl);

    // checkbox (for file & directory)
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'ml-auto';

    // وضعیت checkbox
    if (n.kind === 'file') {
      cb.checked = selectedFiles.has(n.path);
    } else {
      const files = [];
      (function collect(node) {
        if (node.kind === 'file') files.push(node.path);
        (node.children || []).forEach(collect);
      })(n);

      cb.checked = files.length > 0 && files.every(p => selectedFiles.has(p));
    }

    cb.addEventListener('change', (e) => {
      e.stopPropagation(); // جلوگیری از باز/بسته شدن فولدر

      if (n.kind === 'file') {
        if (cb.checked) selectedFiles.set(n.path, n.handle);
        else selectedFiles.delete(n.path);
      } else {
        toggleDirectory(n, cb.checked);
      }

      renderSelectedList();
      renderTree(treeModel, treeRootEl);
    });

    row.appendChild(cb);

    li.appendChild(row);

    // handle directories
    if (n.kind === 'directory') {
      const ul = document.createElement('ul');
      ul.className = 'ml-5 border-l pl-3 space-y-1 hidden';

      let expanded = false;
      row.addEventListener('click', () => {
        expanded = !expanded;
        ul.classList.toggle('hidden', !expanded);
        icon.textContent = expanded ? '📂' : '📁';
      });

      for (const c of n.children) renderNode(c, ul);
      li.appendChild(ul);
    }

    parentEl.appendChild(li);
  }

  renderNode(node, rootUl);
  container.appendChild(rootUl);
}

async function extractSelectedFiles() {
  const lines = [];
  for (const [path, handle] of selectedFiles) {
    const file = await handle.getFile();
    const text = await file.text();
    lines.push('= = = = =');
    lines.push(path);
    lines.push(text);
    lines.push('= = = = =');
  }
  contentsBox.value = lines.join('\n');
  copyBtn.disabled = false;
  saveFileBtn.disabled = false;
}

function buildTreeText(node, prefix = '', isLast = true) {
  const icon = node.kind === 'directory' ? '📁' : '📄';
  const connector = prefix ? (isLast ? '└─ ' : '├─ ') : '';
  let lines = [`${prefix}${connector}${icon} ${node.name}`];

  if (node.children && node.children.length > 0) {
    const newPrefix = prefix + (isLast ? '   ' : '│  ');
    const lastIndex = node.children.length - 1;
    node.children.forEach((child, idx) => {
      const childIsLast = idx === lastIndex;
      lines = lines.concat(buildTreeText(child, newPrefix, childIsLast));
    });
  }

  return lines;
}


function showTreeContents() {
  if (!treeModel) {
    alert('No folder selected yet.');
    return;
  }
  const lines = buildTreeText(treeModel);
  contentsBox.value = lines.join('\n');
  copyBtn.disabled = false;
  saveFileBtn.disabled = false;
}


async function saveToFile() {
  try {
    const saveHandle = await window.showSaveFilePicker({
      suggestedName: 'contents.txt',
      types: [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }],
    });
    const writable = await saveHandle.createWritable();
    await writable.write(contentsBox.value);
    await writable.close();
    alert('contents.txt saved successfully.');
  } catch (err) {
    console.error('Save failed:', err);
    alert('Save failed. Check console for details.');
  }
}

chooseBtn.addEventListener('click', async () => {
  try {
    rootHandle = await window.showDirectoryPicker();
    rootNameEl.textContent = rootHandle.name;
    selectedFiles.clear();
    treeModel = await buildTree(rootHandle);
    renderTree(treeModel, treeRootEl);
    renderExtensions(treeModel);
    renderSelectedList();
    contentsBox.value = '';
    copyBtn.disabled = true;
    selectAllBtn.disabled = false;
    showTreeBtn.disabled = false;

  } catch (err) {
    console.warn('Folder selection canceled or not supported.', err);
  }
});

extractBtn.addEventListener('click', async () => {
  try {
    await extractSelectedFiles();
  } catch (err) {
    console.error('Extraction failed:', err);
    alert('Extraction failed. Check console for details.');
  }
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(contentsBox.value);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
  } catch (err) {
    alert('Copy failed.');
  }
});

function selectAllFiles(node) {
  if (node.kind === 'file') {
    selectedFiles.set(node.path, node.handle);
  }
  for (const child of node.children || []) selectAllFiles(child);
}


selectAllBtn.addEventListener('click', () => {
  if (!treeModel) return;

  selectedFiles.clear();
  selectAllFiles(treeModel);
  renderSelectedList();
  renderTree(treeModel, treeRootEl);
});


showTreeBtn.addEventListener('click', showTreeContents);
saveFileBtn.addEventListener('click', saveToFile);

// Render default ignored folders on load
renderIgnoreList();
