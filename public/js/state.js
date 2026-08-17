/* NF Sistema - State Management */

let state = {
  currentUser: null,
  currentPage: 'dashboard',
  theme: localStorage.getItem('nf_theme') || 'light',
  data: {
    customers: [],
    companies: [],
    invoices: [],
    reports: null,
  },
  loading: {
    customers: false,
    companies: false,
    invoices: false,
    reports: false,
  },
  filters: {
    invoices: {
      search: '',
      status: 'all',
      origem: 'all',
      startDate: '',
      endDate: '',
    },
    customers: {
      search: '',
      status: 'all',
    },
    companies: {
      search: '',
      status: 'all',
    },
  },
};

export function getState() {
  return state;
}

export function setState(path, value) {
  const keys = path.split('.');
  let obj = state;
  for (let i = 0; i < keys.length - 1; i++) {
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
}

export function updateState(updates) {
  Object.assign(state, updates);
}

export function getUser() {
  return state.currentUser;
}

export function setUser(user) {
  state.currentUser = user;
}

export function getCurrentPage() {
  return state.currentPage;
}

export function setCurrentPage(page) {
  state.currentPage = page;
}

export function getTheme() {
  return state.theme;
}

export function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('nf_theme', theme);
  document.body.setAttribute('data-theme', theme);
}

export function getData(path) {
  const keys = path.split('.');
  let obj = state.data;
  for (const key of keys) {
    obj = obj[key];
    if (obj === undefined) return undefined;
  }
  return obj;
}

export function setData(path, value) {
  const keys = path.split('.');
  let obj = state.data;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
}

export function setLoading(path, isLoading) {
  const keys = path.split('.');
  let obj = state.loading;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = isLoading;
}

export function isLoading(path) {
  const keys = path.split('.');
  let obj = state.loading;
  for (const key of keys) {
    obj = obj[key];
    if (obj === undefined) return false;
  }
  return obj;
}

export function setFilter(module, key, value) {
  state.filters[module][key] = value;
}

export function getFilters(module) {
  return state.filters[module] || {};
}

export function clearFilters(module) {
  state.filters[module] = {};
}
