
      // ==========================
      // THEME
      // ==========================
      function applyTheme(theme) {
        document.body.setAttribute("data-theme", theme);
        localStorage.setItem("nf_theme", theme);
      }

      const savedTheme = localStorage.getItem("nf_theme") || "light";
      applyTheme(savedTheme);

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
        loadClientes().then(populateRelatorioSelects);
        loadEmpresas().then(populateRelatorioSelects);
        loadPosClientes();
        loadPosCompanies();
        loadPosTerminals();
        loadPosVendasRecentes();
        loadPosResumo();
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
          currentUser = {
            email: localStorage.getItem("nf_user_email") || "Administrador",
          };
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

        const search = document
          .getElementById("clienteSearch")
          .value.toLowerCase();
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
                c.name.toLowerCase().includes(search) ||
                c.whatsapp_number.toLowerCase().includes(search)
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
        } else {
          editingClienteId = null;
          document.getElementById("clienteNome").value = "";
          document.getElementById("clienteWhats").value = "";
          document.getElementById("clienteTaxa").value = "";
          document.getElementById("clienteAtivo").value = "true";
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

        const search = document.getElementById("empresaSearch").value.toLowerCase();
        const ativoChip = document.querySelector(
          '.chip-filter[data-empresa-ativo].active'
        );
        const ativoFilter = ativoChip ? ativoChip.dataset.empresaAtivo : "all";

        empresas
          .filter((e) => {
            if (
              search &&
              !(
                e.name.toLowerCase().includes(search) ||
                e.cnpj.toLowerCase().includes(search)
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
              <td>${e.cnpj}</td>
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
          await apiFetch("/api/pos/companies", {
            method: "POST",
            body: JSON.stringify({ name, cnpj, is_active }),
          });
          await loadPosCompanies();
        } catch (err) {
          alert("Erro ao cadastrar empresa POS");
          console.error(err);
        }
      }

      function renderPosCompanies() {
        const tbody = document.getElementById("posCompaniesTableBody");
        if (!tbody) return;
        tbody.innerHTML = (posCompanies || [])
          .map((c) => `
            <tr>
              <td>${c.id}</td>
              <td>${c.name}</td>
              <td>${c.cnpj}</td>
              <td>${c.is_active ? "Ativa" : "Inativa"}</td>
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
          await apiFetch("/api/pos/terminals", {
            method: "POST",
            body: JSON.stringify({ pos_company_id, customer_id, terminal_code, is_active }),
          });
          await loadPosTerminals();
        } catch (err) {
          alert("Erro ao cadastrar terminal");
          console.error(err);
        }
      }

      function renderPosTerminals() {
        const tbody = document.getElementById("posTerminalsTableBody");
        if (!tbody) return;
        tbody.innerHTML = (posTerminals || [])
          .map((t) => `
            <tr>
              <td>${t.id}</td>
              <td>${t.terminal_code}</td>
              <td>${t.PosCompany?.name || "—"}</td>
              <td>${t.Customer?.name || "—"}</td>
              <td>${t.is_active ? "Ativo" : "Inativo"}</td>
            </tr>
          `)
          .join("");
      }

      function fillPosSelects() {
        const selEmp = document.getElementById("posTerminalEmpresa");
        const selCli = document.getElementById("posTerminalCliente");
        const selRateCli = document.getElementById("posRateCliente");
        const selVendaTerm = document.getElementById("posVendaTerminal");
        if (selEmp) {
          selEmp.innerHTML =
            '<option value="">Selecione</option>' +
            (posCompanies || [])
              .map((c) => `<option value="${c.id}">${c.name}</option>`)
              .join("");
        }
        if (selCli) {
          selCli.innerHTML =
            '<option value="">Selecione</option>' +
            (posClientes || [])
              .map((c) => `<option value="${c.id}">${c.name}</option>`)
              .join("");
        }
        if (selRateCli) selRateCli.innerHTML = selCli ? selCli.innerHTML : "";
        if (selVendaTerm) {
          selVendaTerm.innerHTML =
            '<option value="">Selecione</option>' +
            (posTerminals || [])
              .map(
                (t) => `<option value="${t.id}">${t.terminal_code} - ${t.Customer?.name || "Cliente"}</option>`
              )
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
          await apiFetch("/api/pos/sales", {
            method: "POST",
            body: JSON.stringify({ pos_terminal_id, sale_datetime, amount, payment_type, nsu }),
          });
          document.getElementById("posVendaMsg").textContent = "Venda registrada";
          document.getElementById("posVendaMsg").style.display = "block";
          await loadPosVendasRecentes();
          await loadPosResumo();
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
          const res = await apiFetch("/api/pos/reports/summary");
          const bruto = Number(res?.totals?.bruto || 0);
          const liquido = Number(res?.totals?.liquido || 0);
          const taxas = Number(res?.totals?.taxas || 0);
          document.getElementById("posResumoBruto").textContent = formatCurrencyBRL(bruto);
          document.getElementById("posResumoLiquido").textContent = formatCurrencyBRL(liquido);
          document.getElementById("posResumoTaxas").textContent = formatCurrencyBRL(taxas);
          document.getElementById("posResumoTopCliente").textContent =
            res?.topCliente?.Customer?.name || "—";
          document.getElementById("posResumoTopDia").textContent =
            res?.topDia?.Customer?.name || "—";
          const mv = res?.maiorVenda;
          document.getElementById("posResumoMaiorVenda").textContent = mv
            ? `${mv.Customer?.name || "—"} - ${formatCurrencyBRL(mv.amount)}`
            : "—";
        } catch (err) {
          console.error("Erro ao carregar resumo POS:", err);
        }
      }

      function renderPosVendas() {
        const tbody = document.getElementById("posVendasTableBody");
        if (!tbody) return;
        tbody.innerHTML = (posVendasRecentes || [])
          .map((v) => {
            const dt = v.sale_datetime ? new Date(v.sale_datetime).toLocaleString("pt-BR") : "—";
            return `
              <tr>
                <td>${dt}</td>
                <td>${v.Customer?.name || "—"}</td>
                <td>${v.PosTerminal?.terminal_code || "—"}</td>
                <td>${v.payment_type}</td>
                <td>${formatCurrencyBRL(v.amount)}</td>
                <td>${formatCurrencyBRL(v.fee_value)}</td>
                <td>${formatCurrencyBRL(v.net_amount)}</td>
                <td><button class="btn-danger" data-del-pos-sale="${v.id}">Excluir</button></td>
              </tr>`;
          })
          .join("");
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
        document.getElementById("posVendasTableBody")?.addEventListener("click", (e) => {
          const delId = e.target.getAttribute("data-del-pos-sale");
          if (delId && confirm("Excluir venda?")) deletePosVenda(delId);
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
      async function deletePosVenda(id) {
        try {
          await apiFetch(`/api/pos/sales/${id}`, { method: "DELETE" });
          await loadPosVendasRecentes();
          await loadPosResumo();
        } catch (err) {
          alert("Erro ao excluir venda POS");
          console.error(err);
        }
      }
      async function loadPosClientes() {
        try {
          const all = await apiFetch("/api/customers");
          posClientes = (all || []).filter((c) => c.uses_pos !== false);
          renderPosClientes();
          fillPosSelects();
        } catch (err) {
          console.error("Erro ao carregar clientes POS:", err);
        }
      }

      function renderPosClientes() {
        const tbody = document.getElementById("posClientesTableBody");
        if (!tbody) return;
        tbody.innerHTML = posClientes
          .map((c) => `
            <tr>
              <td>${c.id}</td>
              <td>${c.name}</td>
              <td>${c.whatsapp_number}</td>
              <td>${Number(c.PosRate?.debit_percent || 0).toFixed(2)}%</td>
              <td>${Number(c.PosRate?.credit_avista_percent || 0).toFixed(2)}%</td>
              <td>${Number(c.PosRate?.credit_2a6_percent || 0).toFixed(2)}%</td>
              <td>${Number(c.PosRate?.credit_7a12_percent || 0).toFixed(2)}%</td>
              <td>${c.PosRate?.pix_key || "—"}</td>
            </tr>
          `)
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

        if (!name || !whatsapp_number) {
          alert("Informe nome e WhatsApp");
          return;
        }

        try {
          const created = await apiFetch("/api/customers", {
            method: "POST",
            body: JSON.stringify({
              name,
              whatsapp_number,
              fee_percent: 0,
              is_active: true,
              uses_nf: false,
              uses_pos: true,
            }),
          });

          await apiFetch(`/api/pos/rates/${created.id}`, {
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
          alert("Cliente POS salvo");
        } catch (err) {
          alert("Erro ao salvar cliente POS (WhatsApp deve ser unico)");
          console.error(err);
        }
      }
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
