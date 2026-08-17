/* NF Sistema - Main Application */

import { apiFetch, setAuthToken, clearAuthToken, auth, customers, companies, invoices, reports } from './api.js';
import { getState, setUser, setCurrentPage, setTheme, getTheme, setState, setData, setLoading } from './state.js';
import { setupNavigation, selectPage, registerPageLoader } from './router.js';
import { showNotification, showConfirmDialog, formatCurrency, formatDate, createEmptyState } from './ui.js';

// Pages
import { setupDashboardPage } from './pages/dashboard.js';
import { setupClientesPage } from './pages/clientes.js';
import { setupEmpresasPage } from './pages/empresas.js';
import { setupNotasPage } from './pages/notas.js';
import { setupRelatoriosPage } from './pages/relatorios.js';

// ============ INICIALIZAÇÃO ============

async function initApp() {
  console.log('Inicializando NF Sistema...');

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
    await selectPage('dashboard');
  } catch (error) {
    // Token expired or invalid — go back to login
    console.error('Token inválido ou expirado:', error);
    clearAuthToken();
    showLoginForm();
  }
}

function showLoginForm() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';

  const btnLogin = document.getElementById('btnLogin');
  const btnForgot = document.getElementById('forgotPasswordLink');

  btnLogin.onclick = handleLogin;
  btnForgot.onclick = handleForgotPassword;
}

function showMainApp() {
  document.getElementById('loginOverlay').style.display = 'none';
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

    // Clear form
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';

    showMainApp();
    await selectPage('dashboard');
  } catch (error) {
    console.error('Erro ao fazer login:', error);
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
    console.error('Erro:', error);
    alert('Erro ao enviar. Tente novamente.');
  }
}

function setupThemeToggle() {
  const btn = document.getElementById('btnThemeToggle');
  btn.onclick = () => {
    const currentTheme = getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };
}

function setupLogout() {
  const btn = document.getElementById('btnLogout');
  btn.onclick = () => {
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
