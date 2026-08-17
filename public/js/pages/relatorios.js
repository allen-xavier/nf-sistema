/* Relatórios Page */

import { reports } from '../api.js';
import { showNotification, formatCurrency } from '../ui.js';
import { setData } from '../state.js';

let relChart = null;

export async function setupRelatoriosPage(pageEl) {
  pageEl.innerHTML = '';
  renderDateFilter(pageEl);
  await loadRelatorios(pageEl);
}

function renderDateFilter(pageEl) {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startDate = thirtyDaysAgo.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  const filterHtml = `
    <div class="card" style="margin-bottom: 16px">
      <div class="form-row" style="gap: 10px; align-items: flex-end; margin: 0">
        <div class="form-group" style="max-width: 160px">
          <label>Data inicial</label>
          <input type="date" id="relDataIni" value="${startDate}" />
        </div>
        <div class="form-group" style="max-width: 160px">
          <label>Data final</label>
          <input type="date" id="relDataFim" value="${endDate}" />
        </div>
        <button class="btn btn-primary" id="relApplyFilter">Aplicar</button>
      </div>
    </div>
    <div id="relContent"></div>
  `;

  pageEl.innerHTML = filterHtml;

  document.getElementById('relApplyFilter').addEventListener('click', () => loadRelatorios(pageEl));
}

async function loadRelatorios(pageEl) {
  const startDate = document.getElementById('relDataIni')?.value || '';
  const endDate = document.getElementById('relDataFim')?.value || '';

  try {
    const data = await reports.summary({
      start: startDate,
      end: endDate,
      group_by: 'day',
    });

    setData('reports', data);
    renderRelatorios(data);
  } catch (error) {
    console.error('Erro ao carregar relatórios:', error);
    showNotification('Erro ao carregar relatórios', 'error');
    const content = document.getElementById('relContent');
    if (content) content.innerHTML = '<div class="card"><p>Erro ao carregar dados</p></div>';
  }
}

function renderRelatorios(data) {
  const { totals = {}, porDia = [], porCliente = [], porEmpresa = [] } = data;

  const totalNotas = Number(totals.total_notas) || 0;
  const totalValor = parseFloat(totals.soma_valor_total) || 0;
  const totalTaxas = parseFloat(totals.soma_taxas) || 0;

  const contentEl = document.getElementById('relContent');
  if (!contentEl) return;

  contentEl.innerHTML = `
    <div class="card">
      <!-- TABS -->
      <div class="tabs" style="margin-bottom: 20px">
        <button class="tab-button active" data-tab="geral">Geral</button>
        <button class="tab-button" data-tab="clientes">Por Cliente</button>
        <button class="tab-button" data-tab="empresas">Por Empresa</button>
        <button class="tab-button" data-tab="tendencia">Tendência</button>
      </div>

      <!-- TAB: GERAL -->
      <div id="tab-geral" class="tab-content">
        <div class="grid grid-3">
          <div style="padding: 16px; border-radius: 8px; background: var(--bg-input)">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px">Total de NFs</div>
            <div style="font-size: 24px; font-weight: 600">${totalNotas}</div>
          </div>
          <div style="padding: 16px; border-radius: 8px; background: var(--bg-input)">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px">Valor Total</div>
            <div style="font-size: 24px; font-weight: 600">${formatCurrency(totalValor)}</div>
          </div>
          <div style="padding: 16px; border-radius: 8px; background: var(--bg-input)">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px">Total de Taxas</div>
            <div style="font-size: 24px; font-weight: 600">${formatCurrency(totalTaxas)}</div>
          </div>
        </div>
      </div>

      <!-- TAB: CLIENTES -->
      <div id="tab-clientes" class="tab-content hidden">
        ${porCliente.length > 0 ? `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Notas</th>
                <th>Valor Total</th>
              </tr>
            </thead>
            <tbody>
              ${porCliente.map((c) => `
                <tr>
                  <td>${c.name || 'ID: ' + c.customer_id}</td>
                  <td>${c.total_notas}</td>
                  <td>${formatCurrency(parseFloat(c.soma_valor_total) || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : '<p style="text-align: center; color: var(--text-muted); padding: 24px">Sem dados</p>'}
      </div>

      <!-- TAB: EMPRESAS -->
      <div id="tab-empresas" class="tab-content hidden">
        ${porEmpresa.length > 0 ? `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Notas</th>
                <th>Valor Total</th>
              </tr>
            </thead>
            <tbody>
              ${porEmpresa.map((e) => `
                <tr>
                  <td>${e.name || 'ID: ' + e.company_id}</td>
                  <td>${e.total_notas}</td>
                  <td>${formatCurrency(parseFloat(e.soma_valor_total) || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : '<p style="text-align: center; color: var(--text-muted); padding: 24px">Sem dados</p>'}
      </div>

      <!-- TAB: TENDÊNCIA -->
      <div id="tab-tendencia" class="tab-content hidden">
        <div style="position: relative; height: 300px; margin-top: 16px">
          <canvas id="relChartTendencia"></canvas>
        </div>
      </div>
    </div>
  `;

  // Tab switching
  contentEl.querySelectorAll('.tab-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      contentEl.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
      contentEl.querySelectorAll('.tab-button').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      const tabEl = document.getElementById(`tab-${btn.dataset.tab}`);
      if (tabEl) tabEl.classList.remove('hidden');
    });
  });

  renderTendenciaChart(porDia);
}

function renderTendenciaChart(porDia) {
  const ctx = document.getElementById('relChartTendencia');
  if (!ctx) return;

  if (relChart) {
    relChart.destroy();
  }

  if (!porDia || porDia.length === 0) {
    ctx.parentElement.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">Sem dados no período</p>';
    return;
  }

  const labels = porDia.map((d) => d.label);
  const counts = porDia.map((d) => Number(d.total_notas) || 0);

  relChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Notas por dia',
          data: counts,
          backgroundColor: 'rgba(37, 99, 235, 0.6)',
          borderColor: '#2563eb',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
      },
    },
  });
}
