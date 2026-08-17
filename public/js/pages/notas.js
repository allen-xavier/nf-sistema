/* Notas Page - Full with infinite scroll and filters */

import { invoices } from '../api.js';
import { formatDate, showNotification, formatCurrency, createEmptyState, showModal, showConfirmDialog, debounce } from '../ui.js';
import { setData, getData, getState } from '../state.js';

let notasState = {
  data: [],
  page: 1,
  limit: 50,
  exhausted: false,
  loading: false,
};

export async function setupNotasPage(pageEl) {
  pageEl.innerHTML = '';
  notasState = { data: [], page: 1, limit: 50, exhausted: false, loading: false };
  await loadNotas(pageEl);
}

async function loadNotas(pageEl, append = false) {
  if (notasState.loading || (notasState.exhausted && append)) return;
  notasState.loading = true;

  try {
    const filters = getActiveFilters();
    filters.page = notasState.page;
    filters.limit = notasState.limit;

    const response = await invoices.list(filters);
    const notes = response.data || [];
    const total = response.pagination?.total || notes.length;

    if (append) {
      notasState.data = [...notasState.data, ...notes];
    } else {
      notasState.data = notes;
    }

    if (notasState.data.length >= total || notes.length === 0) {
      notasState.exhausted = true;
    }

    setData('invoices', notasState.data);

    if (!append) {
      renderNotas(pageEl, notasState.data, total);
    } else {
      appendRows(notes);
      updateCounter(notasState.data.length, total);
    }
  } catch (error) {
    console.error('Erro ao carregar notas:', error);
    showNotification('Erro ao carregar notas', 'error');
    if (!append) {
      pageEl.innerHTML = '<div class="card"><p>Erro ao carregar dados</p></div>';
    }
  } finally {
    notasState.loading = false;
  }
}

function getActiveFilters() {
  const search = document.getElementById('notasSearch')?.value || '';
  const startDate = document.getElementById('notasDataIni')?.value || '';
  const endDate = document.getElementById('notasDataFim')?.value || '';

  const filters = {};
  if (search) filters.search = search;
  if (startDate) filters.start = startDate;
  if (endDate) filters.end = endDate;
  return filters;
}

