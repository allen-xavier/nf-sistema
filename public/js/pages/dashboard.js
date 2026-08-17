/* Dashboard Page */

import { reports } from '../api.js';
import { formatCurrency, showNotification } from '../ui.js';
import { setData, setLoading } from '../state.js';

let dashboardCharts = {};

export async function setupDashboardPage(pageEl) {
  pageEl.innerHTML = '';
  renderDateFilter(pageEl);
  await loadDashboard(pageEl);
}

function renderDateFilter(pageEl) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = today.toISOString().split('T')[0];

  const filterHtml = `
    <div class="card" style="margin-bottom: 16px">
      <div class="form-row" style="gap: 10px; align-items: flex-end; margin: 0">
        <div class="form-group" style="max-width: 160px">
          <label>Data inicial</label>
          <input type="date" id="dashDataIni" value="${firstDay}" />
        </div>
        <div class="form-group" style="max-width: 160px">
          <label>Data final</label>
          <input type="date" id="dashDataFim" value="${lastDay}" />
        </div>
        <button class="btn btn-primary" id="dashApplyFilter">Aplicar</button>
      </div>
    </div>
    <div id="dashContent"></div>
  `;

  pageEl.innerHTML = filterHtml;

  document.getElementById('dashApplyFilter').addEventListener('click', () => loadDashboard(pageEl));
}

async function loadDashboard(pageEl) {
  setLoading('reports', true);

  const startDate = document.getElementById('dashDataIni')?.value || '';
  const endDate = document.getElementById('dashDataFim')?.value || '';

  try {
    const data = await reports.summary({
      start: startDate,
      end: endDate,
      group_by: 'day',
    });

    setData('reports', data);
    renderDashboard(pageEl, data);
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    showNotification('Erro ao carregar dashboard', 'error');
    const content = document.getElementById('dashContent');
    if (content) content.innerHTML = '<div class="card"><p>Erro ao carregar dados.</p></div>';
  } finally {
    setLoading('reports', false);
  }
}

function renderDashboard(pageEl, data) {
  const { totals = {}, porDia = [], porCliente = [] } = data;

  const totalNotas = Number(totals.total_notas) || 0;
  const totalValor = parseFloat(totals.soma_valor_total) || 0;
  const totalTaxas = parseFloat(totals.soma_taxas) || 0;

  const contentEl = document.getElementById('dashContent');
  if (!contentEl) return;

  contentEl.innerHTML = `
    <!-- KPI METRICS -->
    <div class="grid grid-3">
      <div class="card metric-card">
        <div class="metric-label">Total de notas</div>
        <div class="metric-value">${totalNotas}</div>
        <div class="metric-detail">Notas emitidas no período</div>
      </div>
      <div class="card metric-card">
        <div class="metric-label">Valor total</div>
        <div class="metric-value">${formatCurrency(totalValor)}</div>
        <div class="metric-detail">Soma de todas as NFs</div>
      </div>
      <div class="card metric-card">
        <div class="metric-label">Total taxas</div>
        <div class="metric-value">${formatCurrency(totalTaxas)}</div>
        <div class="metric-detail">Comissões geradas no período</div>
      </div>
    </div>

    <!-- CHART -->
    <div class="card" style="margin-top: 16px">
      <div class="card-header">
        <div>
          <div class="card-title">Notas por dia</div>
          <div class="card-subtitle">Volume diário de emissões</div>
        </div>
      </div>
      <div style="position: relative; height: 280px;">
        <canvas id="chartNotasDia"></canvas>
      </div>
    </div>

    <!-- TOP CLIENTES -->
    ${porCliente.length > 0 ? `
    <div class="card" style="margin-top: 16px">
      <div class="card-header">
        <div>
          <div class="card-title">Top Clientes</div>
          <div class="card-subtitle">Por valor total faturado</div>
        </div>
      </div>
      <div class="table-wrapper" style="max-height: 200px">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Notas</th>
              <th>Valor Total</th>
            </tr>
          </thead>
          <tbody>
            ${porCliente.slice(0, 5).map((c) => `
              <tr>
                <td>${c.name || 'ID: ' + c.customer_id}</td>
                <td>${c.total_notas}</td>
                <td>${formatCurrency(parseFloat(c.soma_valor_total) || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}
  `;

  renderDailyChart(porDia);
}

function renderDailyChart(porDia) {
  const ctx = document.getElementById('chartNotasDia');
  if (!ctx) return;

  if (dashboardCharts.daily) {
    dashboardCharts.daily.destroy();
  }

  if (!porDia || porDia.length === 0) {
    ctx.parentElement.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">Sem dados no período</p>';
    return;
  }

  const labels = porDia.map((d) => d.label);
  const counts = porDia.map((d) => Number(d.total_notas) || 0);

  dashboardCharts.daily = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Notas Fiscais',
          data: counts,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.05)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#2563eb',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
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
