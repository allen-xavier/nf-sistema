/* NF Sistema - UI Components & Utilities */

export function showNotification(message, type = 'info', duration = 3000) {
  const container = document.getElementById('notificationContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

export function showModal(title, content, actions = []) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';

  const modal = document.createElement('div');
  modal.className = 'modal-card';

  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleEl = document.createElement('h2');
  titleEl.style.margin = '0';
  titleEl.style.fontSize = '16px';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => overlay.remove();

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const contentEl = document.createElement('div');
  if (typeof content === 'string') {
    contentEl.innerHTML = content;
  } else {
    contentEl.appendChild(content);
  }

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '8px';
  footer.style.justifyContent = 'flex-end';
  footer.style.marginTop = '16px';

  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.className = `btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`;
    btn.textContent = action.label;
    btn.onclick = () => {
      action.onClick?.();
      overlay.remove();
    };
    footer.appendChild(btn);
  });

  modal.appendChild(header);
  modal.appendChild(contentEl);
  if (actions.length > 0) {
    modal.appendChild(footer);
  }

  overlay.appendChild(modal);
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  document.body.appendChild(overlay);

  return overlay;
}

export function showConfirmDialog(title, message, onConfirm, onCancel) {
  const content = document.createElement('div');
  content.innerHTML = `<p style="margin: 0; color: var(--text-muted); font-size: 13px;">${message}</p>`;

  showModal(title, content, [
    {
      label: 'Cancelar',
      onClick: onCancel,
    },
    {
      label: 'Confirmar',
      primary: true,
      onClick: onConfirm,
    },
  ]);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

export function formatPhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `+55 (${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function formatCNPJ(cnpj) {
  if (!cnpj) return '';
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length === 14) {
    return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}/${cleaned.slice(8, 12)}-${cleaned.slice(12)}`;
  }
  return cnpj;
}

export function formatPercent(value) {
  if (!value) return '0%';
  return `${parseFloat(value).toFixed(2)}%`;
}

export function createSkeletonLoader() {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton skeleton-card';
  return skeleton;
}

export function createEmptyState(icon, title, message, action = null) {
  const container = document.createElement('div');
  container.style.cssText = `
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
  `;

  const iconEl = document.createElement('div');
  iconEl.style.fontSize = '48px';
  iconEl.style.marginBottom = '16px';
  iconEl.textContent = icon;

  const titleEl = document.createElement('h3');
  titleEl.style.cssText = `
    margin: 0 0 8px 0;
    color: var(--text);
    font-size: 16px;
  `;
  titleEl.textContent = title;

  const messageEl = document.createElement('p');
  messageEl.style.cssText = `
    margin: 0 0 16px 0;
    font-size: 13px;
    color: var(--text-muted);
  `;
  messageEl.textContent = message;

  container.appendChild(iconEl);
  container.appendChild(titleEl);
  container.appendChild(messageEl);

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = action.label;
    btn.onclick = action.onClick;
    container.appendChild(btn);
  }

  return container;
}

export function createTable(headers, rows, onRowClick = null) {
  const table = document.createElement('table');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.style.cursor = onRowClick ? 'pointer' : 'default';
    tr.onclick = () => onRowClick?.(row, index);

    row.forEach((cell) => {
      const td = document.createElement('td');
      if (typeof cell === 'string') {
        td.textContent = cell;
      } else {
        td.appendChild(cell);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  return table;
}

export function createStatusBadge(status) {
  const badge = document.createElement('span');
  badge.className = `status-pill status-${status?.toLowerCase() || 'emitida'}`;
  badge.textContent = {
    EMITIDA: '📤 Emitida',
    PAGA: '✅ Paga',
    CANCELADA: '❌ Cancelada',
  }[status] || status;
  return badge;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}
