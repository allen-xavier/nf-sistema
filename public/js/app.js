/* NF Sistema - Main Application */

import { apiFetch, setAuthToken, clearAuthToken, auth, customers, companies, invoices, reports } from './api.js';
import { getState, setUser, setCurrentPage, setTheme, getTheme, setState, setData, setLoading } from './state.js';
import { setupNavigation, selectPage, registerPageLoader } from './router.js';
import { showNotification, showConfirmDialog, showModal, formatCurrency, formatDate, createEmptyState } from './ui.js';

// Pages
import { setupDashboardPage } from './pages/dashboard.js';
import { setupClientesPage } from './pages/clientes.js';
import { setupEmpresasPage } from './pages/empresas.js';
import { setupNotasPage } from './pages/notas.js';
import { setupRelatoriosPage } from './pages/relatorios.js';
import { setupUsuariosPage } from './pages/usuarios.js';

// ============ INICIALIZAÇÃO ============

async function initApp() {
  // Verificar se é ativação de conta (?token=xxx)
  const urlParams = new URLSearchParams(window.location.search);
  const activationToken = urlParams.get('token');

  if (activationToken) {
    await handleActivation(activationToken);
    return;
  }

  // Restaurar tema
  const theme = getTheme();
  document.body.setAttribute('data-theme', theme);

  // Setup theme toggle
  setupThemeToggle();

  // Setup logout
  setupLogout();

  // Registrar páginas
  registerPageLoader('dashboard', setupDashboardPage);
  registerPageLoader('clientes', setupClientesPage);
  registerPageLoader('empresas', setupEmpresasPage);
  registerPageLoader('notas', setupNotasPage);
  registerPageLoader('relatorios', setupRelatoriosPage);
  registerPageLoader('usuarios', setupUsuariosPage);

  // Setup navegação
  setupNavigation();

  // Verificar autenticação
  await checkAuth();
}

async function checkAuth() {
  const token = localStorage.getItem('nf_token');

  if (!token) {
    showLoginForm();
    return;
  }

  // Token exists — show app immediately to avoid flash
  setAuthToken(token);
  showMainApp();

  try {
    const user = await auth.getCurrentUser();
    setUser(user);
    document.getElementById('currentUserEmail').textContent = user.email;
    applyPermissions(user);
    await selectPage('dashboard');
  } catch (error) {
    console.error('Token inválido ou expirado:', error);
    clearAuthToken();
    showLoginForm();
  }
}

function applyPermissions(user) {
  // Mostrar/esconder itens admin-only
  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.style.display = user.is_admin ? '' : 'none';
  });
}

function showLoginForm() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('activationOverlay').style.display = 'none';

  const btnLogin = document.getElementById('btnLogin');
  const btnForgot = document.getElementById('forgotPasswordLink');

  btnLogin.onclick = handleLogin;
  btnForgot.onclick = handleForgotPassword;

  // Enter key on password field
  document.getElementById('loginPassword').onkeydown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };
}

function showMainApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('activationOverlay').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');

  if (!email || !password) {
    errorEl.textContent = 'Preencha e-mail e senha';
    errorEl.style.display = 'block';
    return;
  }

  try {
    errorEl.style.display = 'none';
    const response = await auth.login(email, password);

    setAuthToken(response.token);
    setUser(response.user);
    document.getElementById('currentUserEmail').textContent = response.user.email;

    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';

    showMainApp();
    applyPermissions(response.user);
    await selectPage('dashboard');
  } catch (error) {
    errorEl.textContent = error.message || 'Erro ao fazer login';
    errorEl.style.display = 'block';
  }
}

async function handleForgotPassword() {
  const email = prompt('Digite seu e-mail:');
  if (!email) return;

  try {
    await auth.forgotPassword(email);
    document.getElementById('forgotInfo').textContent = 'Um link de recuperação foi enviado para seu e-mail';
    document.getElementById('forgotInfo').style.display = 'block';
  } catch (error) {
    alert('Erro ao enviar. Tente novamente.');
  }
}

// ============ ATIVAÇÃO DE CONTA ============

