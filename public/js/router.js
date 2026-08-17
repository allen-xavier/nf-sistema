/* NF Sistema - Router */

import { setCurrentPage, getState } from './state.js';

const pages = {
  dashboard: 'Dashboard',
  clientes: 'Clientes',
  empresas: 'Empresas',
  notas: 'Notas Fiscais',
  relatorios: 'Relatórios',
  usuarios: 'Usuários',
};

const pageSubtitles = {
  dashboard: 'Visão geral das notas fiscais, clientes e empresas',
  clientes: 'Gerencie seus clientes e taxas',
  empresas: 'Cadastro das empresas autorizadas a emitir notas fiscais',
  notas: 'Listagem de todas as notas fiscais emitidas',
  relatorios: 'Relatórios e análises de desempenho',
  usuarios: 'Gerencie os operadores do sistema',
};

let currentPageElement = null;
let pageLoaders = {};

export function registerPageLoader(pageName, loader) {
  pageLoaders[pageName] = loader;
}

export async function selectPage(pageName) {
  if (!pages[pageName]) {
    console.error(`Página desconhecida: ${pageName}`);
    return;
  }

  // Hide all pages
  document.querySelectorAll('.page-section').forEach((el) => {
    el.classList.remove('active');
  });

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.remove('active');
  });
  document.querySelector(`[data-page="${pageName}"]`)?.classList.add('active');

  // Update topbar
  document.getElementById('topbarTitle').textContent = pages[pageName];
  document.getElementById('topbarSubtitle').textContent = pageSubtitles[pageName];

  // Show page and call loader
  const pageEl = document.getElementById(`page-${pageName}`);
  if (pageEl) {
    pageEl.classList.add('active');
    currentPageElement = pageEl;

    // Call page loader if exists
    if (pageLoaders[pageName]) {
      try {
        await pageLoaders[pageName](pageEl);
      } catch (error) {
        console.error(`Erro ao carregar página ${pageName}:`, error);
      }
    }
  }

  setCurrentPage(pageName);

  // Close mobile menu
  closeSidebar();
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar?.classList.remove('open');
  backdrop?.classList.remove('show');
}

export function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const pageName = item.getAttribute('data-page');
      await selectPage(pageName);
    });
  });

  // Mobile menu
  document.getElementById('btnMobileMenu')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('show');
  });

  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
    closeSidebar();
  });
}

export function getCurrentPageElement() {
  return currentPageElement;
}
