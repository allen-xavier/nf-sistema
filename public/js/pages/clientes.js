/* Clientes Page - Full CRUD */

import { customers } from '../api.js';
import { formatDate, showNotification, showConfirmDialog, createEmptyState, formatPhoneNumber, debounce } from '../ui.js';
import { setData, getData } from '../state.js';

let currentEditId = null;

export async function setupClientesPage(pageEl) {
  pageEl.innerHTML = '';
  await loadClientes(pageEl);
}

async function loadClientes(pageEl) {
  try {
    const data = await customers.list();
    setData('customers', data);
    renderClientes(pageEl, data);
  } catch (error) {
    console.error('Erro ao carregar clientes:', error);
    showNotification('Erro ao carregar clientes', 'error');
    pageEl.innerHTML = '<div class="card"><p>Erro ao carregar dados</p></div>';
  }
}

function renderClientes(pageEl, clientesList) {
  if (!clientesList || clientesList.length === 0) {
    const empty = createEmptyState(
      '👥',
      'Nenhum cliente cadastrado',
      'Comece adicionando seu primeiro cliente',
      {
        label: '+ Novo cliente',
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
          <div class="card-title">Clientes</div>
          <div class="card-subtitle">Gerencie seus clientes e taxas de nota fiscal</div>
        </div>
        <div style="display: flex; gap: 8px">
          <button class="btn btn-secondary" id="btnToggleForm">Novo / Limpar</button>
          <button class="btn btn-primary" id="btnSaveCliente">Salvar cliente</button>
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <div class="form-group" style="min-width: 200px">
            <label>Buscar por nome ou WhatsApp</label>
            <input type="text" id="clienteSearch" placeholder="Digite para filtrar..." />
          </div>
        </div>
        <div class="toolbar-right">
          <span class="chip-filter active" data-filter="all">Todos</span>
          <span class="chip-filter" data-filter="true">Ativos</span>
          <span class="chip-filter" data-filter="false">Inativos</span>
        </div>
      </div>

      <!-- FORM CLIENTE -->
      <div id="clienteFormWrapper" style="margin-bottom: 10px; display: none">
        <div style="padding: 10px; border-radius: 12px; border: 1px dashed var(--border); background: color-mix(in srgb, var(--primary-soft) 25%, var(--bg-elevated) 75%)">
          <div class="form-row">
            <div class="form-group">
              <label>Nome do cliente</label>
              <input type="text" id="clienteNome" />
            </div>
            <div class="form-group">
              <label>WhatsApp (único)</label>
              <input type="text" id="clienteWhats" placeholder="+55..." />
            </div>
            <div class="form-group" style="max-width: 140px">
              <label>Taxa NF (%)</label>
              <input type="number" id="clienteTaxa" step="0.01" />
            </div>
            <div class="form-group" style="max-width: 120px">
              <label>Status</label>
              <select id="clienteAtivo">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group checkbox">
              <label><input type="checkbox" id="clienteUsaNF" checked /> Ativo Nota Fiscal</label>
            </div>
          </div>
          <div id="clienteFormError" class="error-text" style="display: none"></div>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>WhatsApp</th>
              <th>NF</th>
              <th>Taxa NF (%)</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="clientesTableBody">
          </tbody>
        </table>
      </div>
    </div>
  `;

  pageEl.innerHTML = html;

  const tbody = document.getElementById('clientesTableBody');
  clientesList.forEach((cliente) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${cliente.name}</strong></td>
      <td>${formatPhoneNumber(cliente.whatsapp_number)}</td>
      <td><span class="tag ${cliente.uses_nf ? 'tag-success' : 'tag-muted'}">${cliente.uses_nf ? 'Sim' : 'Não'}</span></td>
      <td>${cliente.fee_percent || '—'}%</td>
      <td><span class="status-pill status-${cliente.is_active ? 'paga' : 'cancelada'}">${cliente.is_active ? '✓ Ativo' : '✗ Inativo'}</span></td>
      <td>${formatDate(cliente.created_at)}</td>
      <td style="display: flex; gap: 4px">
        <button class="btn btn-ghost" data-action="edit" data-id="${cliente.id}">Editar</button>
        <button class="btn btn-danger" data-action="delete" data-id="${cliente.id}">✕</button>
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
    if (action === 'edit') editCliente(id);
    if (action === 'delete') deleteCliente(id);
  });

  // Search
  const searchInput = document.getElementById('clienteSearch');
  searchInput.addEventListener('input', debounce((e) => {
    filterTable(e.target.value);
  }, 200));

  // Filter chips
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const filterValue = chip.dataset.filter;
      filterByStatus(filterValue);
    });
  });

  // Toggle form
  document.getElementById('btnToggleForm').addEventListener('click', () => toggleForm());
  document.getElementById('btnSaveCliente').addEventListener('click', saveCliente);
}

function toggleForm(show = null) {
  const wrapper = document.getElementById('clienteFormWrapper');
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
  document.getElementById('clienteNome').value = '';
  document.getElementById('clienteWhats').value = '';
  document.getElementById('clienteAtivo').value = 'true';
  document.getElementById('clienteUsaNF').checked = true;
  document.getElementById('clienteTaxa').value = '';
  document.getElementById('clienteFormError').style.display = 'none';
}

function editCliente(id) {
  const allClientes = getData('customers');
  const cliente = allClientes.find((c) => c.id === id);
  if (!cliente) return;

  currentEditId = id;
  document.getElementById('clienteFormWrapper').style.display = 'block';
  document.getElementById('clienteNome').value = cliente.name || '';
  document.getElementById('clienteWhats').value = cliente.whatsapp_number || '';
  document.getElementById('clienteAtivo').value = String(cliente.is_active);
  document.getElementById('clienteUsaNF').checked = !!cliente.uses_nf;
  document.getElementById('clienteTaxa').value = cliente.fee_percent || '';
}

async function saveCliente() {
  const name = document.getElementById('clienteNome').value.trim();
  const whatsapp_number = document.getElementById('clienteWhats').value.trim();
  const is_active = document.getElementById('clienteAtivo').value === 'true';
  const uses_nf = document.getElementById('clienteUsaNF').checked;
  const fee_percent = parseFloat(document.getElementById('clienteTaxa').value) || 0;
  const errorEl = document.getElementById('clienteFormError');

  if (!name || !whatsapp_number) {
    errorEl.textContent = 'Nome e WhatsApp são obrigatórios';
    errorEl.style.display = 'block';
    return;
  }

  if (fee_percent == null || isNaN(fee_percent)) {
    errorEl.textContent = 'Taxa é obrigatória';
    errorEl.style.display = 'block';
    return;
  }

  const payload = { name, whatsapp_number, is_active, uses_nf, fee_percent };

  try {
    if (currentEditId) {
      await customers.update(currentEditId, payload);
      showNotification('Cliente atualizado com sucesso', 'success');
    } else {
      await customers.create(payload);
      showNotification('Cliente criado com sucesso', 'success');
    }

    currentEditId = null;
    toggleForm(false);
    const pageEl = document.getElementById('page-clientes');
    await loadClientes(pageEl);
  } catch (error) {
    console.error('Erro ao salvar:', error);
    errorEl.textContent = error.message || 'Erro ao salvar cliente';
    errorEl.style.display = 'block';
  }
}

function deleteCliente(id) {
  const allClientes = getData('customers');
  const cliente = allClientes.find((c) => c.id === id);

  showConfirmDialog(
    'Deletar cliente',
    `Deseja deletar o cliente "${cliente?.name || id}"? Esta ação não pode ser desfeita.`,
    async () => {
      try {
        await customers.delete(id);
        showNotification('Cliente deletado', 'success');
        const pageEl = document.getElementById('page-clientes');
        await loadClientes(pageEl);
      } catch (error) {
        showNotification('Erro ao deletar', 'error');
      }
    }
  );
}

function filterTable(query) {
  const lowerQuery = query.toLowerCase();
  document.querySelectorAll('#clientesTableBody tr').forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(lowerQuery) ? '' : 'none';
  });
}

function filterByStatus(status) {
  const allClientes = getData('customers');

  if (status === 'all') {
    document.querySelectorAll('#clientesTableBody tr').forEach((row) => {
      row.style.display = '';
    });
    return;
  }

  const activeValue = status === 'true';
  const filteredIds = allClientes
    .filter((c) => c.is_active === activeValue)
    .map((c) => c.id);

  document.querySelectorAll('#clientesTableBody tr').forEach((row) => {
    const editBtn = row.querySelector('[data-action="edit"]');
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      row.style.display = filteredIds.includes(id) ? '' : 'none';
    }
  });
}
