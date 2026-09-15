/* Empresas Page - Full CRUD */

import { companies } from '../api.js';
import { formatDate, showNotification, showConfirmDialog, formatCNPJ, debounce, escapeHtml } from '../ui.js';
import { setData, getData, getState, getActiveCompanyId } from '../state.js';

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
  const isAdmin = getState().currentUser?.is_admin === true;

  const html = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Empresas</div>
          <div class="card-subtitle">Cada empresa mantém seus próprios clientes, notas e integrações</div>
        </div>
        ${isAdmin ? '<button class="btn btn-primary" id="btnAddEmpresa">+ Adicionar empresa</button>' : ''}
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
      ${isAdmin ? `<div id="empresaFormWrapper" style="display: none; margin-bottom: 10px">
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
      </div>` : ''}

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
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
    tr.dataset.companyId = String(empresa.id);
    tr.innerHTML = `
      <td><button class="btn btn-ghost" data-action="copy-id" data-id="${empresa.id}" title="Copiar ID">#${empresa.id}</button></td>
      <td><strong>${escapeHtml(empresa.name)}</strong></td>
      <td>${escapeHtml(formatCNPJ(empresa.cnpj))}</td>
      <td><code style="font-size: 11px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px;">${isAdmin && empresa.access_key ? escapeHtml(empresa.access_key.substring(0, 16)) + '...' : 'Restrita'}</code></td>
      <td><span class="status-pill status-${empresa.is_active ? 'paga' : 'cancelada'}">${empresa.is_active ? '✓ Ativa' : '✗ Inativa'}</span></td>
      <td>${formatDate(empresa.created_at)}</td>
      <td style="display: flex; gap: 4px">
        ${isAdmin ? `
          <button class="btn btn-ghost" data-action="edit" data-id="${empresa.id}">Editar</button>
          <button class="btn btn-danger" data-action="delete" data-id="${empresa.id}">✕</button>
        ` : '—'}
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (!empresasList.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:32px">Nenhuma empresa cadastrada</td></tr>`;
  }

  // Action delegation
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);
    if (action === 'copy-id') copyCompanyId(id);
    if (action === 'edit') editEmpresa(id);
    if (action === 'delete') deleteEmpresa(id);
  });

  // Buttons
  document.getElementById('btnAddEmpresa')?.addEventListener('click', () => toggleForm(true));
  document.getElementById('btnCancelEmpresa')?.addEventListener('click', () => toggleForm(false));
  document.getElementById('btnSaveEmpresa')?.addEventListener('click', saveEmpresa);

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
  document.getElementById('empresaAtiva').value = String(empresa.is_active);
}

async function saveEmpresa() {
  const name = document.getElementById('empresaNome').value.trim();
  const cnpj = document.getElementById('empresaCnpj').value.trim();
  const access_key = document.getElementById('empresaChave').value.trim();
  const is_active = document.getElementById('empresaAtiva').value === 'true';
  const errorEl = document.getElementById('empresaFormError');

  if (!name || !cnpj || !access_key) {
    errorEl.textContent = 'Nome, CNPJ e chave de acesso são obrigatórios';
    errorEl.style.display = 'block';
    return;
  }

  const payload = { name, cnpj, access_key, is_active };

  try {
    if (currentEditId) {
      await companies.update(currentEditId, payload);
      await window.app.refreshCompanyContext(getActiveCompanyId());
      showNotification('Empresa atualizada com sucesso', 'success');
    } else {
      const created = await companies.create(payload);
      await window.app.refreshCompanyContext(created.id);
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

async function copyCompanyId(id) {
  try {
    await navigator.clipboard.writeText(String(id));
    showNotification(`ID ${id} copiado`, 'success', 1800);
  } catch (_error) {
    showNotification(`ID da empresa: ${id}`, 'info');
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
        await window.app.refreshCompanyContext();
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
    .filter((e) => e.is_active === activeValue)
    .map((e) => e.id);

  document.querySelectorAll('#empresasTableBody tr').forEach((row) => {
    const id = Number(row.dataset.companyId);
    if (id) row.style.display = filteredIds.includes(id) ? '' : 'none';
  });
}
