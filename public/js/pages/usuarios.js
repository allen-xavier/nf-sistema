/* Usuarios Page - Admin only */

import { users } from '../api.js';
import { formatDate, showNotification, showConfirmDialog, showModal, createEmptyState, escapeHtml } from '../ui.js';
import { setData, getData, getState, getActiveCompanyId } from '../state.js';

export async function setupUsuariosPage(pageEl) {
  pageEl.innerHTML = '';
  await loadUsuarios(pageEl);
}

async function loadUsuarios(pageEl) {
  try {
    const data = await users.list();
    setData('users', data);
    renderUsuarios(pageEl, data);
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    showNotification('Erro ao carregar usuários', 'error');
    pageEl.innerHTML = '<div class="card"><p>Erro ao carregar dados</p></div>';
  }
}

function renderUsuarios(pageEl, usersList) {
  if (!usersList || usersList.length === 0) {
    const empty = createEmptyState('👤', 'Nenhum usuário', 'Convide o primeiro operador', {
      label: '+ Convidar usuário',
      onClick: () => showInviteModal(pageEl),
    });
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
          <div class="card-title">Usuários</div>
          <div class="card-subtitle">Gerencie os operadores do sistema</div>
        </div>
        <button class="btn btn-primary" id="btnInviteUser">+ Convidar usuário</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Tipo</th>
              <th>Empresas</th>
              <th>Status</th>
              <th>Último login</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="usersTableBody">
          </tbody>
        </table>
      </div>
    </div>
  `;

  pageEl.innerHTML = html;

  const tbody = document.getElementById('usersTableBody');
  const currentUser = getState().currentUser;

  usersList.forEach((user) => {
    const tr = document.createElement('tr');
    const statusClass = user.status === 'ACTIVE' ? 'tag-success' : user.status === 'DISABLED' ? 'tag-danger' : 'tag-warning';
    const statusLabel = { ACTIVE: 'Ativo', PENDING: 'Pendente', DISABLED: 'Desativado' }[user.status] || user.status;
    const isMe = user.id === currentUser?.id;
    const companyLabels = (user.companies || [])
      .map((company) => `<span class="tag">${escapeHtml(company.name)} · ID ${company.id}</span>`)
      .join(' ') || '—';

    tr.innerHTML = `
      <td><strong>${escapeHtml(user.name)}</strong>${isMe ? ' <span style="font-size:10px;color:var(--text-muted)">(você)</span>' : ''}</td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="tag ${user.is_admin ? 'tag-success' : ''}">${user.is_admin ? 'Admin' : 'Operador'}</span></td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">${companyLabels}</td>
      <td><span class="tag ${statusClass}">${escapeHtml(statusLabel)}</span></td>
      <td>${user.last_login_at ? formatDate(user.last_login_at) : '—'}</td>
      <td>${formatDate(user.created_at)}</td>
      <td style="display: flex; gap: 4px; flex-wrap: wrap">
        ${user.status === 'PENDING' ? `<button class="btn btn-ghost" data-action="resend" data-id="${user.id}">Reenviar</button>` : ''}
        ${!isMe ? `<button class="btn btn-ghost" data-action="access" data-id="${user.id}">Acessos</button>` : ''}
        ${!isMe ? `<button class="btn btn-ghost" data-action="toggle" data-id="${user.id}">${user.status === 'DISABLED' ? 'Ativar' : 'Desativar'}</button>` : ''}
        ${!isMe ? `<button class="btn btn-danger" data-action="delete" data-id="${user.id}">✕</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Action delegation
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);

    if (action === 'resend') await resendInvite(id, pageEl);
    if (action === 'access') showAccessModal(id, pageEl, usersList);
    if (action === 'toggle') await toggleUser(id, pageEl, usersList);
    if (action === 'delete') await deleteUser(id, pageEl, usersList);
  });

  document.getElementById('btnInviteUser').addEventListener('click', () => showInviteModal(pageEl));
}

function showInviteModal(pageEl) {
  const availableCompanies = getState().currentUser?.companies || [];
  const selectedId = getActiveCompanyId();
  const formHtml = `
    <div class="form-group" style="margin-bottom: 8px">
      <label>Nome</label>
      <input type="text" id="inviteNome" placeholder="Nome do operador" />
    </div>
    <div class="form-group" style="margin-bottom: 8px">
      <label>E-mail</label>
      <input type="email" id="inviteEmail" placeholder="operador@empresa.com" />
    </div>
    <div class="form-group checkbox" style="margin-bottom: 8px">
      <label><input type="checkbox" id="inviteAdmin" /> Administrador</label>
    </div>
    <div class="form-group" style="margin-bottom: 8px">
      <label>Empresas permitidas</label>
      <div style="display:grid;gap:6px;margin-top:6px">
        ${availableCompanies.map((company) => `
          <label class="checkbox" style="display:flex;gap:7px;align-items:center">
            <input type="checkbox" name="inviteCompany" value="${company.id}" ${Number(company.id) === Number(selectedId) ? 'checked' : ''} />
            ${escapeHtml(company.name)} · ID ${company.id}
          </label>
        `).join('')}
      </div>
    </div>
    <div id="inviteError" class="error-text" style="display: none"></div>
    <div id="inviteResult" style="display: none; margin-top: 12px; padding: 10px; border-radius: 8px; background: var(--success-soft); border: 1px solid var(--success)">
    </div>
  `;

  const overlay = showModal('Convidar novo usuário', formHtml, [
    { label: 'Cancelar' },
    {
      label: 'Enviar convite',
      primary: true,
      onClick: async () => {
        // Prevent modal close — we handle it manually
      },
    },
  ]);

  // Override the save button
  const saveBtn = overlay.querySelectorAll('.btn-primary')[0];
  if (saveBtn) {
    saveBtn.onclick = async (e) => {
      e.stopPropagation();
      await handleInvite(overlay, pageEl);
    };
  }
}

async function handleInvite(overlay, pageEl) {
  const name = document.getElementById('inviteNome')?.value.trim();
  const email = document.getElementById('inviteEmail')?.value.trim();
  const is_admin = document.getElementById('inviteAdmin')?.checked || false;
  const company_ids = [...document.querySelectorAll('input[name="inviteCompany"]:checked')]
    .map((input) => Number(input.value));
  const errorEl = document.getElementById('inviteError');
  const resultEl = document.getElementById('inviteResult');

  if (!name || !email || !company_ids.length) {
    errorEl.textContent = !company_ids.length ? 'Selecione pelo menos uma empresa' : 'Nome e e-mail são obrigatórios';
    errorEl.style.display = 'block';
    return;
  }

  try {
    errorEl.style.display = 'none';
    const response = await users.create({ name, email, is_admin, company_ids });

    if (response.invitation?.activation_url) {
      // E-mail não enviado — mostrar link manual
      resultEl.innerHTML = `
        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--success)">✓ Usuário criado</p>
        <p style="margin: 0 0 4px; font-size: 12px; color: var(--text-muted)">E-mail não pôde ser enviado. Copie o link abaixo e envie manualmente:</p>
        <input type="text" value="${escapeHtml(response.invitation.activation_url)}" readonly style="width: 100%; font-size: 11px; padding: 6px" />
        <p style="margin: 4px 0 0; font-size: 11px; color: var(--text-muted)">Válido por 24 horas.</p>
      `;
      resultEl.style.display = 'block';
      resultEl.querySelector('input')?.addEventListener('click', (event) => event.currentTarget.select());
    } else {
      resultEl.innerHTML = `
        <p style="margin: 0; font-size: 13px; color: var(--success)">✓ Convite enviado para ${escapeHtml(email)}</p>
      `;
      resultEl.style.display = 'block';
      setTimeout(() => {
        overlay.remove();
        loadUsuarios(pageEl);
      }, 2000);
    }

    showNotification('Usuário convidado com sucesso', 'success');
  } catch (error) {
    errorEl.textContent = error.message || 'Erro ao convidar';
    errorEl.style.display = 'block';
  }
}

function showAccessModal(id, pageEl, usersList) {
  const user = usersList.find((item) => item.id === id);
  if (!user) return;
  const selected = new Set((user.companies || []).map((company) => Number(company.id)));
  const availableCompanies = getState().currentUser?.companies || [];
  const content = `
    <p style="font-size:12px;color:var(--text-muted);margin-top:0">
      Selecione as empresas que ${escapeHtml(user.name)} poderá acessar.
    </p>
    <div style="display:grid;gap:8px">
      ${availableCompanies.map((company) => `
        <label class="checkbox" style="display:flex;gap:7px;align-items:center">
          <input type="checkbox" name="accessCompany" value="${company.id}" ${selected.has(Number(company.id)) ? 'checked' : ''} />
          ${escapeHtml(company.name)} · ID ${company.id}
        </label>
      `).join('')}
    </div>
    <div id="accessError" class="error-text" style="display:none;margin-top:8px"></div>
  `;

  const overlay = showModal('Acesso às empresas', content, [
    { label: 'Cancelar' },
    { label: 'Salvar acessos', primary: true },
  ]);
  const saveBtn = overlay.querySelector('.btn-primary');
  saveBtn.onclick = async (event) => {
    event.stopPropagation();
    const company_ids = [...overlay.querySelectorAll('input[name="accessCompany"]:checked')]
      .map((input) => Number(input.value));
    const errorEl = overlay.querySelector('#accessError');
    if (!company_ids.length) {
      errorEl.textContent = 'Selecione pelo menos uma empresa.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await users.update(id, { company_ids });
      overlay.remove();
      showNotification('Acessos atualizados', 'success');
      await loadUsuarios(pageEl);
    } catch (error) {
      errorEl.textContent = error.message || 'Erro ao atualizar acessos';
      errorEl.style.display = 'block';
    }
  };
}

async function resendInvite(id, pageEl) {
  try {
    const response = await users.resendInvite(id);

    if (response.activation_url) {
      const content = `
        <p style="font-size: 13px">E-mail não pôde ser enviado. Copie o link:</p>
        <input type="text" value="${escapeHtml(response.activation_url)}" readonly style="width: 100%; font-size: 11px; padding: 6px" />
        <p style="font-size: 11px; color: var(--text-muted)">Válido por 24 horas.</p>
      `;
      const overlay = showModal('Link de ativação', content, [{ label: 'Fechar' }]);
      overlay.querySelector('input')?.addEventListener('click', (event) => event.currentTarget.select());
    } else {
      showNotification('Convite reenviado por e-mail', 'success');
    }
  } catch (error) {
    showNotification(error.message || 'Erro ao reenviar', 'error');
  }
}

async function toggleUser(id, pageEl, usersList) {
  const user = usersList.find((u) => u.id === id);
  const newStatus = user.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';

  try {
    await users.update(id, { status: newStatus });
    showNotification(`Usuário ${newStatus === 'ACTIVE' ? 'ativado' : 'desativado'}`, 'success');
    await loadUsuarios(pageEl);
  } catch (error) {
    showNotification(error.message || 'Erro', 'error');
  }
}

async function deleteUser(id, pageEl, usersList) {
  const user = usersList.find((u) => u.id === id);

  showConfirmDialog(
    'Deletar usuário',
    `Deseja deletar "${user?.name || id}"? Esta ação não pode ser desfeita.`,
    async () => {
      try {
        await users.delete(id);
        showNotification('Usuário deletado', 'success');
        await loadUsuarios(pageEl);
      } catch (error) {
        showNotification(error.message || 'Erro ao deletar', 'error');
      }
    }
  );
}