async function handleActivation(token) {
  const overlay = document.getElementById('activationOverlay');
  const loginOverlay = document.getElementById('loginOverlay');
  const appShell = document.getElementById('appShell');

  loginOverlay.style.display = 'none';
  appShell.style.display = 'none';
  overlay.style.display = 'flex';

  try {
    const info = await auth.activateInfo(token);
    renderActivationForm(overlay, info, token);
  } catch (error) {
    overlay.querySelector('.login-card').innerHTML = `
      <div style="text-align: center; padding: 20px">
        <div style="font-size: 48px; margin-bottom: 16px">⚠️</div>
        <h2 style="margin: 0 0 8px">Link inválido</h2>
        <p style="color: var(--text-muted); font-size: 13px">${error.message || 'Este link de ativação é inválido, expirado ou já foi usado.'}</p>
        <button class="btn btn-primary" style="margin-top: 16px" onclick="window.location.href='/'">Ir para login</button>
      </div>
    `;
  }
}

function renderActivationForm(overlay, info, token) {
  overlay.querySelector('.login-card').innerHTML = `
    <div style="text-align: center; margin-bottom: 16px">
      <div style="font-size: 36px; margin-bottom: 8px">🎉</div>
      <h2 style="margin: 0 0 4px; font-size: 18px">Bem-vindo, ${info.name}!</h2>
      <p style="color: var(--text-muted); font-size: 12px; margin: 0">Defina sua senha para ativar sua conta</p>
    </div>
    <div class="form-group" style="margin-bottom: 8px">
      <label>Nova senha</label>
      <input type="password" id="activatePassword" placeholder="Mínimo 8 caracteres" />
    </div>
    <div class="form-group" style="margin-bottom: 8px">
      <label>Confirmar senha</label>
      <input type="password" id="activatePasswordConfirm" placeholder="Repita a senha" />
    </div>
    <div id="activateError" class="error-text" style="display: none"></div>
    <button id="btnActivate" class="btn btn-primary" style="width: 100%; margin-top: 10px">Ativar minha conta</button>
    <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px; text-align: center">
      Senha: mínimo 8 caracteres, com letras e números
    </p>
  `;

  document.getElementById('btnActivate').onclick = () => submitActivation(token);
  document.getElementById('activatePasswordConfirm').onkeydown = (e) => {
    if (e.key === 'Enter') submitActivation(token);
  };
}

async function submitActivation(token) {
  const password = document.getElementById('activatePassword').value;
  const confirm = document.getElementById('activatePasswordConfirm').value;
  const errorEl = document.getElementById('activateError');

  if (!password || !confirm) {
    errorEl.textContent = 'Preencha ambos os campos';
    errorEl.style.display = 'block';
    return;
  }

  if (password !== confirm) {
    errorEl.textContent = 'Senhas não conferem';
    errorEl.style.display = 'block';
    return;
  }

  try {
    errorEl.style.display = 'none';
    const response = await auth.activate(token, password, confirm);

    // Login automático
    setAuthToken(response.token);
    setUser(response.user);

    // Limpar URL
    window.history.replaceState({}, '', '/');

    showNotification('Conta ativada com sucesso!', 'success');

    // Reiniciar app
    document.getElementById('currentUserEmail').textContent = response.user.email;

    const theme = getTheme();
    document.body.setAttribute('data-theme', theme);
    setupThemeToggle();
    setupLogout();
    setupNavigation();

    registerPageLoader('dashboard', setupDashboardPage);
    registerPageLoader('clientes', setupClientesPage);
    registerPageLoader('empresas', setupEmpresasPage);
    registerPageLoader('notas', setupNotasPage);
    registerPageLoader('relatorios', setupRelatoriosPage);
    registerPageLoader('usuarios', setupUsuariosPage);

    showMainApp();
    applyPermissions(response.user);
    await selectPage('dashboard');
  } catch (error) {
    errorEl.textContent = error.message || 'Erro ao ativar conta';
    errorEl.style.display = 'block';
  }
}

// ============ THEME & LOGOUT ============

function setupThemeToggle() {
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.onclick = () => {
    const newTheme = getTheme() === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };
}

function setupLogout() {
  const btn = document.getElementById('btnLogout');
  if (btn) btn.onclick = () => {
    clearAuthToken();
    setUser(null);
    showLoginForm();
    showNotification('Desconectado com sucesso', 'info', 2000);
  };
}

// ============ EXPORTAR UTILITÁRIOS GLOBAIS ============

window.app = {
  selectPage,
  showNotification,
  showConfirmDialog,
  formatCurrency,
  formatDate,
  createEmptyState,
};

// ============ START ============

document.addEventListener('DOMContentLoaded', initApp);