function renderNotas(pageEl, notes, total) {
  if (!notes || notes.length === 0) {
    const card = document.createElement('div');
    card.className = 'card';

    // Still show filters
    const filterHtml = getFiltersHtml();
    card.innerHTML = filterHtml;
    card.appendChild(createEmptyState(
      '📄',
      'Nenhuma nota encontrada',
      'Ajuste os filtros ou emita uma nova nota fiscal'
    ));
    pageEl.innerHTML = '';
    pageEl.appendChild(card);
    setupFilterListeners(pageEl);
    return;
  }

  const html = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Notas Fiscais</div>
          <div class="card-subtitle">Listagem com scroll infinito</div>
        </div>
        <div class="badge badge-primary" id="notasCounter">${notes.length} de ${total}</div>
      </div>

      ${getFiltersHtml()}

      <div class="table-wrapper" id="notasTableWrapper" style="max-height: 520px">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Empresa</th>
              <th>Comprador</th>
              <th>CPF</th>
              <th>Valor</th>
              <th>Taxa (%)</th>
              <th>Taxa (R$)</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="notasTableBody">
          </tbody>
        </table>
      </div>

      <div id="notasLoader" class="text-center" style="padding: 12px; font-size: 12px; color: var(--text-muted)">
        ${notasState.exhausted ? 'Todas as notas carregadas' : 'Role para carregar mais...'}
      </div>
    </div>
  `;

  pageEl.innerHTML = html;
  appendRows(notes);
  setupFilterListeners(pageEl);
  setupInfiniteScroll(pageEl);
}

function getFiltersHtml() {
  return `
    <div class="form-row" style="gap: 10px; align-items: flex-end; margin-bottom: 12px">
      <div class="form-group" style="flex: 2; min-width: 200px">
        <label>Buscar por cliente / empresa / comprador / CPF</label>
        <input type="text" id="notasSearch" placeholder="Nome, empresa ou CPF do comprador" />
      </div>
      <div class="form-group" style="max-width: 160px">
        <label>Data inicial</label>
        <input type="date" id="notasDataIni" />
      </div>
      <div class="form-group" style="max-width: 160px">
        <label>Data final</label>
        <input type="date" id="notasDataFim" />
      </div>
      <div class="form-group" style="max-width: 220px; display: flex; gap: 6px">
        <button id="notasApplyFilters" class="btn btn-secondary" style="flex: 1">Aplicar</button>
        <button id="notasClearFilters" class="btn btn-secondary" style="flex: 1">Limpar</button>
      </div>
    </div>
  `;
}

function appendRows(notes) {
  const tbody = document.getElementById('notasTableBody');
  if (!tbody) return;

  const isAdmin = getState().currentUser?.is_admin;

  notes.forEach((nota) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';

    // Sequelize DECIMAL fields come as strings
    const totalAmount = parseFloat(nota.total_amount) || 0;
    const feePercent = parseFloat(nota.fee_percent) || 0;
    const feeValue = parseFloat(nota.fee_value) || 0;

    tr.innerHTML = `
      <td><strong>#${nota.id}</strong></td>
      <td>${formatDate(nota.issued_at || nota.created_at)}</td>
      <td>${nota.Customer?.name || nota.customer?.name || '—'}</td>
      <td>${nota.Company?.name || nota.company?.name || '—'}</td>
      <td>${nota.buyer_name || '—'}</td>
      <td>${nota.buyer_cpf || '—'}</td>
      <td>${formatCurrency(totalAmount)}</td>
      <td>${feePercent.toFixed(2)}%</td>
      <td>${formatCurrency(feeValue)}</td>
      <td style="display: flex; gap: 4px">
        <button class="btn btn-ghost" data-action="view" data-id="${nota.id}">👁</button>
        ${isAdmin ? `<button class="btn btn-danger" data-action="delete" data-id="${nota.id}">✕</button>` : ''}
      </td>
    `;

    tr.querySelector('[data-action="view"]').addEventListener('click', (e) => {
      e.stopPropagation();
      viewNotaDetail(nota);
    });

    const deleteBtn = tr.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNota(nota.id);
      });
    }

    tbody.appendChild(tr);
  });
}

function updateCounter(current, total) {
  const counter = document.getElementById('notasCounter');
  if (counter) counter.textContent = `${current} de ${total}`;

  const loader = document.getElementById('notasLoader');
  if (loader) loader.textContent = notasState.exhausted ? 'Todas as notas carregadas' : 'Role para carregar mais...';
}

function setupFilterListeners(pageEl) {
  const applyBtn = document.getElementById('notasApplyFilters');
  const clearBtn = document.getElementById('notasClearFilters');
  const searchInput = document.getElementById('notasSearch');

  // Filtro em tempo real ao digitar
  searchInput?.addEventListener('input', debounce((e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('#notasTableBody tr').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }, 150));

  // Botão aplicar (para filtros de data que precisam ir à API)
  applyBtn?.addEventListener('click', async () => {
    notasState.page = 1;
    notasState.exhausted = false;
    notasState.data = [];
    await loadNotas(pageEl, false);
  });

  clearBtn?.addEventListener('click', async () => {
    const search = document.getElementById('notasSearch');
    const startDate = document.getElementById('notasDataIni');
    const endDate = document.getElementById('notasDataFim');

    if (search) search.value = '';
    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';

    // Show all rows again
    document.querySelectorAll('#notasTableBody tr').forEach((row) => {
      row.style.display = '';
    });

    notasState.page = 1;
    notasState.exhausted = false;
    notasState.data = [];
    await loadNotas(pageEl, false);
  });
}

function setupInfiniteScroll(pageEl) {
  const wrapper = document.getElementById('notasTableWrapper');
  if (!wrapper) return;

  wrapper.addEventListener('scroll', async () => {
    const { scrollTop, scrollHeight, clientHeight } = wrapper;
    if (scrollHeight - scrollTop - clientHeight < 100 && !notasState.exhausted && !notasState.loading) {
      notasState.page++;
      await loadNotas(pageEl, true);
    }
  });
}

function viewNotaDetail(nota) {
  const totalAmount = parseFloat(nota.total_amount) || 0;
  const paidAmount = parseFloat(nota.paid_amount) || 0;
  const saleAmount = parseFloat(nota.sale_amount) || 0;
  const feePercent = parseFloat(nota.fee_percent) || 0;
  const feeValue = parseFloat(nota.fee_value) || 0;

  const content = `
    <div class="modal-grid">
      <div class="modal-field">
        <label>ID</label>
        <div class="value">#${nota.id}</div>
      </div>
      <div class="modal-field">
        <label>Status</label>
        <div class="value"><span class="status-pill status-${(nota.status || 'emitida').toLowerCase()}">${nota.status || 'EMITIDA'}</span></div>
      </div>
      <div class="modal-field">
        <label>Cliente</label>
        <div class="value">${nota.Customer?.name || nota.customer?.name || '—'}</div>
      </div>
      <div class="modal-field">
        <label>Empresa</label>
        <div class="value">${nota.Company?.name || nota.company?.name || '—'}</div>
      </div>
      <div class="modal-field">
        <label>Comprador</label>
        <div class="value">${nota.buyer_name || '—'}</div>
      </div>
      <div class="modal-field">
        <label>CPF Comprador</label>
        <div class="value">${nota.buyer_cpf || '—'}</div>
      </div>
      <div class="modal-field">
        <label>Valor Total</label>
        <div class="value">${formatCurrency(totalAmount)}</div>
      </div>
      <div class="modal-field">
        <label>Valor Pago</label>
        <div class="value">${formatCurrency(paidAmount)}</div>
      </div>
      <div class="modal-field">
        <label>Taxa (%)</label>
        <div class="value">${feePercent.toFixed(2)}%</div>
      </div>
      <div class="modal-field">
        <label>Taxa (R$)</label>
        <div class="value">${formatCurrency(feeValue)}</div>
      </div>
      <div class="modal-field">
        <label>Emissão</label>
        <div class="value">${formatDate(nota.issued_at || nota.created_at)}</div>
      </div>
      <div class="modal-field">
        <label>Origem</label>
        <div class="value">${nota.is_terminal_sale ? '🖥 Terminal' : '📝 Manual'}</div>
      </div>
      ${saleAmount > 0 ? `
        <div class="modal-field">
          <label>Valor Venda Terminal</label>
          <div class="value">${formatCurrency(saleAmount)}</div>
        </div>
      ` : ''}
      ${nota.nsu ? `
        <div class="modal-field">
          <label>NSU</label>
          <div class="value">${nota.nsu}</div>
        </div>
      ` : ''}
      ${nota.nf_link ? `
        <div class="modal-field" style="grid-column: 1 / -1">
          <label>Link NF</label>
          <div class="value"><a href="${nota.nf_link}" target="_blank" style="color: var(--primary)">${nota.nf_link}</a></div>
        </div>
      ` : ''}
    </div>
  `;

  showModal(`Nota Fiscal #${nota.id}`, content, []);
}

function deleteNota(id) {
  showConfirmDialog(
    'Excluir nota fiscal',
    `Deseja excluir a nota fiscal #${id}? Esta ação não pode ser desfeita.`,
    async () => {
      try {
        await invoices.delete(id);
        showNotification('Nota fiscal excluída', 'success');
        const pageEl = document.getElementById('page-notas');
        notasState.page = 1;
        notasState.exhausted = false;
        notasState.data = [];
        await loadNotas(pageEl, false);
      } catch (error) {
        showNotification(error.message || 'Erro ao excluir nota', 'error');
      }
    }
  );
}
