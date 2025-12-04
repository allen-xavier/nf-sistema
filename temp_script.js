
      // ==========================
      // THEME
      // ==========================
      function applyTheme(theme) {
        document.body.setAttribute("data-theme", theme);
        localStorage.setItem("nf_theme", theme);
      }

      const savedTheme = localStorage.getItem("nf_theme") || "light";
      applyTheme(savedTheme);

      function normalizeText(value) {
        const base = (value || "").toString().trim().toLowerCase();
        try {
          return base.normalize("NFD").replace(/\p{Diacritic}/gu, "");
        } catch (e) {
          return base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        }
      }

      function onlyDigits(value) {
        return (value || "").toString().replace(/\D/g, "");
      }

      // ==========================
      // AUTH / API
      // ==========================
      let authToken = localStorage.getItem("nf_token") || null;
      let currentUser = null;

      async function apiFetch(path, options = {}) {
        const headers = options.headers || {};
        headers["Content-Type"] = "application/json";
        if (authToken) {
          headers["Authorization"] = "Bearer " + authToken;
        }

        const res = await fetch(path, {
          ...options,
          headers,
        });

        if (res.status === 401) {
          showLogin();
          throw new Error("Não autorizado");
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Erro na API");
        }

        return res.json();
      }

      function showLogin() {
        document.getElementById("loginOverlay").style.display = "flex";
        document.getElementById("appShell").style.display = "none";
      }

      function showApp() {
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("appShell").style.display = "flex";
      }

      async function doLogin() {
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value.trim();
        const errorEl = document.getElementById("loginError");
        errorEl.style.display = "none";

        try {
          const data = await apiFetch("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
            headers: { "Content-Type": "application/json" },
          });

          authToken = data.token;
          currentUser = data.user;
          localStorage.setItem("nf_token", authToken);
          localStorage.setItem("nf_user_email", currentUser.email);

          await startAppAfterAuth();
        } catch (err) {
          console.error(err);
          errorEl.textContent = "Credenciais inválidas.";
          errorEl.style.display = "block";
        }
      }

      async function startAppAfterAuth() {
        document.getElementById("currentUserEmail").textContent =
          currentUser?.email || localStorage.getItem("nf_user_email") || "Administrador";

        showApp();
        selectPage("dashboard");
        loadDashboard();
        const loadedClientes = await loadClientes();
        const loadedEmpresas = await loadEmpresas();
        if (typeof populateRelatorioSelects === "function") {
          populateRelatorioSelects(loadedClientes, loadedEmpresas);
        }
        await loadPosClientes();
        await loadPosCompanies();
        await loadPosTerminals();
        await loadPosVendasRecentes();
        await loadPosResumo();
        resetNotasInfiniteScroll();
        loadNotasPage(true);
        loadRelatorios();
      }

      function logout() {
        authToken = null;
        currentUser = null;
        localStorage.removeItem("nf_token");
        localStorage.removeItem("nf_user_email");
        showLogin();
      }

      async function tryRestoreSession() {
        if (!authToken) {
          showLogin();
          return;
        }
        try {
          currentUser = await apiFetch("/api/auth/me");
          localStorage.setItem(
            "nf_user_email",
            currentUser?.email || localStorage.getItem("nf_user_email") || "Administrador"
          );
          await startAppAfterAuth();
        } catch (err) {
          console.warn("Falha ao validar token; tentando continuar com cache:", err);
          currentUser = { email: localStorage.getItem("nf_user_email") || "Administrador" };
          try {
            await startAppAfterAuth();
          } catch {
            logout();
          }
        }
      }

      
      async function sendForgotPassword() {
        const email = document.getElementById("loginEmail").value.trim();
        const infoEl = document.getElementById("forgotInfo");
        const errorEl = document.getElementById("loginError");
        errorEl.style.display = "none";
        infoEl.style.display = "none";

        if (!email) {
          errorEl.textContent = "Informe seu e-mail para recuperar a senha.";
          errorEl.style.display = "block";
          return;
        }

        try {
          await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          infoEl.textContent =
            "Se o e-mail estiver cadastrado, um link de recuperação foi enviado.";
          infoEl.style.display = "block";
        } catch (err) {
          console.error(err);
          errorEl.textContent = "Erro ao solicitar recuperação de senha.";
          errorEl.style.display = "block";
        }
      }

      // ==========================
      // NAV / PAGES
      // ==========================
      function selectPage(page, anchor) {
        // mostra apenas a seção selecionada
        document.querySelectorAll(".page-section").forEach((sec) => sec.classList.remove("active"));
        const pageEl = document.getElementById("page-" + page);
        if (pageEl) pageEl.classList.add("active");

        // marca item ativo no menu
        document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
        document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add("active");

        // textos topbar
        const topbarTitle = document.getElementById("topbarTitle");
        const topbarSubtitle = document.getElementById("topbarSubtitle");

        if (page === "dashboard") {
          topbarTitle.textContent = "Dashboard";
          topbarSubtitle.textContent = "Visao geral das notas fiscais, clientes e empresas";
        } else if (page === "clientes") {
          topbarTitle.textContent = "Clientes";
          topbarSubtitle.textContent = "Gestao de clientes identificados por WhatsApp";
        } else if (page === "empresas") {
          topbarTitle.textContent = "Empresas emissoras";
          topbarSubtitle.textContent = "Configuracao das empresas que podem emitir notas";
        } else if (page === "notas") {
          topbarTitle.textContent = "Notas fiscais";
          topbarSubtitle.textContent = "Listagem das notas emitidas com carregamento automatico";
        } else if (page.startsWith("pos")) {
          topbarTitle.textContent = "Maquininhas";
          topbarSubtitle.textContent = "Empresas, terminais, taxas e vendas de POS";
        } else if (page === "relatorios") {
          topbarTitle.textContent = "Relatorios";
          topbarSubtitle.textContent = "Analises consolidadas por periodo, cliente e empresa";
          populateRelatorioSelects?.();
          loadRelatorios?.();
        }

        // ações ao entrar em páginas
        if (page === "notas") {
          resetNotasInfiniteScroll();
          loadNotasPage(true);
        }
        if (page.startsWith("pos")) {
          // páginas POS independentes
          loadPosCompanies();
          loadPosTerminals();
          loadPosVendasRecentes();
          loadPosResumo();
        }
      }

      // ==========================
      // DASHBOARD / REPORTS
      // ==========================
      let chartNotasDia = null;
      let chartStatus = null;
      let chartRelPeriodo = null;
      let chartRelClientePeriodo = null;
      let chartRelEmpresaPeriodo = null;

      function formatCNPJ(cnpj) {
        const digits = (cnpj || "").replace(/\D/g, "");
        if (digits.length !== 14) return cnpj || "";
        return digits.replace(
          /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
          "$1.$2.$3/$4-$5"
        );
      }

      function populateRelatorioSelects(clis = clientes, emps = empresas) {
        const selCli = document.getElementById("relClienteSelect");
        const selEmp = document.getElementById("relEmpresaSelect");

        const searchCli = normalizeText(
          document.getElementById("relClienteSearch")?.value || ""
        );
        const searchCliDigits = onlyDigits(
          document.getElementById("relClienteSearch")?.value || ""
        );
        const searchEmp = normalizeText(
          document.getElementById("relEmpresaSearch")?.value || ""
        );
        const searchEmpDigits = onlyDigits(
          document.getElementById("relEmpresaSearch")?.value || ""
        );
        const empStatus = document.getElementById("relEmpresaAtivo")?.value || "all";

        const filteredClientes = (clis || [])
          .filter((c) => {
            if (!searchCli) return true;
            const term = searchCli;
            const name = normalizeText(c.name);
            const whats = normalizeText(c.whatsapp_number);
            const whatsDigits = onlyDigits(c.whatsapp_number);
            return (
              name.includes(term) ||
              whats.includes(term) ||
              (searchCliDigits && whatsDigits.includes(searchCliDigits))
            );
          });

        if (selCli) {
          selCli.innerHTML =
            '<option value="">Selecione um cliente</option>' +
            filteredClientes
              .map(
                (c) =>
                  `<option value="${c.id}">${c.name}${
                    c.whatsapp_number ? " (" + c.whatsapp_number + ")" : ""
                  }</option>`
              )
              .join("");
        }

        const filteredEmpresas = (emps || [])
          .filter((e) => {
            if (empStatus === "true") return e.is_active !== false;
            if (empStatus === "false") return e.is_active === false;
            return true;
          })
          .filter((e) => {
            if (!searchEmp) return true;
            const term = searchEmp;
            const name = normalizeText(e.name);
            const cnpj = (e.cnpj || "").replace(/\D/g, "");
            return (
              name.includes(term) ||
              (searchEmpDigits && cnpj.includes(searchEmpDigits))
            );
          });

        if (selEmp) {
          selEmp.innerHTML =
            '<option value="">Selecione uma empresa</option>' +
            filteredEmpresas
              .map(
                (e) =>
                  `<option value="${e.id}">${e.name} - ${formatCNPJ(e.cnpj)}</option>`
              )
              .join("");
        }
      }

      function formatCurrencyBRL(value) {
        return Number(value || 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL"
        });
      }

      // Converte valores que podem vir como string com vírgula/ponto
      function toNumber(val) {
        if (!val) return 0;
        if (typeof val === "number") return val;
        return Number(String(val).replace(/\./g, "").replace(",", ".")) || 0;
      }

      async function loadDashboard() {
        try {
          const data = await apiFetch("/api/reports/summary");

          const totals = data.totals || {};
          document.getElementById("dashTotalNotas").textContent =
            totals.total_notas || 0;
          document.getElementById("dashValorTotal").textContent =
            formatCurrencyBRL(totals.soma_valor_total || 0);
          document.getElementById("dashTaxas").textContent = formatCurrencyBRL(
            totals.soma_taxas || 0
          );

          const porPeriodo = data.porPeriodo || [];
          const labelsDia = porPeriodo.map((d) => d.label);
          const valoresDia = porPeriodo.map((d) => d.total_notas);


          if (chartNotasDia) chartNotasDia.destroy();
          const ctxDia = document.getElementById("chartNotasDia").getContext("2d");
          chartNotasDia = new Chart(ctxDia, {
            type: "line",
            data: {
              labels: labelsDia,
              datasets: [
                {
                  label: "Notas",
                  data: valoresDia,
                  borderWidth: 2,
                  tension: 0.25,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: { beginAtZero: true },
              },
            },
          });

          const porStatus = data.porStatus || [];
          if (chartStatus) chartStatus.destroy();
          const ctxStatus = document.getElementById("chartStatus").getContext("2d");
          chartStatus = new Chart(ctxStatus, {
            type: "doughnut",
            data: {
              labels: porStatus.map((s) => s.status),
              datasets: [
                {
                  data: porStatus.map((s) => s.total_notas),
                  borderWidth: 1,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { position: "bottom" },
              },
            },
          });
        } catch (err) {
          console.error("Erro ao carregar dashboard:", err);
        }
      }

      async function loadRelatorios() {
        try {
          const start = document.getElementById("relDataIni").value;
          const end = document.getElementById("relDataFim").value;
          const group_by = document.getElementById("relGroupBy").value;

          const params = new URLSearchParams();
          if (start) params.append("start", start);
          if (end) params.append("end", end);
          params.append("group_by", group_by);

          const data = await apiFetch("/api/reports/summary?" + params.toString());

          // ------ TOTAL GERAL ------
          const totals = data.totals || {};
          document.getElementById("relTotalNotas").textContent =
            totals.total_notas || 0;
          document.getElementById("relValorTotal").textContent =
            formatCurrencyBRL(toNumber(totals.soma_valor_total));
          document.getElementById("relTaxasTotal").textContent =
            formatCurrencyBRL(toNumber(totals.soma_taxas));

          // ------ GRÁFICO POR PERÍODO ------
          const porPeriodo = data.porPeriodo || [];
          if (chartRelPeriodo) chartRelPeriodo.destroy();
          const ctx = document.getElementById("chartRelPeriodo").getContext("2d");
          chartRelPeriodo = new Chart(ctx, {
            type: "bar",
            data: {
              labels: porPeriodo.map((p) => p.label),
              datasets: [
                {
                  label: "Notas",
                  data: porPeriodo.map((p) => Number(p.total_notas || 0)),
                },
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: { beginAtZero: true },
              },
            },
          });

          // ------ TOP CLIENTE ------
          const porCliente = data.porCliente || [];
          if (porCliente.length > 0) {
            const topCliente = [...porCliente].sort(
              (a, b) => Number(b.total_notas) - Number(a.total_notas)
            )[0];

            document.getElementById("relTopCliente").textContent =
              `${topCliente.name || "—"} — ${topCliente.total_notas} notas, ${formatCurrencyBRL(toNumber(topCliente.soma_valor_total))}`;
          } else {
            document.getElementById("relTopCliente").textContent = "—";
          }

          // ------ TOP EMPRESA ------
          const porEmpresa = data.porEmpresa || [];
          if (porEmpresa.length > 0) {
            const topEmpresa = [...porEmpresa].sort(
              (a, b) => toNumber(b.soma_valor_total) - toNumber(a.soma_valor_total)
            )[0];

            document.getElementById("relTopEmpresa").textContent =
              `${topEmpresa.name || "—"} — ${formatCurrencyBRL(toNumber(topEmpresa.soma_valor_total))} em notas`;
          } else {
            document.getElementById("relTopEmpresa").textContent = "—";
          }

        } catch (err) {
          console.error("Erro ao carregar relatórios:", err);
        }
      }

      // Helpers para agrupar notas por data no front
      function groupByDateForChart(notas) {
        const map = new Map();
        notas.forEach((n) => {
          if (!n.issued_at) return;
          const d = new Date(n.issued_at);
          const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
          const current = map.get(key) || { total: 0, count: 0 };
          current.total += Number(n.total_amount || 0);
          current.count += 1;
          map.set(key, current);
        });
        const entries = Array.from(map.entries()).sort((a, b) =>
          a[0] < b[0] ? -1 : 1
        );
        const labels = entries.map(([k]) => {
          const d = new Date(k + "T00:00:00");
          return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        });
        const counts = entries.map(([, v]) => v.count);
        return { labels, counts };
      }

      // RELATÓRIO POR CLIENTE
      // RELATÓRIO POR CLIENTE
      async function loadRelatorioPorCliente() {
        const select = document.getElementById("relClienteSelect");
        const id = select.value;

        // Se não tiver cliente selecionado, apenas sai silenciosamente
        if (!id) return;

        const start = document.getElementById("relClienteDataIni").value;
        const end = document.getElementById("relClienteDataFim").value;

        const params = new URLSearchParams();
        if (start) params.append("start", start);
        if (end) params.append("end", end);

        try {
          const data = await apiFetch(`/api/reports/cliente/${id}?` + params.toString());

          const cliente = data.cliente;
          const totais = data.totais || {};
          const notas = data.notas || [];

          document.getElementById("relClienteNome").textContent =
            cliente?.name || "—";
          document.getElementById("relClienteWhats").textContent =
            `WhatsApp: ${cliente?.whatsapp_number || "—"}`;
          document.getElementById("relClienteTotalNotas").textContent =
            totais.total_notas || 0;
          document.getElementById("relClienteValorTotal").textContent =
            formatCurrencyBRL(totais.soma_valor_total || 0);
          document.getElementById("relClienteTaxasTotal").textContent =
            formatCurrencyBRL(totais.soma_taxas || 0);

          // gráfico
          const { labels, counts } = groupByDateForChart(notas);
          if (chartRelClientePeriodo) chartRelClientePeriodo.destroy();
          const ctx = document.getElementById("chartRelClientePeriodo").getContext("2d");
          chartRelClientePeriodo = new Chart(ctx, {
            type: "line",
            data: { labels, datasets: [{ label: "Notas", data: counts, tension: 0.25 }] },
            options: { responsive: true, plugins: { legend: { display: false } } },
          });

          // tabela empresas
          const empMap = new Map();
          notas.forEach((n) => {
            const nome = n.Company?.name || "—";
            const obj =
              empMap.get(nome) || { empresa: nome, total_notas: 0, soma_valor_total: 0 };
            obj.total_notas += 1;
            obj.soma_valor_total += Number(n.total_amount || 0);
            empMap.set(nome, obj);
          });

          const empBody = document.getElementById("relClienteEmpresasBody");
          const empRows = Array.from(empMap.values())
            .sort((a, b) => b.soma_valor_total - a.soma_valor_total)
            .map(
              (e) => `
                <tr>
                  <td>${e.empresa}</td>
                  <td>${e.total_notas}</td>
                  <td>${formatCurrencyBRL(e.soma_valor_total)}</td>
                </tr>`
            )
            .join("");
          empBody.innerHTML = empRows;

          // tabela notas
          const notasBody = document.getElementById("relClienteNotasBody");
          const notasRows = notas
            .map(
              (n) => `
              <tr>
                <td>${n.id}</td>
                <td>${n.issued_at ? new Date(n.issued_at).toLocaleString("pt-BR") : "—"}</td>
                <td>${n.Company?.name || "—"}</td>
                <td>${formatCurrencyBRL(n.total_amount)}</td>
                <td>${formatCurrencyBRL(n.fee_value)}</td>
                <td>${n.status}</td>
              </tr>`
            )
            .join("");
          notasBody.innerHTML = notasRows;

        } catch (err) {
          console.error("Erro relatório por cliente:", err);
          // NÃO MOSTRA ALERTA — só loga
        }
      }




      // RELATÓRIO POR EMPRESA
      // RELATÓRIO POR EMPRESA (versão corrigida)
      async function loadRelatorioPorEmpresa() {
        const select = document.getElementById("relEmpresaSelect");
        const id = select.value;

        // Se nenhuma empresa foi selecionada, apenas sai
        if (!id) return;

        const start = document.getElementById("relEmpresaDataIni").value;
        const end = document.getElementById("relEmpresaDataFim").value;

        const params = new URLSearchParams();
        if (start) params.append("start", start);
        if (end) params.append("end", end);

        try {
          const data = await apiFetch(`/api/reports/empresa/${id}?` + params.toString());

          const empresa = data.empresa;
          const totais = data.totais || {};
          const notas = data.notas || [];

          document.getElementById("relEmpresaNome").textContent =
            empresa?.name || "—";
          document.getElementById("relEmpresaCnpj").textContent =
            `CNPJ: ${empresa?.cnpj || "—"}`;

          document.getElementById("relEmpresaTotalNotas").textContent =
            totais.total_notas || 0;
          document.getElementById("relEmpresaValorTotal").textContent =
            formatCurrencyBRL(totais.soma_valor_total || 0);

          // Gráfico da empresa
          const { labels, counts } = groupByDateForChart(notas);
          if (chartRelEmpresaPeriodo) chartRelEmpresaPeriodo.destroy();

          const ctx = document
            .getElementById("chartRelEmpresaPeriodo")
            .getContext("2d");

          chartRelEmpresaPeriodo = new Chart(ctx, {
            type: "bar",
            data: {
              labels,
              datasets: [
                {
                  label: "Notas",
                  data: counts,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: { beginAtZero: true },
              },
            },
          });

          // Tabela de clientes atendidos pela empresa
          const cliMap = new Map();
          notas.forEach((n) => {
            const nome = n.Customer?.name || "—";
            const obj = cliMap.get(nome) || {
              cliente: nome,
              total_notas: 0,
              soma_valor_total: 0,
            };
            obj.total_notas += 1;
            obj.soma_valor_total += Number(n.total_amount || 0);
            cliMap.set(nome, obj);
          });

          const cliBody = document.getElementById("relEmpresaClientesBody");
          const cliRows = Array.from(cliMap.values())
            .sort((a, b) => b.soma_valor_total - a.soma_valor_total)
            .map(
              (c) => `
                <tr>
                  <td>${c.cliente}</td>
                  <td>${c.total_notas}</td>
                  <td>${formatCurrencyBRL(c.soma_valor_total)}</td>
                </tr>
              `
            )
            .join("");
          cliBody.innerHTML = cliRows;

          // Tabela de notas da empresa
          const notasBody = document.getElementById("relEmpresaNotasBody");
          const notasRows = notas
            .map(
              (n) => `
              <tr>
                <td>${n.id}</td>
                <td>${n.issued_at ? new Date(n.issued_at).toLocaleString("pt-BR") : "—"}</td>
                <td>${n.Customer?.name || "—"}</td>
                <td>${formatCurrencyBRL(n.total_amount)}</td>
                <td>${formatCurrencyBRL(n.fee_value)}</td>
                <td>${n.status}</td>
              </tr>
            `
            )
            .join("");
          notasBody.innerHTML = notasRows;

        } catch (err) {
          console.error("Erro relatório por empresa:", err);
          // Não usamos alert(), para não causar erro visual
        }
      }



      // ==========================
      // CLIENTES
      // ==========================
      let clientes = [];
      let editingClienteId = null;

      async function loadClientes() {
        try {
          clientes = await apiFetch("/api/customers");
          renderClientes();
          return clientes;
        } catch (err) {
          console.error("Erro ao carregar clientes:", err);
          return [];
        }
      }

      function renderClientes() {
        const tbody = document.getElementById("clientesTableBody");
        tbody.innerHTML = "";

        const searchRaw = document
          .getElementById("clienteSearch")
          .value;
        const search = normalizeText(searchRaw);
        const searchDigits = onlyDigits(searchRaw);
        const feeMin = parseFloat(
          document.getElementById("clienteFeeMin").value
        );
        const feeMax = parseFloat(
          document.getElementById("clienteFeeMax").value
        );
        const ativoChip = document.querySelector(
          '.chip-filter[data-cliente-ativo].active'
        );
        const ativoFilter = ativoChip ? ativoChip.dataset.clienteAtivo : "all";

        clientes
          .filter((c) => {
            if (
              search &&
              !(
                normalizeText(c.name).includes(search) ||
                normalizeText(c.whatsapp_number).includes(search) ||
                (searchDigits && onlyDigits(c.whatsapp_number).includes(searchDigits))
              )
            )
              return false;

            if (!isNaN(feeMin) && parseFloat(c.fee_percent) < feeMin) return false;
            if (!isNaN(feeMax) && parseFloat(c.fee_percent) > feeMax) return false;

            if (ativoFilter === "true" && !c.is_active) return false;
            if (ativoFilter === "false" && c.is_active) return false;

            return true;
          })
          .forEach((c) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>${c.id}</td>
              <td>${c.name}</td>
              <td>${c.whatsapp_number}</td>
              <td>${Number(c.fee_percent).toFixed(2)}%</td>
              <td>
                <span class="tag ${
                  c.is_active ? "tag-success" : "tag-muted"
                }">${c.is_active ? "Ativo" : "Inativo"}</span>
              </td>
              <td>${c.created_at ? new Date(c.created_at).toLocaleString("pt-BR") : "—"}</td>
              <td>
                <button class="btn-ghost" data-edit-cliente="${c.id}">Editar</button>
                <button class="btn-danger" data-del-cliente="${c.id}">Excluir</button>
              </td>
            `;
            tbody.appendChild(tr);
          });
      }

      function openClienteForm(cliente) {
        document.getElementById("clienteFormWrapper").style.display = "block";
        document.getElementById("clienteFormError").style.display = "none";

        if (cliente) {
          editingClienteId = cliente.id;
          document.getElementById("clienteNome").value = cliente.name;
          document.getElementById("clienteWhats").value =
            cliente.whatsapp_number;
          document.getElementById("clienteTaxa").value = cliente.fee_percent;
          document.getElementById("clienteAtivo").value = cliente.is_active
            ? "true"
            : "false";
          document.getElementById("clienteUsaNF").checked = cliente.uses_nf !== false;
          document.getElementById("clienteUsaPOS").checked = cliente.uses_pos !== false;
        } else {
          editingClienteId = null;
          document.getElementById("clienteNome").value = "";
          document.getElementById("clienteWhats").value = "";
          document.getElementById("clienteTaxa").value = "";
          document.getElementById("clienteAtivo").value = "true";
          document.getElementById("clienteUsaNF").checked = true;
          document.getElementById("clienteUsaPOS").checked = false;
        }
      }

      function closeClienteForm() {
        document.getElementById("clienteFormWrapper").style.display = "none";
        editingClienteId = null;
      }

      async function saveCliente() {
        const nome = document.getElementById("clienteNome").value.trim();
        const whats = document.getElementById("clienteWhats").value.trim();
        const taxa = document.getElementById("clienteTaxa").value.trim();
        const ativo = document.getElementById("clienteAtivo").value === "true";
        const usaNF = document.getElementById("clienteUsaNF").checked;
        const usaPOS = document.getElementById("clienteUsaPOS").checked;
        const errEl = document.getElementById("clienteFormError");

        errEl.style.display = "none";

        if (!nome || !whats || taxa === "") {
          errEl.textContent = "Preencha todos os campos obrigatórios.";
          errEl.style.display = "block";
          return;
        }

        const payload = {
          name: nome,
          whatsapp_number: whats,
          fee_percent: parseFloat(taxa),
          is_active: ativo,
          uses_nf: usaNF,
          uses_pos: usaPOS,
        };

        try {
          if (editingClienteId) {
            await apiFetch("/api/customers/" + editingClienteId, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            await apiFetch("/api/customers", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
          closeClienteForm();
          const list = await loadClientes();
          await loadPosClientes();
          populateRelatorioSelects(list, empresas);
        } catch (err) {
          console.error(err);
          errEl.textContent = "Erro ao salvar cliente.";
          if (String(err.message).includes("WhatsApp")) {
            errEl.textContent =
              "Já existe um cliente com esse número de WhatsApp.";
          }
          errEl.style.display = "block";
        }
      }

      async function deleteCliente(id) {
        if (!confirm("Deseja realmente excluir este cliente?")) return;
        try {
          await apiFetch("/api/customers/" + id, { method: "DELETE" });
          const list = await loadClientes();
          await loadPosClientes();
          populateRelatorioSelects(list, empresas);
        } catch (err) {
          console.error(err);
          alert("Erro ao excluir cliente.");
        }
      }

      // ==========================
      // EMPRESAS
      // ==========================
      let empresas = [];
      let editingEmpresaId = null;

      async function loadEmpresas() {
        try {
          empresas = await apiFetch("/api/companies");
          renderEmpresas();
          return empresas;
        } catch (err) {
          console.error("Erro ao carregar empresas:", err);
          return [];
        }
      }

      function renderEmpresas() {
        const tbody = document.getElementById("empresasTableBody");
        tbody.innerHTML = "";

        const searchRaw = document.getElementById("empresaSearch").value;
        const search = normalizeText(searchRaw);
        const searchDigits = onlyDigits(searchRaw);
        const ativoChip = document.querySelector(
          '.chip-filter[data-empresa-ativo].active'
        );
        const ativoFilter = ativoChip ? ativoChip.dataset.empresaAtivo : "all";

        empresas
          .filter((e) => {
            if (
              search &&
              !(
                normalizeText(e.name).includes(search) ||
                (searchDigits && onlyDigits(e.cnpj).includes(searchDigits))
              )
            )
              return false;
            if (ativoFilter === "true" && !e.is_active) return false;
            if (ativoFilter === "false" && e.is_active) return false;
            return true;
          })
          .forEach((e) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>${e.id}</td>
              <td>${e.name}</td>
              <td>${formatCNPJ(e.cnpj)}</td>
              <td>
                <span class="tag ${
                  e.is_active ? "tag-success" : "tag-muted"
                }">${e.is_active ? "Ativa" : "Inativa"}</span>
              </td>
              <td>${e.created_at ? new Date(e.created_at).toLocaleString("pt-BR") : "—"}</td>
              <td>
                <button class="btn-ghost" data-edit-empresa="${e.id}">Editar</button>
                <button class="btn-danger" data-del-empresa="${e.id}">Excluir</button>
              </td>
            `;
            tbody.appendChild(tr);
          });
      }

      function openEmpresaForm(empresa) {
        document.getElementById("empresaFormWrapper").style.display = "block";
        document.getElementById("empresaFormError").style.display = "none";

        if (empresa) {
          editingEmpresaId = empresa.id;
          document.getElementById("empresaNome").value = empresa.name;
          document.getElementById("empresaCnpj").value = empresa.cnpj;
          document.getElementById("empresaChave").value = empresa.access_key;
          document.getElementById("empresaAtiva").value = empresa.is_active
            ? "true"
            : "false";
        } else {
          editingEmpresaId = null;
          document.getElementById("empresaNome").value = "";
          document.getElementById("empresaCnpj").value = "";
          document.getElementById("empresaChave").value = "";
          document.getElementById("empresaAtiva").value = "true";
        }
      }

      function closeEmpresaForm() {
        document.getElementById("empresaFormWrapper").style.display = "none";
        editingEmpresaId = null;
      }

      async function saveEmpresa() {
        const nome = document.getElementById("empresaNome").value.trim();
        const cnpj = document.getElementById("empresaCnpj").value.trim();
        const chave = document.getElementById("empresaChave").value.trim();
        const ativa = document.getElementById("empresaAtiva").value === "true";
        const errEl = document.getElementById("empresaFormError");

        errEl.style.display = "none";

        if (!nome || !cnpj || !chave) {
          errEl.textContent = "Preencha todos os campos obrigatórios.";
          errEl.style.display = "block";
          return;
        }

        const payload = {
          name: nome,
          cnpj,
          access_key: chave,
          is_active: ativa,
        };

        try {
          if (editingEmpresaId) {
            await apiFetch("/api/companies/" + editingEmpresaId, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            await apiFetch("/api/companies", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
          closeEmpresaForm();
          const list = await loadEmpresas();
          populateRelatorioSelects(clientes, list);
        } catch (err) {
          console.error(err);
          errEl.textContent = "Erro ao salvar empresa.";
          if (String(err.message).includes("CNPJ")) {
            errEl.textContent = "Já existe uma empresa com esse CNPJ.";
          }
          errEl.style.display = "block";
        }
      }

      async function deleteEmpresa(id) {
        if (!confirm("Deseja realmente excluir esta empresa?")) return;
        try {
          await apiFetch("/api/companies/" + id, { method: "DELETE" });
          const list = await loadEmpresas();
          populateRelatorioSelects(clientes, list);
        } catch (err) {
          console.error(err);
          alert("Erro ao excluir empresa.");
        }
      }

      // ==========================
      // NOTAS - SCROLL INFINITO
      // ==========================
      const notasState = {
        page: 1,
        limit: 50,
        loading: false,
        hasMore: true,
        observer: null,
        lastFiltersKey: "",
        allLoaded: [],
      };

      function resetNotasInfiniteScroll() {
        notasState.page = 1;
        notasState.loading = false;
        notasState.hasMore = true;
        notasState.allLoaded = [];
        document.getElementById("notasTableBody").innerHTML = "";
        document.getElementById("notasLoaderText").textContent =
          "Rolando para carregar mais…";
      }

      function getNotasFiltersKey() {
        const search = document.getElementById("notasSearch").value.trim();
        const status = document.getElementById("notasStatusFilter").value;
        const origem = document.getElementById("notasOrigemFilter").value;
        const d1 = document.getElementById("notasDataIni").value;
        const d2 = document.getElementById("notasDataFim").value;
        return JSON.stringify({ search, status, origem, d1, d2 });
      }

      async function loadNotasPage(resetIfFiltersChanged) {
        if (notasState.loading || !notasState.hasMore) return;

        const currentKey = getNotasFiltersKey();
        if (resetIfFiltersChanged && notasState.lastFiltersKey !== currentKey) {
          resetNotasInfiniteScroll();
          notasState.lastFiltersKey = currentKey;
        }

        notasState.loading = true;
        document.getElementById("notasLoaderText").textContent =
          "Carregando notas...";

        try {
          const params = new URLSearchParams();
          params.append("page", notasState.page.toString());
          params.append("limit", notasState.limit.toString());

          const res = await apiFetch("/api/invoices?" + params.toString());
          const { data, pagination } = res;

          notasState.allLoaded = notasState.allLoaded.concat(data || []);
          renderNotas();

          notasState.page += 1;
          notasState.hasMore =
            pagination && notasState.page <= pagination.pages;

          if (!notasState.hasMore) {
            document.getElementById("notasLoaderText").textContent =
              "Não há mais notas para carregar.";
          } else {
            document.getElementById("notasLoaderText").textContent =
              "Rolando para carregar mais…";
          }
        } catch (err) {
          console.error("Erro ao carregar notas:", err);
          document.getElementById("notasLoaderText").textContent =
            "Erro ao carregar notas.";
        } finally {
          notasState.loading = false;
        }
      }

      function renderNotas() {
        const tbody = document.getElementById("notasTableBody");
        tbody.innerHTML = "";

        const searchRaw = document.getElementById("notasSearch").value;
        const search = searchRaw.toLowerCase();
        const searchDigits = searchRaw.replace(/\D/g, "");
        const statusFilter = document.getElementById("notasStatusFilter").value;
        const origemFilter = document.getElementById("notasOrigemFilter").value;
        const dIni = document.getElementById("notasDataIni").value;
        const dFim = document.getElementById("notasDataFim").value;

        notasState.allLoaded
          .filter((n) => {
            const cliente = n.Customer?.name?.toLowerCase() || "";
            const empresa = n.Company?.name?.toLowerCase() || "";
            const comprador = n.buyer_name?.toLowerCase() || "";
            const cpfComprador = n.buyer_cpf?.toLowerCase() || "";
            const cpfDigits = (n.buyer_cpf || "").replace(/\D/g, "");

            if (
              search &&
              !(
                cliente.includes(search) ||
                empresa.includes(search) ||
                comprador.includes(search) ||
                cpfComprador.includes(search) ||
                (searchDigits && cpfDigits.includes(searchDigits))
              )
            )
              return false;

            if (statusFilter !== "all" && n.status !== statusFilter)
              return false;

            if (origemFilter === "terminal" && !n.is_terminal_sale) return false;
            if (origemFilter === "manual" && n.is_terminal_sale) return false;

            if (dIni) {
              if (
                !n.issued_at ||
                new Date(n.issued_at) < new Date(dIni + "T00:00:00")
              )
                return false;
            }

            if (dFim) {
              if (
                !n.issued_at ||
                new Date(n.issued_at) > new Date(dFim + "T23:59:59")
              )
                return false;
            }

            return true;
          })
          .forEach((n) => {
            const tr = document.createElement("tr");
            const dt = n.issued_at
              ? new Date(n.issued_at).toLocaleString("pt-BR")
              : "—";
            const origem = n.is_terminal_sale ? "Maquininha" : "Manual";
            const nfLink = n.nf_link
              ? `<a href="${n.nf_link}" target="_blank" rel="noopener noreferrer">Download</a>`
              : "—";
            const statusClass =
              n.status === "PAGA"
                ? "status-paga"
                : n.status === "CANCELADA"
                ? "status-cancelada"
                : "status-emitida";

            tr.innerHTML = `
              <td>${n.id}</td>
              <td>${dt}</td>
              <td>${n.Customer?.name || "—"}</td>
              <td>${n.Company?.name || "—"}</td>
              <td>${n.buyer_name || "—"}</td>
              <td>${n.buyer_cpf || "—"}</td>
              <td>${formatCurrencyBRL(n.total_amount)}</td>
              <td>${n.paid_amount ? formatCurrencyBRL(n.paid_amount) : "—"}</td>
              <td>${Number(n.fee_percent).toFixed(2)}%</td>
              <td>${formatCurrencyBRL(n.fee_value)}</td>
              <td>${origem}</td>
              <td>${n.terminal_id || "—"}</td>
              <td>${n.nsu || "—"}</td>
              <td>${nfLink}</td>
              <td><span class="status-pill ${statusClass}">${n.status}</span></td>
            `;
            tbody.appendChild(tr);
          });
      }

      function setupNotasInfiniteScroll() {
        const sentinel = document.getElementById("notasLoaderRow");
        if (!sentinel) return;

        if (notasState.observer) {
          notasState.observer.disconnect();
        }

        notasState.observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (
              entry.isIntersecting &&
              document
                .getElementById("page-notas")
                .classList.contains("active")
            ) {
              loadNotasPage(false);
            }
          });
        });

        notasState.observer.observe(sentinel);
      }

      // ==========================
      // MAQUININHAS (POS)
      // ==========================
  let posCompanies = [];
  let posTerminals = [];
  let posVendasRecentes = [];
  let posClientes = [];
  let editingPosCompanyId = null;
      let editingPosTerminalId = null;
      let editingPosClienteId = null;
      let editingPosVendaId = null;
      let posResumoList = [];
  let posResumoTotals = {
    bruto: 0,
    taxas: 0,
    liquido: 0,
    bruto_pago: 0,
    liquido_pago: 0,
    bruto_a_pagar: 0,
    liquido_a_pagar: 0,
  };
  let posSaleModalData = null;

      async function loadPosCompanies() {
        try {
          posCompanies = await apiFetch("/api/pos/companies");
          renderPosCompanies();
          fillPosSelects();
        } catch (err) {
          console.error("Erro ao carregar empresas POS:", err);
        }
      }

      async function addPosCompany() {
        const name = document.getElementById("posCompanyName").value.trim();
        const cnpj = document.getElementById("posCompanyCnpj").value.trim();
        const is_active = document.getElementById("posCompanyAtiva").value === "true";
        if (!name || !cnpj) return alert("Informe nome e CNPJ");
        try {
          const payload = { name, cnpj, is_active };
          if (editingPosCompanyId) {
            await apiFetch(`/api/pos/companies/${editingPosCompanyId}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            await apiFetch("/api/pos/companies", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
          await loadPosCompanies();
          resetPosCompanyForm();
        } catch (err) {
          alert("Erro ao cadastrar empresa POS");
          console.error(err);
        }
      }

      function resetPosCompanyForm() {
        editingPosCompanyId = null;
        const nameInput = document.getElementById("posCompanyName");
        const cnpjInput = document.getElementById("posCompanyCnpj");
        const ativoSel = document.getElementById("posCompanyAtiva");
        if (nameInput) nameInput.value = "";
        if (cnpjInput) cnpjInput.value = "";
        if (ativoSel) ativoSel.value = "true";
        document.getElementById("btnPosAddCompany").textContent = "Salvar empresa";
      }

      function startEditPosCompany(id) {
        const company = posCompanies.find((c) => c.id == id);
        if (!company) return;
        editingPosCompanyId = company.id;
        document.getElementById("posCompanyName").value = company.name || "";
        document.getElementById("posCompanyCnpj").value = company.cnpj || "";
        document.getElementById("posCompanyAtiva").value = company.is_active ? "true" : "false";
        document.getElementById("btnPosAddCompany").textContent = "Atualizar empresa";
      }

      async function deletePosCompany(id) {
        if (!confirm("Excluir esta empresa de POS?")) return;
        try {
          await apiFetch(`/api/pos/companies/${id}`, { method: "DELETE" });
          await loadPosCompanies();
          resetPosCompanyForm();
        } catch (err) {
          alert("Erro ao excluir empresa POS");
          console.error(err);
        }
      }

      function renderPosCompanies() {
        const tbody = document.getElementById("posCompaniesTableBody");
        if (!tbody) return;
        const searchRaw = document.getElementById("posCompanySearch")?.value || "";
        const term = normalizeText(searchRaw);
        const digits = onlyDigits(searchRaw);
        const list = (posCompanies || []).filter((c) => {
          if (!term && !digits) return true;
          const name = normalizeText(c.name);
          const cnpjDigits = onlyDigits(c.cnpj);
          return name.includes(term) || (digits && cnpjDigits.includes(digits));
        });

        tbody.innerHTML = list
          .map((c) => `
            <tr>
              <td>${c.id}</td>
              <td>${c.name}</td>
              <td>${formatCNPJ(c.cnpj)}</td>
              <td>${c.is_active ? "Ativa" : "Inativa"}</td>
              <td>
                <button class="btn-ghost" data-edit-pos-company="${c.id}">Editar</button>
                <button class="btn-danger" data-del-pos-company="${c.id}">Excluir</button>
              </td>
            </tr>
          `)
          .join("");
      }

      async function loadPosTerminals() {
        try {
          posTerminals = await apiFetch("/api/pos/terminals");
          renderPosTerminals();
          fillPosSelects();
        } catch (err) {
          console.error("Erro ao carregar terminais:", err);
        }
      }

      async function addPosTerminal() {
        const pos_company_id = document.getElementById("posTerminalEmpresa").value;
        const customer_id = document.getElementById("posTerminalCliente").value;
        const terminal_code = document.getElementById("posTerminalCode").value.trim();
        const is_active = document.getElementById("posTerminalAtivo").value === "true";
        if (!pos_company_id || !customer_id || !terminal_code) return alert("Preencha empresa, cliente e código");
        try {
          const payload = { pos_company_id, customer_id, terminal_code, is_active };
          if (editingPosTerminalId) {
            await apiFetch(`/api/pos/terminals/${editingPosTerminalId}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            await apiFetch("/api/pos/terminals", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
          await loadPosTerminals();
          resetPosTerminalForm();
        } catch (err) {
          alert("Erro ao cadastrar terminal");
          console.error(err);
        }
      }

      function resetPosTerminalForm() {
        editingPosTerminalId = null;
        document.getElementById("posTerminalEmpresa").value = "";
        document.getElementById("posTerminalCliente").value = "";
        document.getElementById("posTerminalCode").value = "";
        document.getElementById("posTerminalAtivo").value = "true";
        document.getElementById("btnPosAddTerminal").textContent = "Salvar terminal";
      }

      function startEditPosTerminal(id) {
        const t = posTerminals.find((x) => x.id == id);
        if (!t) return;
        editingPosTerminalId = t.id;
        document.getElementById("posTerminalEmpresa").value = t.pos_company_id || "";
        document.getElementById("posTerminalCliente").value = t.customer_id || "";
        document.getElementById("posTerminalCode").value = t.terminal_code || "";
        document.getElementById("posTerminalAtivo").value = t.is_active ? "true" : "false";
        document.getElementById("btnPosAddTerminal").textContent = "Atualizar terminal";
      }

      async function deletePosTerminal(id) {
        if (!confirm("Excluir este terminal?")) return;
        try {
          await apiFetch(`/api/pos/terminals/${id}`, { method: "DELETE" });
          await loadPosTerminals();
          resetPosTerminalForm();
        } catch (err) {
          alert("Erro ao excluir terminal");
          console.error(err);
        }
      }

      function renderPosTerminals() {
        const tbody = document.getElementById("posTerminalsTableBody");
        if (!tbody) return;
        const searchRaw = document.getElementById("posTerminalSearch")?.value || "";
        const term = normalizeText(searchRaw);
        const digits = onlyDigits(searchRaw);
        const list = (posTerminals || []).filter((t) => {
          if (!term && !digits) return true;
          const terminalCode = normalizeText(t.terminal_code);
          const company = normalizeText(t.PosCompany?.name);
          const customer = normalizeText(t.Customer?.name);
          const cnpjDigits = onlyDigits(t.PosCompany?.cnpj);
          return (
            terminalCode.includes(term) ||
            company.includes(term) ||
            customer.includes(term) ||
            (digits && (cnpjDigits.includes(digits) || onlyDigits(t.terminal_code).includes(digits)))
          );
        });

        tbody.innerHTML = list
          .map((t) => {
            const rate = posClientes.find((c) => c.id === t.customer_id)?.PosRate || {};
            return `
            <tr>
              <td>${t.id}</td>
              <td>${t.terminal_code}</td>
              <td>${t.PosCompany?.name || "—"}</td>
              <td>${t.Customer?.name || "—"}</td>
              <td>${t.is_active ? "Ativo" : "Inativo"}</td>
              <td>${Number(rate.debit_percent || 0).toFixed(2)}%</td>
              <td>${Number(rate.credit_avista_percent || 0).toFixed(2)}%</td>
              <td>${Number(rate.credit_2a6_percent || 0).toFixed(2)}%</td>
              <td>${Number(rate.credit_7a12_percent || 0).toFixed(2)}%</td>
              <td>${rate.pix_key || "—"}</td>
              <td>
                <button class="btn-ghost" data-edit-pos-terminal="${t.id}">Editar</button>
                <button class="btn-danger" data-del-pos-terminal="${t.id}">Excluir</button>
              </td>
            </tr>
          `;
          })
          .join("");
      }

      function fillPosSelects() {
        const selEmp = document.getElementById("posTerminalEmpresa");
        const selCli = document.getElementById("posTerminalCliente");
        const selRateCli = document.getElementById("posRateCliente");
        const selVendaTerm = document.getElementById("posVendaTerminal");
        const selResumoTerm = document.getElementById("posResumoTerminal");
        if (selEmp) {
          selEmp.innerHTML =
            '<option value="">Selecione</option>' +
            (posCompanies || [])
              .map((c) => `<option value="${c.id}">${c.name}${c.cnpj ? " - " + formatCNPJ(c.cnpj) : ""}</option>`)
              .join("");
        }
        if (selCli) {
          selCli.innerHTML =
            '<option value="">Selecione</option>' +
            (posClientes || [])
              .map((c) => `<option value="${c.id}">${c.name}${c.whatsapp_number ? " (" + c.whatsapp_number + ")" : ""}</option>`)
              .join("");
        }
        if (selRateCli) selRateCli.innerHTML = selCli ? selCli.innerHTML : "";
        if (selVendaTerm) {
          selVendaTerm.innerHTML =
            '<option value="">Selecione</option>' +
            (posTerminals || [])
              .map(
                (t) => `<option value="${t.id}">${t.Customer?.name || "Cliente"} - ${t.terminal_code}</option>`
              )
              .join("");
        }
        if (selResumoTerm) {
          selResumoTerm.innerHTML =
            '<option value="">Todos</option>' +
            (posTerminals || [])
              .map((t) => `<option value="${t.id}">${t.Customer?.name || "Cliente"} - ${t.terminal_code}</option>`)
              .join("");
        }
      }

      async function loadPosRateForSelected() {
        const cid = document.getElementById("posRateCliente").value;
        if (!cid) return;
        try {
          const rate = await apiFetch(`/api/pos/rates/${cid}`);
          document.getElementById("posRatePix").value = rate?.pix_key || "";
          document.getElementById("posRateDebito").value = rate?.debit_percent || "";
          document.getElementById("posRateCreditoAVista").value = rate?.credit_avista_percent || "";
          document.getElementById("posRateCredito2a6").value = rate?.credit_2a6_percent || "";
          document.getElementById("posRateCredito7a12").value = rate?.credit_7a12_percent || "";
        } catch (err) {
          console.error("Erro ao carregar taxa:", err);
        }
      }

      async function savePosRates() {
        const cid = document.getElementById("posRateCliente").value;
        if (!cid) return alert("Selecione um cliente");
        const payload = {
          pix_key: document.getElementById("posRatePix").value.trim(),
          debit_percent: Number(document.getElementById("posRateDebito").value || 0),
          credit_avista_percent: Number(document.getElementById("posRateCreditoAVista").value || 0),
          credit_2a6_percent: Number(document.getElementById("posRateCredito2a6").value || 0),
          credit_7a12_percent: Number(document.getElementById("posRateCredito7a12").value || 0),
        };
        try {
          await apiFetch(`/api/pos/rates/${cid}`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          alert("Taxas salvas");
        } catch (err) {
          alert("Erro ao salvar taxas");
          console.error(err);
        }
      }

      async function registrarVendaPos() {
        const pos_terminal_id = document.getElementById("posVendaTerminal").value;
        const sale_datetime = document.getElementById("posVendaData").value;
        const amount = document.getElementById("posVendaValor").value;
        const payment_type = document.getElementById("posVendaForma").value;
        const nsu = document.getElementById("posVendaNsu").value.trim();
        if (!pos_terminal_id || !sale_datetime || !amount || !nsu) return alert("Preencha terminal, data, valor e NSU");
        try {
          const payload = { pos_terminal_id, sale_datetime, amount, payment_type, nsu };
          if (editingPosVendaId) {
            await apiFetch(`/api/pos/sales/${editingPosVendaId}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            await apiFetch("/api/pos/sales", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          }
          document.getElementById("posVendaMsg").textContent = editingPosVendaId ? "Venda atualizada" : "Venda registrada";
          document.getElementById("posVendaMsg").style.display = "block";
          await loadPosVendasRecentes();
          await loadPosResumo();
          resetPosVendaForm();
        } catch (err) {
          alert("Erro ao registrar venda");
          console.error(err);
        }
      }

      async function loadPosVendasRecentes() {
        try {
          const res = await apiFetch("/api/pos/sales?page=1&limit=50");
          posVendasRecentes = res.data || [];
          renderPosVendas();
        } catch (err) {
          console.error("Erro ao carregar vendas:", err);
        }
      }

  async function loadPosResumo() {
    try {
      const start = document.getElementById("posResumoIni").value;
      const end = document.getElementById("posResumoFim").value;
      const pos_terminal_id = document.getElementById("posResumoTerminal").value;
      const only_unpaid = document.getElementById("posResumoOnlyUnpaid").checked;

      const params = new URLSearchParams();
      if (start) params.append("start", start);
      if (end) params.append("end", end);
      if (pos_terminal_id) params.append("pos_terminal_id", pos_terminal_id);
      if (only_unpaid) params.append("only_unpaid", "true");

      const res = await apiFetch(`/api/pos/reports/payouts?${params.toString()}`);
      posResumoList = res.list || [];
      posResumoTotals = res.totals || posResumoTotals;

      document.getElementById("posResumoBruto").textContent = formatCurrencyBRL(posResumoTotals.bruto);
      document.getElementById("posResumoTaxas").textContent = formatCurrencyBRL(posResumoTotals.taxas);
      document.getElementById("posResumoLiquido").textContent = formatCurrencyBRL(posResumoTotals.liquido);
      document.getElementById("posResumoAPagar").textContent = formatCurrencyBRL(posResumoTotals.liquido_a_pagar);
      document.getElementById("posResumoPago").textContent = formatCurrencyBRL(posResumoTotals.liquido_pago);

      const top = res.topTerminal;
      const topSum = Number(top?.dataValues?.soma ?? top?.soma ?? 0);
      document.getElementById("posResumoTopTerminal").textContent = top
        ? `${top.PosTerminal?.terminal_code || "?"} - ${formatCurrencyBRL(topSum || 0)}`
        : "—";
      document.getElementById("posResumoTopTerminalOwner").textContent = top
        ? `Proprietário: ${top.PosTerminal?.Customer?.name || "—"}`
        : "";

      const mv = res.maiorVendaPeriodo;
      document.getElementById("posResumoMaiorVenda").textContent = mv
        ? formatCurrencyBRL(mv.amount)
        : "—";
      document.getElementById("posResumoMaiorVendaInfo").textContent = mv
        ? `${mv.PosTerminal?.terminal_code || "?"} - ${mv.Customer?.name || "?"}`
        : "";

      renderPosResumoTabela();

      const selResumoTerm = document.getElementById("posResumoTerminal");
      if (selResumoTerm) {
        const onlyUnpaid = document.getElementById("posResumoOnlyUnpaid").checked;
        const current = selResumoTerm.value;
        const idsSet = onlyUnpaid
          ? Array.from(new Set(posResumoList.filter((s) => !s.paid).map((s) => s.pos_terminal_id)))
          : posTerminals.map((t) => t.id);
        selResumoTerm.innerHTML =
          '<option value="">Todos</option>' +
          posTerminals
            .filter((t) => idsSet.includes(t.id))
            .map((t) => `<option value="${t.id}">${t.Customer?.name || "Cliente"} - ${t.terminal_code}</option>`)
            .join("");
        if (idsSet.includes(Number(current))) {
          selResumoTerm.value = current;
        } else {
          selResumoTerm.value = "";
        }
      }
    } catch (err) {
      console.error("Erro ao carregar resumo POS:", err);
    }
  }

  function renderPosResumoTabela() {
    const tbody = document.getElementById("posResumoTabela");
    if (!tbody) return;
    const only_unpaid = document.getElementById("posResumoOnlyUnpaid").checked;
    const rows = posResumoList
      .filter((s) => (!only_unpaid ? true : !s.paid))
      .map(
        (s) => `
      <tr>
        <td><input type="checkbox" data-sale-id="${s.id}" class="posResumoCheck" ${s.paid ? "disabled" : ""}></td>
        <td>${s.sale_datetime ? new Date(s.sale_datetime).toLocaleString("pt-BR") : "—"}</td>
        <td>${s.PosTerminal?.terminal_code || "—"}</td>
        <td>${s.Customer?.name || "—"}</td>
        <td>${formatCurrencyBRL(s.amount)}</td>
        <td>${formatCurrencyBRL(s.fee_value)} (${Number(s.fee_percent || 0).toFixed(2)}%)</td>
        <td>${formatCurrencyBRL(s.net_amount)}</td>
        <td>
          <span class="tag ${s.paid ? "tag-success" : "tag-danger"}">
            ${s.paid ? "Pago" : "A pagar"}
          </span>
        </td>
        <td><button class="btn-ghost" data-view-sale="${s.id}">Ver</button></td>
      </tr>`
      )
      .join("");
    tbody.innerHTML = rows;
    const selectAll = document.getElementById("posResumoSelectAll");
    if (selectAll) selectAll.checked = false;
    updateResumoSelecionados();
  }

  function updateResumoSelecionados() {
    const checks = Array.from(document.querySelectorAll(".posResumoCheck:checked")).map((c) =>
      Number(c.getAttribute("data-sale-id"))
    );
    const selectedSales = posResumoList.filter((s) => checks.includes(s.id));
    const uniqueTerminals = new Set(selectedSales.map((s) => s.pos_terminal_id));
    const uniqueCustomers = new Set(selectedSales.map((s) => s.customer_id));
    const btn = document.getElementById("btnPosMarcarPago");
    const msg = document.getElementById("posResumoSelectMsg");
    const totalEl = document.getElementById("posResumoTotalSelecionado");
    const pixEl = document.getElementById("posResumoPix");

    const total = selectedSales.reduce((acc, s) => acc + Number(s.net_amount || 0), 0);
    if (totalEl) totalEl.textContent = formatCurrencyBRL(total);

    if (uniqueCustomers.size > 1) {
      if (btn) btn.disabled = false;
      if (msg) msg.textContent = "Clientes diferentes selecionados: confirme antes de pagar.";
    } else {
      if (btn) btn.disabled = false;
      if (msg) msg.textContent = "";
    }

    const first = selectedSales[0];
    if (first) {
      const cli = posClientes.find((c) => c.id === first.customer_id);
      if (pixEl) pixEl.textContent = cli?.PosRate?.pix_key || "—";
    } else {
      if (pixEl) pixEl.textContent = "—";
    }
  }

  async function marcarPosPagas() {
    const checks = Array.from(document.querySelectorAll(".posResumoCheck:checked"))
      .map((c) => c.getAttribute("data-sale-id"));
    if (!checks.length) {
      alert("Selecione pelo menos uma venda a pagar.");
      return;
    }
    const start = document.getElementById("posResumoIni").value;
    const end = document.getElementById("posResumoFim").value;
    const pos_terminal_id = document.getElementById("posResumoTerminal").value;
    const payment_batch =
      document.getElementById("posResumoBatch").value.trim() || `fechamento-${Date.now()}`;
    const selectedSales = posResumoList.filter((s) => checks.includes(String(s.id)));
    const uniqueCustomers = new Set(selectedSales.map((s) => s.customer_id));
    if (uniqueCustomers.size > 1) {
      const sure = confirm("Existem clientes diferentes selecionados. Confirmar pagamento assim mesmo?");
      if (!sure) return;
    }
    try {
      await apiFetch("/api/pos/reports/payouts/mark-paid", {
        method: "POST",
        body: JSON.stringify({
          sale_ids: checks,
          start,
          end,
          pos_terminal_id,
          payment_batch,
        }),
      });
      await loadPosResumo();
      alert(`Vendas marcadas como pagas. Lote: ${payment_batch}`);
    } catch (err) {
      alert("Erro ao marcar como pago");
      console.error(err);
    }
  }

  function renderPosVendas() {
    const tbody = document.getElementById("posVendasTableBody");
    if (!tbody) return;
    const searchRaw = document.getElementById("posVendaTerminalSearch")?.value || "";
    const term = normalizeText(searchRaw);
        const digits = onlyDigits(searchRaw);
    const list = (posVendasRecentes || []).filter((v) => {
      const statusFilter = document.getElementById("posVendaStatusFilter")?.value || "all";
      if (statusFilter === "paid" && !v.paid) return false;
      if (statusFilter === "unpaid" && v.paid) return false;

      if (!term && !digits) return true;
      const cliente = normalizeText(v.Customer?.name);
      const terminal = normalizeText(v.PosTerminal?.terminal_code);
      const nsu = normalizeText(v.nsu);
      const termDigits = onlyDigits(v.PosTerminal?.terminal_code);
          return (
        cliente.includes(term) ||
        terminal.includes(term) ||
        nsu.includes(term) ||
        (digits && (termDigits.includes(digits) || onlyDigits(v.nsu).includes(digits)))
      );
    });
    updateVendaTerminalOptions(searchRaw);

    tbody.innerHTML = list
      .map((v) => {
        const dt = v.sale_datetime ? new Date(v.sale_datetime).toLocaleString("pt-BR") : "—";
        return `
          <tr>
            <td>${dt}</td>
            <td>${v.Customer?.name || "—"}</td>
            <td>${v.PosTerminal?.terminal_code || "—"}</td>
            <td>${v.payment_type}</td>
            <td>${Number(v.fee_percent || 0).toFixed(2)}%</td>
            <td>${formatCurrencyBRL(v.amount)}</td>
            <td>${formatCurrencyBRL(v.fee_value)}</td>
            <td>${formatCurrencyBRL(v.net_amount)}</td>
            <td><span class="tag ${v.paid ? "tag-success" : "tag-danger"}">${v.paid ? "Pago" : "A pagar"}</span></td>
            <td>
              <button class="btn-ghost" data-view-sale="${v.id}">Ver</button>
              <button class="btn-ghost" data-edit-pos-sale="${v.id}">Editar</button>
              <button class="btn-danger" data-del-pos-sale="${v.id}">Excluir</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  function updateVendaTerminalOptions(searchRaw = "") {
    const selVendaTerm = document.getElementById("posVendaTerminal");
    if (!selVendaTerm) return;
    const term = normalizeText(searchRaw);
    const digits = onlyDigits(searchRaw);
    const list = (posTerminals || []).filter((t) => {
      if (!term && !digits) return true;
      const name = normalizeText(t.Customer?.name);
      const code = normalizeText(t.terminal_code);
      return (
        name.includes(term) ||
        code.includes(term) ||
        (digits && onlyDigits(t.terminal_code).includes(digits))
      );
    });
    selVendaTerm.innerHTML =
      '<option value="">Selecione</option>' +
      list
        .map((t) => `<option value="${t.id}">${t.Customer?.name || "Cliente"} - ${t.terminal_code}</option>`)
        .join("");
  }

  async function deletePosVenda(id) {
    try {
      await apiFetch(`/api/pos/sales/${id}`, { method: "DELETE" });
      await loadPosVendasRecentes();
      await loadPosResumo();
      if (editingPosVendaId === Number(id) || editingPosVendaId === id) {
        resetPosVendaForm();
      }
    } catch (err) {
      alert("Erro ao excluir venda POS");
      console.error(err);
    }
  }

  function startEditPosVenda(id) {
    const sale = posVendasRecentes.find((v) => v.id == id);
    if (!sale) return;
    editingPosVendaId = sale.id;
    document.getElementById("posVendaTerminal").value = sale.pos_terminal_id || "";
    if (sale.sale_datetime) {
      const d = new Date(sale.sale_datetime);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      document.getElementById("posVendaData").value = local;
    }
    document.getElementById("posVendaValor").value = sale.amount || "";
    document.getElementById("posVendaForma").value = sale.payment_type || "DEBITO";
    document.getElementById("posVendaNsu").value = sale.nsu || "";
    document.getElementById("btnPosRegistrarVenda").textContent = "Atualizar venda";
  }

  function resetPosVendaForm() {
    editingPosVendaId = null;
    document.getElementById("posVendaTerminal").value = "";
    document.getElementById("posVendaData").value = "";
    document.getElementById("posVendaValor").value = "";
    document.getElementById("posVendaForma").value = "DEBITO";
    document.getElementById("posVendaNsu").value = "";
    document.getElementById("btnPosRegistrarVenda").textContent = "Salvar venda";
    const msg = document.getElementById("posVendaMsg");
    if (msg) {
      msg.textContent = "";
      msg.style.display = "none";
    }
  }

  function openPosSaleModal(id) {
    const sale =
      posResumoList.find((s) => s.id == id) || posVendasRecentes.find((s) => s.id == id);
    if (!sale) return;
    posSaleModalData = sale;
    const modal = document.getElementById("posSaleModal");
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set("posSaleModalTitle", `Venda #${sale.id}`);
    const tag = document.getElementById("posSaleModalStatus");
    if (tag) {
      tag.className = `tag ${sale.paid ? "tag-success" : "tag-danger"}`;
      tag.textContent = sale.paid ? "Pago" : "A pagar";
    }
    set("posSaleModalData", sale.sale_datetime ? new Date(sale.sale_datetime).toLocaleString("pt-BR") : "—");
    set("posSaleModalTerminal", sale.PosTerminal?.terminal_code || "—");
    set("posSaleModalCliente", sale.Customer?.name || "—");
    set("posSaleModalEmpresa", sale.PosCompany?.name || "—");
    set("posSaleModalForma", sale.payment_type || "—");
    set("posSaleModalNsu", sale.nsu || "—");
    set("posSaleModalBruto", formatCurrencyBRL(sale.amount));
    set("posSaleModalTaxa", `${Number(sale.fee_percent || 0).toFixed(2)}% / ${formatCurrencyBRL(sale.fee_value)}`);
    set("posSaleModalLiquido", formatCurrencyBRL(sale.net_amount));
    set("posSaleModalPagoEm", sale.paid_at ? new Date(sale.paid_at).toLocaleString("pt-BR") : "—");
    set("posSaleModalLote", sale.payment_batch || "—");
    const cli = posClientes.find((c) => c.id === sale.customer_id);
    set("posSaleModalPix", cli?.PosRate?.pix_key || "—");
    if (modal) modal.style.display = "flex";
  }

  function closePosSaleModal() {
    const modal = document.getElementById("posSaleModal");
    if (modal) modal.style.display = "none";
    posSaleModalData = null;
  }

      async function loadPosClientes() {
        try {
          const all = await apiFetch("/api/customers");
          const onlyPos = (all || []).filter((c) => c.uses_pos !== false);
          // Busca taxas de cada cliente POS
          const rates = await Promise.all(
            onlyPos.map(async (c) => {
              try {
                const r = await apiFetch(`/api/pos/rates/${c.id}`);
                return [c.id, r];
              } catch {
                return [c.id, null];
              }
            })
          );
          const rateMap = new Map(rates);
          posClientes = onlyPos.map((c) => ({
            ...c,
            PosRate: rateMap.get(c.id) || {},
          }));
          renderPosClientes();
          fillPosSelects();
        } catch (err) {
          console.error("Erro ao carregar clientes POS:", err);
        }
      }

      function renderPosClientes() {
        const tbody = document.getElementById("posClientesTableBody");
        if (!tbody) return;
        const searchRaw = document.getElementById("posCliSearch")?.value || "";
        const term = normalizeText(searchRaw);
        const digits = onlyDigits(searchRaw);
        const list = posClientes.filter((c) => {
          if (!term && !digits) return true;
          const name = normalizeText(c.name);
          const whats = normalizeText(c.whatsapp_number);
          const whatsDigits = onlyDigits(c.whatsapp_number);
          return (
            name.includes(term) ||
            whats.includes(term) ||
            (digits && whatsDigits.includes(digits))
          );
        });

        tbody.innerHTML = list
          .map((c) => `
            <tr>
              <td>${c.id}</td>
              <td>${c.name}</td>
              <td>${c.whatsapp_number}</td>
              <td>${c.uses_pos === false ? "Não" : "Sim"}</td>
              <td>${c.uses_nf ? "Sim" : "Não"}</td>
              <td>${Number(c.PosRate?.debit_percent || 0).toFixed(2)}%</td>
              <td>${Number(c.PosRate?.credit_avista_percent || 0).toFixed(2)}%</td>
              <td>${Number(c.PosRate?.credit_2a6_percent || 0).toFixed(2)}%</td>
              <td>${Number(c.PosRate?.credit_7a12_percent || 0).toFixed(2)}%</td>
              <td>${c.PosRate?.pix_key || "—"}</td>
              <td>
                <button class="btn-ghost" data-edit-pos-cliente="${c.id}">Editar</button>
                <button class="btn-danger" data-del-pos-cliente="${c.id}">Excluir</button>
              </td>
            </tr>`)
          .join("");
      }

      async function savePosCliente() {
        const name = document.getElementById("posCliNome").value.trim();
        const whatsapp_number = document.getElementById("posCliWhats").value.trim();
        const pix_key = document.getElementById("posCliPix").value.trim();
        const debit_percent = Number(document.getElementById("posCliDeb").value || 0);
        const credit_avista_percent = Number(document.getElementById("posCliCredAv").value || 0);
        const credit_2a6_percent = Number(document.getElementById("posCliCred2a6").value || 0);
        const credit_7a12_percent = Number(document.getElementById("posCliCred7a12").value || 0);
        const uses_pos = document.getElementById("posCliAtivo").checked;
        const uses_nf = document.getElementById("posCliUsaNF").checked;

        if (!name || !whatsapp_number) {
          alert("Informe nome e WhatsApp");
          return;
        }

        try {
          let customerId = editingPosClienteId;
          const payload = {
            name,
            whatsapp_number,
            fee_percent: 0,
            is_active: uses_pos,
            uses_nf,
            uses_pos,
          };

          if (editingPosClienteId) {
            await apiFetch(`/api/customers/${editingPosClienteId}`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
          } else {
            const created = await apiFetch("/api/customers", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            customerId = created.id;
          }

          await apiFetch(`/api/pos/rates/${customerId}`, {
            method: "POST",
            body: JSON.stringify({
              pix_key,
              debit_percent,
              credit_avista_percent,
              credit_2a6_percent,
              credit_7a12_percent,
            }),
          });

          await loadPosClientes();
          resetPosClienteForm();
          alert("Cliente POS salvo");
        } catch (err) {
          alert("Erro ao salvar cliente POS (WhatsApp deve ser unico)");
          console.error(err);
        }
      }

      function resetPosClienteForm() {
        editingPosClienteId = null;
        document.getElementById("posCliNome").value = "";
        document.getElementById("posCliWhats").value = "";
        document.getElementById("posCliPix").value = "";
        document.getElementById("posCliAtivo").checked = true;
        document.getElementById("posCliUsaNF").checked = false;
        document.getElementById("posCliDeb").value = "";
        document.getElementById("posCliCredAv").value = "";
        document.getElementById("posCliCred2a6").value = "";
        document.getElementById("posCliCred7a12").value = "";
        document.getElementById("btnPosSalvarCliente").textContent = "Salvar cliente";
      }

      function startEditPosCliente(id) {
        const cli = posClientes.find((c) => c.id == id);
        if (!cli) return;
        editingPosClienteId = cli.id;
        document.getElementById("posCliNome").value = cli.name || "";
        document.getElementById("posCliWhats").value = cli.whatsapp_number || "";
        document.getElementById("posCliPix").value = cli.PosRate?.pix_key || "";
        document.getElementById("posCliAtivo").checked = cli.uses_pos !== false;
        document.getElementById("posCliUsaNF").checked = !!cli.uses_nf;
        document.getElementById("posCliDeb").value = cli.PosRate?.debit_percent ?? "";
        document.getElementById("posCliCredAv").value = cli.PosRate?.credit_avista_percent ?? "";
        document.getElementById("posCliCred2a6").value = cli.PosRate?.credit_2a6_percent ?? "";
        document.getElementById("posCliCred7a12").value = cli.PosRate?.credit_7a12_percent ?? "";
        document.getElementById("btnPosSalvarCliente").textContent = "Atualizar cliente";
      }

      async function deletePosCliente(id) {
        if (!confirm("Excluir este cliente?")) return;
        try {
          await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
          await loadPosClientes();
          resetPosClienteForm();
        } catch (err) {
          alert("Erro ao excluir cliente POS");
          console.error(err);
        }
      }

  // ==========================
  // EVENTOS GERAIS
  // ==========================
  document.addEventListener("DOMContentLoaded", () => {
        // Theme
        document
          .getElementById("btnThemeToggle")
          .addEventListener("click", () => {
            const current = document.body.getAttribute("data-theme");
            applyTheme(current === "dark" ? "light" : "dark");
          });

        // Login
        document.getElementById("btnLogin").addEventListener("click", doLogin);
        document
          .getElementById("loginPassword")
          .addEventListener("keydown", (e) => {
            if (e.key === "Enter") doLogin();
          });
        document
          .getElementById("forgotPasswordLink")
          .addEventListener("click", sendForgotPassword);

        // Logout
        document
          .getElementById("btnLogout")
          .addEventListener("click", logout);

        // Sidebar nav
        document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
          item.addEventListener("click", () => {
            const anchor = item.getAttribute("data-anchor");
            selectPage(item.dataset.page, anchor);
            if (window.innerWidth <= 900) {
              document.getElementById("sidebar").classList.remove("open");
              document
                .getElementById("sidebarBackdrop")
                .classList.remove("show");
            }
          });
        });

        // Mobile sidebar
        document
          .getElementById("btnMobileMenu")
          .addEventListener("click", () => {
            document.getElementById("sidebar").classList.add("open");
            document
              .getElementById("sidebarBackdrop")
              .classList.add("show");
          });
        document
          .getElementById("sidebarBackdrop")
          .addEventListener("click", () => {
            document.getElementById("sidebar").classList.remove("open");
            document
              .getElementById("sidebarBackdrop")
              .classList.remove("show");
          });

        // POS eventos
        document.getElementById("btnPosSalvarCliente")?.addEventListener("click", savePosCliente);
        document.getElementById("btnPosAddCompany")?.addEventListener("click", addPosCompany);
        document.getElementById("btnPosAddTerminal")?.addEventListener("click", addPosTerminal);
        document.getElementById("btnPosSalvarTaxas")?.addEventListener("click", savePosRates);
        document.getElementById("btnPosRegistrarVenda")?.addEventListener("click", registrarVendaPos);
        document.getElementById("btnPosCarregarResumo")?.addEventListener("click", loadPosResumo);
        document.getElementById("posRateCliente")?.addEventListener("change", loadPosRateForSelected);
        document.getElementById("posResumoTabela")?.addEventListener("change", (e) => {
          if (e.target.classList.contains("posResumoCheck")) updateResumoSelecionados();
        });
        document.getElementById("posResumoTabela")?.addEventListener("click", (e) => {
          const viewId = e.target.getAttribute("data-view-sale");
          if (viewId) {
            openPosSaleModal(viewId);
          }
        });
        document.getElementById("posResumoSelectAll")?.addEventListener("change", (e) => {
          const checked = e.target.checked;
          document.querySelectorAll(".posResumoCheck").forEach((c) => {
            if (!c.disabled) c.checked = checked;
          });
          updateResumoSelecionados();
        });
        document.getElementById("btnPosLimparResumo")?.addEventListener("click", (e) => {
          e.preventDefault();
          document.getElementById("posResumoIni").value = "";
          document.getElementById("posResumoFim").value = "";
          document.getElementById("posResumoTerminal").value = "";
          document.getElementById("posResumoOnlyUnpaid").checked = false;
          document.querySelectorAll(".posResumoCheck").forEach((c) => {
            if (!c.disabled) c.checked = false;
          });
          updateResumoSelecionados();
          loadPosResumo();
        });
        document.getElementById("btnPosLimparResumo")?.addEventListener("click", (e) => {
          e.preventDefault();
          document.getElementById("posResumoIni").value = "";
          document.getElementById("posResumoFim").value = "";
          document.getElementById("posResumoTerminal").value = "";
          document.getElementById("posResumoOnlyUnpaid").checked = false;
          document.querySelectorAll(".posResumoCheck").forEach((c) => {
            if (!c.disabled) c.checked = false;
          });
          updateResumoSelecionados();
          loadPosResumo();
        });
        document.getElementById("btnPosMarcarPago")?.addEventListener("click", (e) => {
          e.preventDefault();
          marcarPosPagas();
        });
        document.getElementById("posResumoOnlyUnpaid")?.addEventListener("change", loadPosResumo);
        document.getElementById("posResumoTerminal")?.addEventListener("change", loadPosResumo);
        document.getElementById("posCompanySearch")?.addEventListener("input", renderPosCompanies);
        document.getElementById("posTerminalSearch")?.addEventListener("input", renderPosTerminals);
        document.getElementById("posCliSearch")?.addEventListener("input", renderPosClientes);
        document.getElementById("posVendaTerminalSearch")?.addEventListener("input", renderPosVendas);
        document.getElementById("posVendaStatusFilter")?.addEventListener("change", renderPosVendas);
        document.getElementById("btnPosLimparCompany")?.addEventListener("click", (e) => {
          e.preventDefault();
          resetPosCompanyForm();
        });
        document.getElementById("btnPosLimparTerminal")?.addEventListener("click", (e) => {
          e.preventDefault();
          resetPosTerminalForm();
        });
        document.getElementById("btnPosNovoCliente")?.addEventListener("click", (e) => {
          e.preventDefault();
          resetPosClienteForm();
        });
        document.getElementById("btnPosLimparVenda")?.addEventListener("click", (e) => {
          e.preventDefault();
          resetPosVendaForm();
        });
        document.getElementById("posCompaniesTableBody")?.addEventListener("click", (e) => {
          const editId = e.target.getAttribute("data-edit-pos-company");
          const delId = e.target.getAttribute("data-del-pos-company");
          if (editId) {
            startEditPosCompany(editId);
          } else if (delId && confirm("Excluir empresa?")) {
            deletePosCompany(delId);
          }
        });
        document.getElementById("posTerminalsTableBody")?.addEventListener("click", (e) => {
          const editId = e.target.getAttribute("data-edit-pos-terminal");
          const delId = e.target.getAttribute("data-del-pos-terminal");
          if (editId) {
            startEditPosTerminal(editId);
          } else if (delId && confirm("Excluir terminal?")) {
            deletePosTerminal(delId);
          }
        });
        document.getElementById("posClientesTableBody")?.addEventListener("click", (e) => {
          const editId = e.target.getAttribute("data-edit-pos-cliente");
          const delId = e.target.getAttribute("data-del-pos-cliente");
          if (editId) {
            startEditPosCliente(editId);
          } else if (delId && confirm("Excluir cliente?")) {
            deletePosCliente(delId);
          }
        });
        document.getElementById("posVendasTableBody")?.addEventListener("click", (e) => {
          const editId = e.target.getAttribute("data-edit-pos-sale");
          const delId = e.target.getAttribute("data-del-pos-sale");
          const viewId = e.target.getAttribute("data-view-sale");
          if (editId) {
            startEditPosVenda(editId);
          } else if (viewId) {
            openPosSaleModal(viewId);
          } else if (delId && confirm("Excluir venda?")) {
            deletePosVenda(delId);
          }
        });
        document.getElementById("posSaleModalClose")?.addEventListener("click", closePosSaleModal);
        document.getElementById("posSaleModal")?.addEventListener("click", (e) => {
          if (e.target.id === "posSaleModal") closePosSaleModal();
        });

        // Clientes
        document
          .getElementById("btnAddCliente")
          .addEventListener("click", () => openClienteForm(null));
        document
          .getElementById("btnCancelCliente")
          .addEventListener("click", closeClienteForm);
        document
          .getElementById("btnSaveCliente")
          .addEventListener("click", saveCliente);

        document
          .getElementById("clienteSearch")
          .addEventListener("input", renderClientes);
        document
          .getElementById("clienteFeeMin")
          .addEventListener("input", renderClientes);
        document
          .getElementById("clienteFeeMax")
          .addEventListener("input", renderClientes);
        document
          .querySelectorAll(".chip-filter[data-cliente-ativo]")
          .forEach((el) => {
            el.addEventListener("click", () => {
              document
                .querySelectorAll(".chip-filter[data-cliente-ativo]")
                .forEach((c) => c.classList.remove("active"));
              el.classList.add("active");
              renderClientes();
            });
          });

        document
          .getElementById("clientesTableBody")
          .addEventListener("click", (e) => {
            const editId = e.target.getAttribute("data-edit-cliente");
            const delId = e.target.getAttribute("data-del-cliente");
            if (editId) {
              const c = clientes.find((x) => x.id == editId);
              if (c) openClienteForm(c);
            } else if (delId) {
              deleteCliente(delId);
            }
          });

        // Empresas
        document
          .getElementById("btnAddEmpresa")
          .addEventListener("click", () => openEmpresaForm(null));
        document
          .getElementById("btnCancelEmpresa")
          .addEventListener("click", closeEmpresaForm);
        document
          .getElementById("btnSaveEmpresa")
          .addEventListener("click", saveEmpresa);

        document
          .getElementById("empresaSearch")
          .addEventListener("input", renderEmpresas);
        document
          .getElementById("relClienteSearch")
          ?.addEventListener("input", () => populateRelatorioSelects());
        document
          .getElementById("relEmpresaSearch")
          ?.addEventListener("input", () => populateRelatorioSelects());
        document
          .getElementById("relEmpresaAtivo")
          ?.addEventListener("change", () => populateRelatorioSelects());
        document
          .querySelectorAll(".chip-filter[data-empresa-ativo]")
          .forEach((el) => {
            el.addEventListener("click", () => {
              document
                .querySelectorAll(".chip-filter[data-empresa-ativo]")
                .forEach((c) => c.classList.remove("active"));
              el.classList.add("active");
              renderEmpresas();
            });
          });

        document
          .getElementById("empresasTableBody")
          .addEventListener("click", (e) => {
            const editId = e.target.getAttribute("data-edit-empresa");
            const delId = e.target.getAttribute("data-del-empresa");
            if (editId) {
              const emp = empresas.find((x) => x.id == editId);
              if (emp) openEmpresaForm(emp);
            } else if (delId) {
              deleteEmpresa(delId);
            }
          });

        // POS (Maquininhas)
        document.getElementById("btnPosAddCompany")?.addEventListener("click", addPosCompany);
        document.getElementById("btnPosAddTerminal")?.addEventListener("click", addPosTerminal);
        document.getElementById("btnPosSalvarTaxas")?.addEventListener("click", savePosRates);
        document.getElementById("posRateCliente")?.addEventListener("change", loadPosRateForSelected);
        document.getElementById("btnPosRegistrarVenda")?.addEventListener("click", registrarVendaPos);
        document.getElementById("btnPosCarregarResumo")?.addEventListener("click", loadPosResumo);

        // Notas
        setupNotasInfiniteScroll();
        document
          .getElementById("notasSearch")
          .addEventListener("input", () => renderNotas());
        document
          .getElementById("notasStatusFilter")
          .addEventListener("change", () => renderNotas());
        document
          .getElementById("notasOrigemFilter")
          .addEventListener("change", () => renderNotas());
        document
          .getElementById("notasApplyFilters")
          .addEventListener("click", () => {
            resetNotasInfiniteScroll();
            notasState.lastFiltersKey = getNotasFiltersKey();
            loadNotasPage(false);
          });

        // Relatórios - tabs
        function setRelTab(tab) {
          document
            .querySelectorAll(".tab-button")
            .forEach((b) => b.classList.remove("active"));
          document
            .querySelectorAll(".rel-subsection")
            .forEach((s) => s.classList.add("hidden"));

          if (tab === "geral") {
            document.getElementById("tabRelGeral").classList.add("active");
            document.getElementById("relGeralSection").classList.remove("hidden");
            loadRelatorios();
          } else if (tab === "cliente") {
            document.getElementById("tabRelCliente").classList.add("active");
            document
              .getElementById("relClienteSection")
              .classList.remove("hidden");
            populateRelatorioSelects();
          } else if (tab === "empresa") {
            document.getElementById("tabRelEmpresa").classList.add("active");
            document
              .getElementById("relEmpresaSection")
              .classList.remove("hidden");
            populateRelatorioSelects();
          }
        }

        document
          .getElementById("tabRelGeral")
          .addEventListener("click", () => setRelTab("geral"));
        document
          .getElementById("tabRelCliente")
          .addEventListener("click", () => setRelTab("cliente"));
        document
          .getElementById("tabRelEmpresa")
          .addEventListener("click", () => setRelTab("empresa"));

        document
          .getElementById("btnReloadReports")
          .addEventListener("click", loadRelatorios);
        document
          .getElementById("btnRelClienteGerar")
          .addEventListener("click", () => loadRelatorioPorCliente(true));
        document
          .getElementById("btnRelEmpresaGerar")
          .addEventListener("click", () => loadRelatorioPorEmpresa(true));

        // Se ja tiver token salvo, tenta restaurar a sessao
        tryRestoreSession();
      });


