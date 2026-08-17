/* Empresas Page - Full CRUD */

import { companies } from '../api.js';
import { formatDate, showNotification, showConfirmDialog, createEmptyState, formatCNPJ, debounce } from '../ui.js';
import { setData, getData } from '../state.js';

let currentEditId = null;

export async function setupEmpresasPage(pageEl) {
  pageEl.innerHTML = '';
  await loadEmpresas(pageEl);
}

async function loadEmpresas(pageEl) {
  try {
    const data = await companies.list();
    setData('companies', data);
    renderEmpresas(pageEl, data);
  } catch (error) {
    console.error('Erro ao carregar empresas:', error);
    showNotification('Erro ao carregar empresas', 'error');
    pageEl.innerHTML = '<div class="card"><p>Erro ao carregar dados</p></div>';
  }
}

function renderEmpresas(pageEl, empresasList) {
  if (!empresasList || empresasList.length === 0) {
    const empty = createEmptyState(
      '🏢',
      'Nenhuma empresa cadastrada',
      'Comece adicionando sua primeira empresa emissora',
      {
        label: '+ Nova empresa',
        onClick: () => toggleForm(true),
      }
    );
    const card = document.createElement('div');
    card.className = 'card';
    card.appendChild(empty);
    pageEl.innerHTML = '';
    pageEl.appendChild(card);
    return;
  }

  const html = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Empresas Emissoras</div>
          <div class="card-subtitle">Cadastro das empresas autorizadas a emitir notas fiscais</div>
        </div>
        <button class="btn btn-primary" id="btnAddEmpresa">+ Adicionar empresa</button>
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <div class="form-group" style="min-width: 200px">
            <label>Nome / CNPJ</label>
            <input type="text" id="empresaSearch" placeholder="Digite parte do nome ou CNPJ..." />
          </div>
        </div>
        <div class="toolbar-right">
          <span class="chip-filter active" data-filter="all">Todas</span>
          <span class="chip-filter" data-filter="true">Ativas</span>
          <span class="chip-filter" data-filter="false">Inativas</span>
        </div>
      </div>

      <!-- FORM EMPRESA -->
      <div id="empresaFormWrapper" style="display: none; margin-bottom: 10px">
        <div style="padding: 10px; border-radius: 12px; border: 1px dashed var(--border); background: color-mix(in srgb, var(--primary-soft) 25%, var(--bg-elevated) 75%)">
          <div class="form-row">
            <div class="form-group">
              <label>Nome da empresa</label>
              <input type="text" id="empresaNome" />
            </div>
            <div class="form-group">
              <label>CNPJ</label>
              <input type="text" id="empresaCnpj" placeholder="00.000.000/0000-00" />
            </div>
            <div class="form-group">
              <label>Chave de acesso</label>
              <input type="text" id="empresaChave" />
            </div>
            <div class="form-group" style="max-width: 120px">
              <label>Status</label>
              <select id="empresaAtiva">
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </select>
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px">
            <button id="btnCancelEmpresa" class="btn btn-secondary">Cancelar</button>
            <button id="btnSaveEmpresa" class="btn btn-primary">Salvar</button>
          </div>
          <div id="empresaFormError" class="error-text" style="display: none"></div>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CNPJ</th>
              <th>Chave de Acesso</th>
              <th>Status</th>
              <th>Criada em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="empresasTableBody">
          </tbody>
        </table>
      </div>
    </div>
  `;

  pageEl.innerHTML = html;

  const tbody = document.getElementById('empresasTableBody');
  empresasList.forEach((empresa) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${empresa.name}</strong></td>
      <td>${formatCNPJ(empresa.cnpj)}</td>
      <td><code style="font-size: 11px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px;">${empresa.access_key ? empresa.access_key.substring(0, 16) + '...' : '—'}</code></td>
      <td><span class="status-pill status-${empresa.active ? 'paga' : 'cancelada'}">${empresa.active ? '✓ Ativa' : '✗ Inativa'}</span></td>
      <td>${formatDate(empresa.created_at)}</td>
      <td style="display: flex; gap: 4px">
        <button class="btn btn-ghost" data-action="edit" data-id="${empresa.id}">Editar</button>
        <button class="btn btn-danger" data-action="delete" data-id="${empresa.id}">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Action delegation
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);
    if (action === 'edit') editEmpresa(id);
    if (action === 'delete') deleteEmpresa(id);
  });

  // Buttons
  document.getElementById('btnAddEmpresa').addEventListener('click', () => toggleForm(true));
  document.getElementById('btnCancelEmpresa').addEventListener('click', () => toggleForm(false));
  document.getElementById('btnSaveEmpresa').addEventListener('click', saveEmpresa);

  // Search
  document.getElementById('empresaSearch').addEventListener('input', debounce((e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('#empresasTableBody tr').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }, 200));

  // Filter chips
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      filterByStatus(chip.dataset.filter);
    });
  });
}

function toggleForm(show = null) {
  const wrapper = document.getElementById('empresaFormWrapper');
  const isVisible = wrapper.style.display !== 'none';

  if (show === true || (!isVisible && show === null)) {
    wrapper.style.display = 'block';
    currentEditId = null;
    clearForm();
  } else {
    wrapper.style.display = 'none';
    currentEditId = null;
    clearForm();
  }
}

function clearForm() {
  document.getElementById('empresaNome').value = '';
  document.getElementById('empresaCnpj').value = '';
  document.getElementById('empresaChave').value = '';
  document.getElementById('empresaAtiva').value = 'true';
  document.getElementById('empresaFormError').style.display = 'none';
}

function editEmpresa(id) {
  const allEmpresas = getData('companies');
  const empresa = allEmpresas.find((e) => e.id === id);
  if (!empresa) return;

  currentEditId = id;
  document.getElementById('empresaFormWrapper').style.display = 'block';
  document.getElementById('empresaNome').value = empresa.name || '';
  document.getElementById('empresaCnpj').value = empresa.cnpj || '';
  document.getElementById('empresaChave').value = empresa.access_key || '';
  document.getElementById('empresaAtiva').value = String(empresa.active);
}

async function saveEmpresa() {
  const name = document.getElementById('empresaNome').value.trim();
  const cnpj = document.getElementById('empresaCnpj').value.trim();
  const access_key = document.getElementById('empresaChave').value.trim();
  const active = document.getElementById('empresaAtiva').value === 'true';
  const errorEl = document.getElementById('empresaFormError');

  if (!name || !cnpj) {
    errorEl.textContent = 'Nome e CNPJ são obrigatórios';
    errorEl.style.display = 'block';
    return;
  }

  const payload = { name, cnpj, access_key, active };

  try {
    if (currentEditId) {
      await companies.update(currentEditId, payload);
      showNotification('Empresa atualizada com sucesso', 'success');
    } else {
      await companies.create(payload);
      showNotification('Empresa criada com sucesso', 'success');
    }

    currentEditId = null;
    toggleForm(false);
    const pageEl = document.getElementById('page-empresas');
    await loadEmpresas(pageEl);
  } catch (error) {
    console.error('Erro ao salvar:', error);
    errorEl.textContent = error.message || 'Erro ao salvar empresa';
    errorEl.style.display = 'block';
  }
}

function deleteEmpresa(id) {
  const allEmpresas = getData('companies');
  const empresa = allEmpresas.find((e) => e.id === id);

  showConfirmDialog(
    'Deletar empresa',
    `Deseja deletar a empresa "${empresa?.name || id}"? Esta ação não pode ser desfeita.`,
    async () => {
      try {
        await companies.delete(id);
        showNotification('Empresa deletada', 'success');
        const pageEl = document.getElementById('page-empresas');
        await loadEmpresas(pageEl);
      } catch (error) {
        showNotification('Erro ao deletar', 'error');
      }
    }
  );
}

function filterByStatus(status) {
  const allEmpresas = getData('companies');

  if (status === 'all') {
    document.querySelectorAll('#empresasTableBody tr').forEach((row) => {
      row.style.display = '';
    });
    return;
  }

  const activeValue = status === 'true';
  const filteredIds = allEmpresas
    .filter((e) => e.active === activeValue)
    .map((e) => e.id);

  document.querySelectorAll('#empresasTableBody tr').forEach((row) => {
    const editBtn = row.querySelector('[data-action="edit"]');
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      row.style.display = filteredIds.includes(id) ? '' : 'none';
    }
  });
}
