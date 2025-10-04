
(() => {
    const STORAGE_PREFIX = 'pdvSimples';
    const STORAGE_KEYS = {
        produtos: `${STORAGE_PREFIX}:produtos`,
        entradas: `${STORAGE_PREFIX}:entradas`,
        vendas: `${STORAGE_PREFIX}:vendas`
    };
    const ESTOQUE_ALERTA = 5;
    const OPEN_FOOD_FACTS_API_URL = 'https://world.openfoodfacts.org/api/v0/product';
    const BUSCA_PRODUTO_TIMEOUT_MS = 1000;

    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const quantidadeFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    const dataFmt = new Intl.DateTimeFormat('pt-BR');
    const horaFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const state = {
        produtos: carregarColecao('produtos').map(normalizarProduto),
        entradas: carregarColecao('entradas').map(normalizarEntrada),
        vendas: carregarColecao('vendas').map(normalizarVenda)
    };

    let produtoEmEdicao = null;
    let termoBuscaProdutos = '';
    let toastTimeoutId = null;
    let leitorFocusTimeoutId = null;
    let produtoBuscaAbortController = null;
    const cacheBuscaCodigo = {};

    const elements = {
        sections: document.querySelectorAll('.app-section'),
        navLinks: document.querySelectorAll('.nav-link'),
        quickActions: document.querySelectorAll('.quick-action'),
        tabLinks: document.querySelectorAll('.tab-link'),
        reportPanels: document.querySelectorAll('.report-panel'),
        relatorioEstoque: {
            imprimirBtn: document.getElementById('imprimir-relatorio-estoque'),
            visualizarBtn: document.getElementById('visualizar-relatorio-estoque'),
            corpoTabela: document.getElementById('relatorio-estoque-body'),
            totalProdutos: document.getElementById('total-produtos-relatorio'),
            valorTotalEstoque: document.getElementById('valor-total-estoque'),
            lucroBrutoEstoque: document.getElementById('lucro-bruto-estoque'),
            dataRelatorio: document.getElementById('data-relatorio-estoque'),
            content: document.getElementById('relatorio-estoque-content')
        },
        toast: document.getElementById('toast'),
        alertaEstoque: document.getElementById('alerta-estoque'),
        dashboard: {
            vendasHoje: document.getElementById('vendas-hoje'),
            comprasHoje: document.getElementById('compras-hoje'),
            saldoCaixa: document.getElementById('saldo-caixa'),
            baixoEstoque: document.getElementById('produtos-baixo-estoque')
        },
        produtoForm: document.getElementById('produto-form'),
        produtoNome: document.getElementById('produto-nome'),
        produtoMarca: document.getElementById('produto-marca'),
        produtoCodigo: document.getElementById('produto-codigo'),
        produtoUnidade: document.getElementById('produto-unidade'),
        produtoCusto: document.getElementById('produto-custo'),
        produtoVenda: document.getElementById('produto-venda'),
        cancelarEdicao: document.getElementById('cancelar-edicao'),
        produtosTabela: document.getElementById('produtos-table-body'),
        produtosEmpty: document.getElementById('produtos-empty'),
        buscaProdutos: document.getElementById('busca-produtos'),
        entradaForm: document.getElementById('entrada-form'),
        entradaProduto: document.getElementById('entrada-produto'),
        entradaQuantidade: document.getElementById('entrada-quantidade'),
        entradaData: document.getElementById('entrada-data'),
        entradaCustoUnitario: document.getElementById('entrada-custo-unitario'),
        entradaValorTotal: document.getElementById('entrada-valor-total'),
        entradasTabela: document.getElementById('entradas-table-body'),
        entradasEmpty: document.getElementById('entradas-empty'),
        vendaForm: document.getElementById('venda-form'),
        vendaProduto: document.getElementById('venda-produto'),
        vendaQuantidade: document.getElementById('venda-quantidade'),
        leitorCodigo: document.getElementById('leitor-codigo'),
        focarLeitor: document.getElementById('focar-leitor'),
        limparLeitor: document.getElementById('limpar-leitor'),
        vendaData: document.getElementById('venda-data'),
        vendaPrecoUnitario: document.getElementById('venda-preco-unitario'),
        vendaValorTotal: document.getElementById('venda-valor-total'),
        vendasTabela: document.getElementById('vendas-table-body'),
        vendasEmpty: document.getElementById('vendas-empty'),
        relatorios: {
            data: document.getElementById('data-relatorio'),
            totalEntradasDia: document.getElementById('total-entradas-dia'),
            totalVendasDia: document.getElementById('total-vendas-dia'),
            saldoDia: document.getElementById('saldo-dia'),
            lucroDia: document.getElementById('lucro-dia'),
            entradasLista: document.getElementById('entradas-dia-list'),
            entradasEmpty: document.getElementById('relatorio-entradas-empty'),
            vendasLista: document.getElementById('vendas-dia-list'),
            vendasEmpty: document.getElementById('relatorio-vendas-empty'),
            estoqueTabela: document.getElementById('estoque-table-body'),
            estoqueEmpty: document.getElementById('estoque-empty'),
            historicoTabela: document.getElementById('historico-table-body'),
            historicoEmpty: document.getElementById('historico-empty'),
            filtroHistorico: document.getElementById('filtro-historico'),
            exportarEstoque: document.getElementById('exportar-estoque'),
            exportarRelatorioExcel: document.getElementById('exportar-relatorio-excel'),
            exportarBackupJson: document.getElementById('exportar-backup-json'),
            importarBackup: document.getElementById('importar-backup')
        }
    };

    inicializar();
    function inicializar() {
        definirDatasPadrao();
        conectarEventos();
        garantirEstruturas();
        renderizarTudo();
    }

    // Limpar timeouts quando a página for fechada
    window.addEventListener('beforeunload', () => {
        if (buscaProdutoTimeout) {
            clearTimeout(buscaProdutoTimeout);
        }
        if (toastTimeoutId) {
            clearTimeout(toastTimeoutId);
        }
        if (leitorFocusTimeoutId) {
            clearTimeout(leitorFocusTimeoutId);
        }
    });

    function garantirEstruturas() {
        state.produtos = state.produtos.filter(p => p.id && p.nome);
        state.entradas = state.entradas.filter(e => e.id && e.produtoId);
        state.vendas = state.vendas.filter(v => v.id && v.produtoId);
        salvarColecao('produtos', state.produtos);
        salvarColecao('entradas', state.entradas);
        salvarColecao('vendas', state.vendas);
    }

    function conectarEventos() {
        elements.navLinks.forEach(btn => {
            btn.addEventListener('click', () => mostrarSecao(btn.dataset.section));
        });

        elements.quickActions.forEach(btn => {
            btn.addEventListener('click', () => mostrarSecao(btn.dataset.section));
        });

        elements.tabLinks.forEach(tab => {
            tab.addEventListener('click', () => selecionarAba(tab.dataset.tab));
        });

        elements.relatorioEstoque.imprimirBtn.addEventListener('click', () => {
            // Remover aria-hidden e inert antes de focar e imprimir
            const overlay = document.getElementById('relatorio-estoque-overlay');
            if (overlay) {
                overlay.setAttribute('aria-hidden', 'false');
                overlay.removeAttribute('inert');
            }
            elements.relatorioEstoque.content.focus();
            window.print();
            // Restaurar aria-hidden e inert após a impressão
            setTimeout(() => {
                if (overlay) {
                    overlay.setAttribute('aria-hidden', 'true');
                    overlay.setAttribute('inert', '');
                }
            }, 100);
        });

        elements.relatorioEstoque.visualizarBtn.addEventListener('click', () => {
            // Remover aria-hidden e inert antes de focar
            const overlay = document.getElementById('relatorio-estoque-overlay');
            if (overlay) {
                overlay.setAttribute('aria-hidden', 'false');
                overlay.removeAttribute('inert');
            }
            elements.relatorioEstoque.content.focus();
        });

        // Adicionar evento para fechar o overlay do relatório de estoque
        const fecharBtn = document.getElementById('fechar-relatorio-estoque');
        if (fecharBtn) {
            fecharBtn.addEventListener('click', () => {
                const overlay = document.getElementById('relatorio-estoque-overlay');
                if (overlay) {
                    overlay.setAttribute('aria-hidden', 'true');
                    overlay.setAttribute('inert', '');
                }
            });
        }

        // Adicionar evento para o botão de imprimir na visualização
        const imprimirVisualizacaoBtn = document.getElementById('imprimir-relatorio-estoque-visualizacao');
        if (imprimirVisualizacaoBtn) {
            imprimirVisualizacaoBtn.addEventListener('click', () => {
                window.print();
            });
        }

        elements.produtoForm.addEventListener('submit', onSubmitProduto);
        elements.produtoForm.addEventListener('reset', () => {
            cancelarEdicaoProduto();
        });
        elements.cancelarEdicao.addEventListener('click', evt => {
            evt.preventDefault();
            cancelarEdicaoProduto();
        });
        if (elements.produtoCodigo) {
            elements.produtoCodigo.addEventListener('blur', onProdutoCodigoBlur);
        }
        elements.buscaProdutos.addEventListener('input', evt => {
            termoBuscaProdutos = normalizarTexto(evt.target.value);
            renderizarProdutos();
        });

        elements.entradaForm.addEventListener('submit', onSubmitEntrada);
        elements.entradaProduto.addEventListener('change', atualizarResumoEntrada);
        elements.entradaQuantidade.addEventListener('input', atualizarResumoEntrada);

        elements.vendaForm.addEventListener('submit', onSubmitVenda);
        elements.vendaProduto.addEventListener('change', atualizarResumoVenda);
        elements.vendaQuantidade.addEventListener('input', atualizarResumoVenda);

        elements.relatorios.data.addEventListener('change', () => atualizarMovimentacaoDia());
        elements.relatorios.filtroHistorico.addEventListener('change', () => renderizarHistorico());

        elements.relatorios.exportarEstoque.addEventListener('click', exportarEstoque);
        elements.relatorios.exportarRelatorioExcel.addEventListener('click', exportarRelatorioExcel);
        elements.relatorios.exportarBackupJson.addEventListener('click', exportarBackupJson);
        elements.relatorios.importarBackup.addEventListener('change', importarBackup);

        if (elements.leitorCodigo) {
            elements.leitorCodigo.addEventListener('keydown', onLeitorCodigoKeyDown);
            elements.leitorCodigo.addEventListener('blur', () => agendarFocoLeitor());
        }
        if (elements.focarLeitor) {
            elements.focarLeitor.addEventListener('click', () => focarLeitor(true));
        }
        if (elements.limparLeitor) {
            elements.limparLeitor.addEventListener('click', () => limparLeitor());
        }

        elements.toast.addEventListener('click', () => ocultarToast());
    }

    let buscaProdutoTimeout = null;

    async function onProdutoCodigoBlur() {
        if (!elements.produtoCodigo) {
            return;
        }

        const valorBruto = elements.produtoCodigo.value || '';
        const somenteDigitos = extrairDigitosCodigoBarras(valorBruto);

        if (!somenteDigitos || !/^\d{12,13}$/.test(somenteDigitos)) {
            return;
        }

        const codigoNormalizado = normalizarCodigoBarras(somenteDigitos);
        if (elements.produtoCodigo.value !== codigoNormalizado) {
            elements.produtoCodigo.value = codigoNormalizado;
        }

        if (produtoEmEdicao) {
            return;
        }

        if (elements.produtoNome.value.trim()) {
            return;
        }

        // Limpar timeout anterior
        if (buscaProdutoTimeout) {
            clearTimeout(buscaProdutoTimeout);
        }

        // Busca imediata para resposta mais rápida
        const dados = await buscarDadosProdutoPorCodigo(somenteDigitos);
        if (!dados || !dados.nome) {
            return;
        }

        if (elements.produtoCodigo.value !== somenteDigitos) {
            return;
        }

        if (elements.produtoNome.value.trim()) {
            return;
        }

        elements.produtoNome.value = dados.nome;
        if (dados.marca && elements.produtoMarca) {
            elements.produtoMarca.value = dados.marca;
        }
        if (dados.unidade && elements.produtoUnidade) {
            elements.produtoUnidade.value = dados.unidade;
        }
    }

    async function buscarDadosProdutoPorCodigo(codigo) {
        if (!codigo || typeof fetch !== 'function') {
            return null;
        }

        // 1. Tenta buscar do cache primeiro
        if (cacheBuscaCodigo[codigo]) {
            return cacheBuscaCodigo[codigo];
        }

        if (produtoBuscaAbortController && typeof produtoBuscaAbortController.abort === 'function') {
            produtoBuscaAbortController.abort();
        }

        const controlador = typeof AbortController === 'function' ? new AbortController() : null;
        produtoBuscaAbortController = controlador;

        let timeoutId = null;

        try {
            if (controlador) {
                timeoutId = setTimeout(() => controlador.abort(), BUSCA_PRODUTO_TIMEOUT_MS);
            }

            const url = `${OPEN_FOOD_FACTS_API_URL}/${codigo}.json`;
            const resposta = await fetch(url, controlador ? { signal: controlador.signal } : undefined);
            if (!resposta || !resposta.ok) {
                return null;
            }

            const dados = await resposta.json();
            if (!dados || dados.status !== 1 || !dados.product) {
                return null;
            }

            const produto = dados.product;
            
            const nome = [
                produto.product_name_pt,
                produto.generic_name_pt,
                produto.product_name,
                produto.generic_name
            ].find(valor => typeof valor === 'string' && valor.trim());

            const marca = produto.brands || produto.brands_hierarchy?.[0]?.name || produto.brands_debug_tags?.[0] || '';

            let unidade = 'unidade';
            if (produto.quantity) {
                const quantidade = produto.quantity.toLowerCase();
                if (quantidade.includes('kg') || quantidade.includes('quilograma')) {
                    unidade = 'kg';
                } else if (quantidade.includes('g') || quantidade.includes('grama')) {
                    unidade = 'g';
                } else if (quantidade.includes('l') || quantidade.includes('litro')) {
                    unidade = 'litro';
                } else if (quantidade.includes('ml')) {
                    unidade = 'ml';
                } else if (quantidade.includes('un') || quantidade.includes('uni')) {
                    unidade = 'unidade';
                }
            }

            const resultado = {
                nome: nome ? nome.trim() : null,
                marca: marca ? marca.trim() : '',
                unidade: unidade
            };

            // 2. Salva o resultado no cache antes de retornar
            if (resultado.nome) {
                cacheBuscaCodigo[codigo] = resultado;
            }

            return resultado;
        } catch (erro) {
            const requisicaoAbortada = controlador && controlador.signal && controlador.signal.aborted;
            if (!requisicaoAbortada && typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Busca silenciosa por código de barras falhou.', erro);
            }
            return null;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (produtoBuscaAbortController === controlador) {
                produtoBuscaAbortController = null;
            }
        }
    }
    function mostrarSecao(sectionId) {
        elements.navLinks.forEach(btn => {
            const ativa = btn.dataset.section === sectionId;
            btn.classList.toggle('active', ativa);
            if (ativa) {
                btn.setAttribute('aria-current', 'page');
            } else {
                btn.removeAttribute('aria-current');
            }
        });

        elements.sections.forEach(sec => {
            sec.classList.toggle('active', sec.id === sectionId);
        });

        if (sectionId === 'relatorios') {
            atualizarMovimentacaoDia();
            renderizarEstoque();
            renderizarHistorico();
        }

        if (sectionId === 'vendas') {
            agendarFocoLeitor(80);
        } else {
            cancelarFocoLeitor();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function selecionarAba(tabId) {
        elements.tabLinks.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        elements.reportPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `tab-${tabId}`);
        });

        if (tabId === 'estoque') {
            renderizarEstoque();
        } else if (tabId === 'movimentacao') {
            atualizarMovimentacaoDia();
        } else if (tabId === 'historico') {
            renderizarHistorico();
        } else if (tabId === 'estoque-detalhado') {
            renderizarRelatorioEstoqueDetalhado();
        }
    }

    function renderizarRelatorioEstoqueDetalhado() {
        const estoqueMapa = calcularEstoqueDetalhado();
        const itens = [...estoqueMapa.values()].sort((a, b) => {
            const nomeA = (a.produto?.nome || a.nome || '').toLowerCase();
            const nomeB = (b.produto?.nome || b.nome || '').toLowerCase();
            return nomeA.localeCompare(nomeB, 'pt-BR');
        });

        const tbody = elements.relatorioEstoque.corpoTabela;
        tbody.innerHTML = '';

        if (itens.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 9;
            td.textContent = 'Nenhum produto cadastrado.';
            td.className = 'empty-state';
            tr.appendChild(td);
            tbody.appendChild(tr);
            elements.relatorioEstoque.totalProdutos.textContent = '0';
            elements.relatorioEstoque.valorTotalEstoque.textContent = 'R$ 0,00';
            elements.relatorioEstoque.lucroBrutoEstoque.textContent = 'R$ 0,00';
            return;
        }

        let totalProdutos = 0;
        let valorTotalEstoque = 0;
        let lucroBrutoEstimado = 0;

        // Para este relatório, vamos calcular para o período completo (desde o início)
        // Calculando a data mais antiga entre todas as movimentações
        const todasMovimentacoes = [...state.entradas, ...state.vendas];
        let dataInicial = new Date();
        let dataFinal = new Date(0);
        
        todasMovimentacoes.forEach(mov => {
            const dataMov = new Date(mov.data);
            if (dataMov < dataInicial) dataInicial = dataMov;
            if (dataMov > dataFinal) dataFinal = dataMov;
        });

        const dataInicialStr = dataInicial.toISOString().split('T')[0];
        const dataFinalStr = dataFinal.toISOString().split('T')[0];

        itens.forEach(item => {
            const tr = document.createElement('tr');
            const nome = item.produto?.nome || item.nome || 'Produto removido';
            const codigo = item.produto?.codigoBarras || '';
            const unidade = item.produto?.unidade || item.unidade || '-';
            const custoReferencia = item.produto?.precoCusto ?? item.custoReferencia ?? 0;
            const vendaReferencia = item.produto?.precoVenda ?? 0;
            const quantidadeFinal = item.quantidade;
            const valorEstoque = arredondar(quantidadeFinal * custoReferencia);
            const lucroEstimado = arredondar(quantidadeFinal * (vendaReferencia - custoReferencia));

            const todasEntradas = state.entradas.filter(entrada => entrada.produtoId === item.produto?.id);
            const todasVendas = state.vendas.filter(venda => venda.produtoId === item.produto?.id);

            // Calculando saldos considerando todo o histórico
            const entradasAnteriores = todasEntradas
                .filter(entrada => entrada.data < dataInicialStr)
                .reduce((total, entrada) => total + entrada.quantidade, 0);
            const saidasAnteriores = todasVendas
                .filter(venda => venda.data < dataInicialStr)
                .reduce((total, venda) => total + venda.quantidade, 0);
            const saldoInicial = item.produto ? (entradasAnteriores - saidasAnteriores) : 0;

            // Movimentações no período
            const entradasPeriodo = todasEntradas
                .filter(entrada => entrada.data >= dataInicialStr && entrada.data <= dataFinalStr)
                .reduce((total, entrada) => total + entrada.quantidade, 0);
            const saidasPeriodo = todasVendas
                .filter(venda => venda.data >= dataInicialStr && venda.data <= dataFinalStr)
                .reduce((total, venda) => total + venda.quantidade, 0);

            const saldoFinal = quantidadeFinal;

            adicionarCelulaTexto(tr, codigo);
            adicionarCelulaTexto(tr, nome);
            adicionarCelulaTexto(tr, unidade);
            adicionarCelulaTexto(tr, quantidadeFmt.format(saldoInicial));
            adicionarCelulaTexto(tr, quantidadeFmt.format(entradasPeriodo));
            adicionarCelulaTexto(tr, quantidadeFmt.format(saidasPeriodo));
            adicionarCelulaTexto(tr, quantidadeFmt.format(saldoFinal));
            adicionarCelulaTexto(tr, moeda.format(custoReferencia));
            adicionarCelulaTexto(tr, moeda.format(Math.max(0, valorEstoque)));

            tbody.appendChild(tr);
            totalProdutos++;
            valorTotalEstoque += Math.max(0, valorEstoque);
            lucroBrutoEstimado += lucroEstimado;
        });

        elements.relatorioEstoque.totalProdutos.textContent = totalProdutos.toString();
        elements.relatorioEstoque.valorTotalEstoque.textContent = moeda.format(valorTotalEstoque);
        elements.relatorioEstoque.lucroBrutoEstoque.textContent = moeda.format(lucroBrutoEstimado);
        elements.relatorioEstoque.dataRelatorio.textContent = `${formatarDataSimples(dataInicialStr)} a ${formatarDataSimples(dataFinalStr)}`;
    }
    function renderizarTudo() {
        atualizarOpcoesProdutos();
        renderizarProdutos();
        renderizarEntradas();
        renderizarVendas();
        atualizarDashboard();
        renderizarEstoque();
        atualizarMovimentacaoDia();
        renderizarHistorico();
    }

    function atualizarOpcoesProdutos() {
        const selects = [elements.entradaProduto, elements.vendaProduto];
        const produtosOrdenados = [...state.produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
        const temProdutos = produtosOrdenados.length > 0;

        selects.forEach(select => {
            select.innerHTML = '';
            if (!temProdutos) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Cadastre um produto primeiro';
                select.appendChild(option);
                select.disabled = true;
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Selecione';
                option.disabled = true;
                option.selected = true;
                select.appendChild(option);
                produtosOrdenados.forEach(prod => {
                    const opt = document.createElement('option');
                    opt.value = prod.id;
                    opt.textContent = `${prod.nome} (${prod.unidade})`;
                    select.appendChild(opt);
                });
                select.disabled = false;
            }
        });

        const controlesEntrada = elements.entradaForm.querySelectorAll('button, input, select');
        const controlesVenda = elements.vendaForm.querySelectorAll('button, input, select');
        [...controlesEntrada].forEach(ctrl => {
            if (ctrl !== elements.entradaProduto) {
                ctrl.disabled = !temProdutos;
            }
        });
        [...controlesVenda].forEach(ctrl => {
            if (ctrl !== elements.vendaProduto) {
                ctrl.disabled = !temProdutos;
            }
        });

        if (elements.leitorCodigo) {
            if (!temProdutos) {
                elements.leitorCodigo.value = '';
                elements.leitorCodigo.placeholder = 'Cadastre um produto para usar o leitor';
            } else {
                elements.leitorCodigo.placeholder = 'Escaneie o codigo aqui';
            }
            elements.leitorCodigo.disabled = false;
        }
        if (elements.focarLeitor) {
            elements.focarLeitor.disabled = false;
        }
        if (elements.limparLeitor) {
            elements.limparLeitor.disabled = false;
        }

        if (temProdutos) {
            agendarFocoLeitor(150);
        } else {
            cancelarFocoLeitor();
        }
    }

    function renderizarProdutos() {
        const tbody = elements.produtosTabela;
        tbody.innerHTML = '';

        const estoqueMapa = calcularEstoqueDetalhado();
        const produtosOrdenados = [...state.produtos]
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

        const buscaTexto = termoBuscaProdutos;
        const buscaCodigo = buscaTexto.replace(/\s+/g, '');
        const filtrados = buscaTexto
            ? produtosOrdenados.filter(prod => {
                const nomeNormalizado = normalizarTexto(prod.nome);
                const codigoNormalizado = normalizarCodigoBarras(prod.codigoBarras);
                return nomeNormalizado.includes(buscaTexto) || (codigoNormalizado && codigoNormalizado.includes(buscaCodigo));
            })
            : produtosOrdenados;

        if (filtrados.length === 0) {
            elements.produtosEmpty.hidden = false;
            return;
        }

        elements.produtosEmpty.hidden = true;

        filtrados.forEach(prod => {
            const tr = document.createElement('tr');
            if (produtoEmEdicao === prod.id) {
                tr.classList.add('editing');
            }

            const estoqueInfo = estoqueMapa.get(prod.id);
            const quantidadeAtual = estoqueInfo ? estoqueInfo.quantidade : 0;

            adicionarCelulaTexto(tr, prod.nome);
            adicionarCelulaTexto(tr, prod.codigoBarras || '-');
            adicionarCelulaTexto(tr, prod.unidade);
            adicionarCelulaTexto(tr, moeda.format(prod.precoCusto));
            adicionarCelulaTexto(tr, moeda.format(prod.precoVenda));
            adicionarCelulaTexto(tr, quantidadeFmt.format(quantidadeAtual));

            const acoesTd = document.createElement('td');
            const editarBtn = criarBotaoTabela('Editar', () => iniciarEdicaoProduto(prod.id));
            const excluirBtn = criarBotaoTabela('Excluir', () => excluirProduto(prod.id));
            acoesTd.appendChild(editarBtn);
            acoesTd.appendChild(excluirBtn);
            tr.appendChild(acoesTd);

            tbody.appendChild(tr);
        });
    }

    function buscarProdutoPorCodigo(codigo) {
        const normalizado = normalizarCodigoBarras(codigo);
        if (!normalizado) {
            return null;
        }
        return state.produtos.find(prod => normalizarCodigoBarras(prod.codigoBarras) === normalizado) || null;
    }

    function renderizarEntradas() {
        const tbody = elements.entradasTabela;
        tbody.innerHTML = '';
        const registros = [...state.entradas]
            .sort((a, b) => (b.criadoEm || Date.parse(b.data)) - (a.criadoEm || Date.parse(a.data)));

        if (registros.length === 0) {
            elements.entradasEmpty.hidden = false;
            return;
        }

        elements.entradasEmpty.hidden = true;

        registros.forEach(item => {
            const tr = document.createElement('tr');
            adicionarCelulaTexto(tr, formatarDataCompleta(item.data, item.criadoEm));
            adicionarCelulaTexto(tr, item.produtoNome);
            adicionarCelulaTexto(tr, `${quantidadeFmt.format(item.quantidade)} ${item.unidade}`);
            adicionarCelulaTexto(tr, moeda.format(item.valorTotal));
            tbody.appendChild(tr);
        });
    }

    function renderizarVendas() {
        const tbody = elements.vendasTabela;
        tbody.innerHTML = '';
        const registros = [...state.vendas]
            .sort((a, b) => (b.criadoEm || Date.parse(b.data)) - (a.criadoEm || Date.parse(a.data)));

        if (registros.length === 0) {
            elements.vendasEmpty.hidden = false;
            return;
        }

        elements.vendasEmpty.hidden = true;

        registros.forEach(item => {
            const tr = document.createElement('tr');
            adicionarCelulaTexto(tr, formatarDataCompleta(item.data, item.criadoEm));
            adicionarCelulaTexto(tr, item.produtoNome);
            adicionarCelulaTexto(tr, `${quantidadeFmt.format(item.quantidade)} ${item.unidade}`);
            adicionarCelulaTexto(tr, moeda.format(item.valorTotal));
            tbody.appendChild(tr);
        });
    }
    function atualizarDashboard() {
        const hoje = obterDataHoje();
        const totalEntradas = state.entradas
            .filter(item => item.data === hoje)
            .reduce((total, item) => total + item.valorTotal, 0);
        const totalVendas = state.vendas
            .filter(item => item.data === hoje)
            .reduce((total, item) => total + item.valorTotal, 0);

        elements.dashboard.comprasHoje.textContent = moeda.format(totalEntradas);
        elements.dashboard.vendasHoje.textContent = moeda.format(totalVendas);
        elements.dashboard.saldoCaixa.textContent = moeda.format(totalVendas - totalEntradas);

        const estoqueMapa = calcularEstoqueDetalhado();
        const alertas = [...estoqueMapa.values()].filter(item => item.quantidade > 0 && item.quantidade <= ESTOQUE_ALERTA);
        elements.dashboard.baixoEstoque.textContent = alertas.length.toString();
        atualizarAlertaEstoque(alertas);
    }

    function atualizarAlertaEstoque(alertas) {
        if (!alertas.length) {
            elements.alertaEstoque.hidden = true;
            elements.alertaEstoque.innerHTML = '';
            return;
        }

        const lista = document.createElement('ul');
        alertas.forEach(item => {
            const nome = item.produto?.nome || item.nome || 'Produto';
            const li = document.createElement('li');
            li.textContent = `${nome}: ${quantidadeFmt.format(item.quantidade)} ${item.unidade}`;
            lista.appendChild(li);
        });
        elements.alertaEstoque.innerHTML = '';
        elements.alertaEstoque.appendChild(lista);
        elements.alertaEstoque.hidden = false;
    }

    function renderizarEstoque() {
        const tbody = elements.relatorios.estoqueTabela;
        tbody.innerHTML = '';
        const estoqueMapa = calcularEstoqueDetalhado();
        const itens = [...estoqueMapa.values()].sort((a, b) => {
            const nomeA = (a.produto?.nome || a.nome || '').toLowerCase();
            const nomeB = (b.produto?.nome || b.nome || '').toLowerCase();
            return nomeA.localeCompare(nomeB, 'pt-BR');
        });

        if (itens.length === 0) {
            elements.relatorios.estoqueEmpty.hidden = false;
            return;
        }

        elements.relatorios.estoqueEmpty.hidden = true;

        itens.forEach(item => {
            const tr = document.createElement('tr');
            const nome = item.produto?.nome || item.nome || 'Produto removido';
            const unidade = item.produto?.unidade || item.unidade || '-';
            const custoReferencia = item.produto?.precoCusto ?? item.custoReferencia ?? 0;
            const valorEstoque = arredondar(item.quantidade * custoReferencia);
            const status = item.quantidade <= 0 ? 'Zerado' : item.quantidade <= ESTOQUE_ALERTA ? 'Baixo' : 'OK';

            adicionarCelulaTexto(tr, nome);
            adicionarCelulaTexto(tr, unidade);
            adicionarCelulaTexto(tr, quantidadeFmt.format(item.quantidade));
            adicionarCelulaTexto(tr, moeda.format(Math.max(0, valorEstoque)));

            const statusTd = document.createElement('td');
            statusTd.textContent = status;
            statusTd.className = `status status-${status.toLowerCase()}`;
            tr.appendChild(statusTd);

            tbody.appendChild(tr);
        });
    }

    function atualizarMovimentacaoDia() {
        const dataSelecionada = elements.relatorios.data.value || obterDataHoje();
        if (!elements.relatorios.data.value) {
            elements.relatorios.data.value = dataSelecionada;
        }

        const entradasDia = state.entradas.filter(item => item.data === dataSelecionada);
        const vendasDia = state.vendas.filter(item => item.data === dataSelecionada);

        preencherTabelaSimples(elements.relatorios.entradasLista, elements.relatorios.entradasEmpty, entradasDia, item => [
            item.produtoNome,
            `${quantidadeFmt.format(item.quantidade)} ${item.unidade}`,
            moeda.format(item.valorTotal)
        ]);

        preencherTabelaSimples(elements.relatorios.vendasLista, elements.relatorios.vendasEmpty, vendasDia, item => [
            item.produtoNome,
            `${quantidadeFmt.format(item.quantidade)} ${item.unidade}`,
            moeda.format(item.valorTotal)
        ]);

        const totalEntradas = entradasDia.reduce((total, item) => total + item.valorTotal, 0);
        const totalVendas = vendasDia.reduce((total, item) => total + item.valorTotal, 0);
        const lucroBruto = vendasDia.reduce((total, item) => total + (item.valorTotal - arredondar(item.quantidade * item.precoCusto)), 0);

        elements.relatorios.totalEntradasDia.textContent = moeda.format(totalEntradas);
        elements.relatorios.totalVendasDia.textContent = moeda.format(totalVendas);
        elements.relatorios.saldoDia.textContent = moeda.format(totalVendas - totalEntradas);
        elements.relatorios.lucroDia.textContent = moeda.format(lucroBruto);
    }

    function renderizarHistorico() {
        const filtroData = elements.relatorios.filtroHistorico.value;
        const registros = [
            ...state.entradas.map(item => ({ ...item, tipo: 'Entrada' })),
            ...state.vendas.map(item => ({ ...item, tipo: 'Venda' }))
        ].sort((a, b) => (b.criadoEm || Date.parse(b.data)) - (a.criadoEm || Date.parse(a.data)));

        const tbody = elements.relatorios.historicoTabela;
        tbody.innerHTML = '';

        const filtrados = filtroData ? registros.filter(item => item.data === filtroData) : registros;

        if (filtrados.length === 0) {
            elements.relatorios.historicoEmpty.hidden = false;
            return;
        }

        elements.relatorios.historicoEmpty.hidden = true;

        filtrados.forEach(item => {
            const tr = document.createElement('tr');
            adicionarCelulaTexto(tr, formatarDataCompleta(item.data, item.criadoEm));
            adicionarCelulaTexto(tr, item.tipo);
            adicionarCelulaTexto(tr, item.produtoNome);
            adicionarCelulaTexto(tr, `${quantidadeFmt.format(item.quantidade)} ${item.unidade}`);
            adicionarCelulaTexto(tr, moeda.format(item.valorTotal));
            tbody.appendChild(tr);
        });
    }

    function preencherTabelaSimples(tbody, mensagemEmpty, dados, extrairColunas) {
        tbody.innerHTML = '';
        if (dados.length === 0) {
            mensagemEmpty.hidden = false;
            return;
        }
        mensagemEmpty.hidden = true;
        dados.forEach(item => {
            const tr = document.createElement('tr');
            extrairColunas(item).forEach(texto => {
                adicionarCelulaTexto(tr, texto);
            });
            tbody.appendChild(tr);
        });
    }
    function onSubmitProduto(event) {
        event.preventDefault();
        const nome = elements.produtoNome.value.trim();
        const marca = elements.produtoMarca.value.trim();
        const codigoBarras = normalizarCodigoBarras(elements.produtoCodigo.value);
        const unidade = elements.produtoUnidade.value;
        const precoCusto = toNumber(elements.produtoCusto.value);
        const precoVenda = toNumber(elements.produtoVenda.value);

        elements.produtoCodigo.value = codigoBarras;

        if (!nome || !unidade) {
            mostrarToast('Preencha nome e unidade.', 'alert');
            return;
        }
if (precoCusto < 0 || precoVenda < 0) {
            mostrarToast('Valores negativos não são permitidos.', 'alert');
            return;
        }
        if (precoVenda < precoCusto) {
            mostrarToast('Preço de venda está abaixo do custo.', 'alert');
        }

        const chave = normalizarChave(nome, unidade);
        const jaExiste = state.produtos.some(prod => normalizarChave(prod.nome, prod.unidade) === chave && prod.id !== produtoEmEdicao);
        if (jaExiste) {
            mostrarToast('Este produto já está cadastrado.', 'alert');
            return;
        }

        if (codigoBarras) {
            const codigoDuplicado = state.produtos.some(prod => normalizarCodigoBarras(prod.codigoBarras) === codigoBarras && prod.id !== produtoEmEdicao);
            if (codigoDuplicado) {
                mostrarToast('Código de barras já utilizado em outro produto.', 'alert');
                focarCampoCodigoProduto();
                return;
            }
        }

        if (produtoEmEdicao) {
            const produto = state.produtos.find(p => p.id === produtoEmEdicao);
            if (!produto) {
                produtoEmEdicao = null;
                mostrarToast('Produto não encontrado para edição.', 'alert');
                return;
            }
            produto.nome = nome;
            produto.marca = marca;
            produto.codigoBarras = codigoBarras;
            produto.unidade = unidade;
            produto.precoCusto = arredondar(precoCusto);
            produto.precoVenda = arredondar(precoVenda);
            produto.atualizadoEm = Date.now();
            mostrarToast('Produto atualizado com sucesso!', 'success');
        } else {
            const novoProduto = {
                id: gerarId(),
                nome,
                marca,
                codigoBarras,
                unidade,
                precoCusto: arredondar(precoCusto),
                precoVenda: arredondar(precoVenda),
                criadoEm: Date.now(),
                atualizadoEm: Date.now()
            };
            state.produtos.push(novoProduto);
            mostrarToast('Produto cadastrado!', 'success');
        }

        salvarColecao('produtos', state.produtos);
        produtoEmEdicao = null;
        elements.produtoForm.reset();
        elements.produtoCodigo.value = '';
        elements.produtoCodigo.value = '';
        elements.cancelarEdicao.hidden = true;
        atualizarOpcoesProdutos();
        renderizarProdutos();
    }

    function focarCampoCodigoProduto() {
        if (!elements.produtoCodigo) {
            return;
        }
        elements.produtoCodigo.focus();
        elements.produtoCodigo.select();
    }

    function iniciarEdicaoProduto(id) {
        const produto = state.produtos.find(p => p.id === id);
        if (!produto) {
            mostrarToast('Produto não encontrado.', 'alert');
            return;
        }
        produtoEmEdicao = id;
        elements.produtoNome.value = produto.nome;
        elements.produtoMarca.value = produto.marca || '';
        elements.produtoCodigo.value = produto.codigoBarras || '';
        elements.produtoUnidade.value = produto.unidade;
        elements.produtoCusto.value = produto.precoCusto;
        elements.produtoVenda.value = produto.precoVenda;
        elements.cancelarEdicao.hidden = false;
        elements.produtoNome.focus();
        renderizarProdutos();
    }

    function cancelarEdicaoProduto() {
        produtoEmEdicao = null;
        elements.cancelarEdicao.hidden = true;
        elements.produtoForm.reset();
        elements.produtoCodigo.value = '';
        renderizarProdutos();
    }

    function excluirProduto(id) {
        const possuiMovimentacao = state.entradas.some(item => item.produtoId === id) || state.vendas.some(item => item.produtoId === id);
        if (possuiMovimentacao) {
            mostrarToast('Não é possível excluir: produto com movimentações registradas.', 'alert');
            return;
        }
        const produto = state.produtos.find(p => p.id === id);
        if (!produto) {
            mostrarToast('Produto já removido.', 'alert');
            return;
        }
        const confirmacao = window.confirm(`Excluir o produto "${produto.nome}"?`);
        if (!confirmacao) return;

        state.produtos = state.produtos.filter(p => p.id !== id);
        salvarColecao('produtos', state.produtos);
        mostrarToast('Produto removido.', 'success');
        cancelarEdicaoProduto();
        atualizarOpcoesProdutos();
        renderizarProdutos();
    }

    function onSubmitEntrada(event) {
        event.preventDefault();
        const produtoId = elements.entradaProduto.value;
        const quantidade = toNumber(elements.entradaQuantidade.value);
        const data = elements.entradaData.value || obterDataHoje();

        if (!produtoId) {
            mostrarToast('Selecione um produto.', 'alert');
            return;
        }
        if (quantidade <= 0) {
            mostrarToast('Informe uma quantidade válida.', 'alert');
            return;
        }

        const produto = state.produtos.find(p => p.id === produtoId);
        if (!produto) {
            mostrarToast('Produto inválido.', 'alert');
            return;
        }

        const precoUnitario = produto.precoCusto;
        const valorTotal = arredondar(quantidade * precoUnitario);

        const registro = {
            id: gerarId(),
            produtoId,
            produtoNome: produto.nome,
            unidade: produto.unidade,
            precoUnitario,
            quantidade,
            valorTotal,
            data,
            criadoEm: Date.now()
        };

        state.entradas.push(registro);
        salvarColecao('entradas', state.entradas);

        mostrarToast('Entrada registrada!', 'success');
        elements.entradaForm.reset();
        elements.entradaData.value = data;
        atualizarResumoEntrada();
        renderizarEntradas();
        atualizarDashboard();
        atualizarMovimentacaoDia();
        renderizarEstoque();
        renderizarHistorico();
    }

    function registrarVenda({ produtoId, quantidade, data, origem = 'manual', emitirSucessoPadrao = true, mensagemSucesso = null }) {
        if (!produtoId) {
            mostrarToast('Selecione um produto.', 'alert');
            return { ok: false, motivo: 'produto' };
        }
        const produto = state.produtos.find(p => p.id === produtoId);
        if (!produto) {
            mostrarToast('Produto inválido.', 'alert');
            return { ok: false, motivo: 'produto' };
        }

        const quantidadeNormalizada = arredondar(quantidade);
        if (!Number.isFinite(quantidadeNormalizada) || quantidadeNormalizada <= 0) {
            mostrarToast('Informe uma quantidade válida.', 'alert');
            return { ok: false, motivo: 'quantidade' };
        }

        const estoqueMapa = calcularEstoqueDetalhado();
        const estoqueAtual = estoqueMapa.get(produtoId)?.quantidade || 0;
        if (quantidadeNormalizada > estoqueAtual) {
            mostrarToast(`Estoque insuficiente. Disponível: ${estoqueAtual}`, 'alert');
            return { ok: false, motivo: 'estoque', estoqueAtual };
        }

        const precoUnitario = produto.precoVenda;
        const valorTotal = arredondar(quantidadeNormalizada * precoUnitario);
        const registro = {
            id: gerarId(),
            produtoId,
            produtoNome: produto.nome,
            unidade: produto.unidade,
            precoVenda: precoUnitario,
            precoCusto: produto.precoCusto,
            quantidade: quantidadeNormalizada,
            valorTotal,
            data,
            origem,
            criadoEm: Date.now()
        };

        state.vendas.push(registro);
        salvarColecao('vendas', state.vendas);

        const estoqueRestante = arredondar(estoqueAtual - quantidadeNormalizada);
        if (mensagemSucesso != null || emitirSucessoPadrao) {
            const texto = mensagemSucesso ?? 'Venda registrada!';
            mostrarToast(texto, 'success');
        }

        renderizarVendas();
        atualizarDashboard();
        atualizarMovimentacaoDia();
        renderizarEstoque();
        renderizarHistorico();

        return { ok: true, registro, produto, estoqueRestante };
    }

        function onSubmitVenda(event) {
        event.preventDefault();
        const produtoId = elements.vendaProduto.value;
        const quantidade = toNumber(elements.vendaQuantidade.value);
        const data = elements.vendaData.value || obterDataHoje();

        const resultado = registrarVenda({
            produtoId,
            quantidade,
            data,
            origem: 'manual',
            emitirSucessoPadrao: true
        });

        if (!resultado.ok) {
            return;
        }

        elements.vendaForm.reset();
        elements.vendaData.value = data;
        atualizarResumoVenda();
        agendarFocoLeitor(120);
    }

    function onLeitorCodigoKeyDown(event) {
        if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            processarCodigoDoLeitor();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            limparLeitor();
        }
    }

    function processarCodigoDoLeitor() {
        if (!elements.leitorCodigo) {
            return;
        }
        const codigo = normalizarCodigoBarras(elements.leitorCodigo.value);
        elements.leitorCodigo.value = '';

        if (!codigo) {
            agendarFocoLeitor(80);
            return;
        }

        const produto = buscarProdutoPorCodigo(codigo);
        if (!produto) {
            mostrarToast(`Produto não encontrado para o código ${codigo}.`, 'alert');
            agendarFocoLeitor(140);
            return;
        }

        const dataVenda = elements.vendaData.value || obterDataHoje();
        const resultado = registrarVenda({
            produtoId: produto.id,
            quantidade: 1,
            data: dataVenda,
            origem: 'leitor',
            emitirSucessoPadrao: false,
            mensagemSucesso: null
        });

        if (!resultado.ok) {
            agendarFocoLeitor(140);
            return;
        }

        const restanteTexto = quantidadeFmt.format(Math.max(resultado.estoqueRestante, 0));
        const mensagem = `Venda rápida: ${produto.nome}. Restante: ${restanteTexto}.`;
        mostrarToast(mensagem, 'success');

        elements.vendaProduto.value = produto.id;
        elements.vendaQuantidade.value = '1';
        atualizarResumoVenda();
        agendarFocoLeitor(160);
    }

    function focarLeitor(selecionar = false) {
        if (!elements.leitorCodigo) {
            return;
        }
        cancelarFocoLeitor();
        const vendasSecao = document.getElementById('vendas');
        if (!vendasSecao || !vendasSecao.classList.contains('active') || elements.leitorCodigo.disabled) {
            return;
        }
        window.setTimeout(() => {
            try {
                elements.leitorCodigo.focus();
                if (selecionar) {
                    elements.leitorCodigo.select();
                }
            } catch (erro) {
                console.warn('Não foi possível focar o leitor de código.', erro);
            }
        }, 0);
    }

    function agendarFocoLeitor(delay = 120) {
        if (!elements.leitorCodigo) {
            return;
        }
        cancelarFocoLeitor();
        leitorFocusTimeoutId = window.setTimeout(() => {
            const ativo = document.activeElement;
            if (ativo && ativo !== document.body && ativo !== elements.leitorCodigo) {
                return;
            }
            focarLeitor(false);
        }, delay);
    }

    function cancelarFocoLeitor() {
        if (leitorFocusTimeoutId != null) {
            clearTimeout(leitorFocusTimeoutId);
            leitorFocusTimeoutId = null;
        }
    }

    function limparLeitor() {
        if (!elements.leitorCodigo) {
            return;
        }
        elements.leitorCodigo.value = '';
        focarLeitor(true);
    }
    function atualizarResumoEntrada() {
        const produto = state.produtos.find(p => p.id === elements.entradaProduto.value);
        const quantidade = toNumber(elements.entradaQuantidade.value);
        const preco = produto ? produto.precoCusto : 0;
        elements.entradaCustoUnitario.textContent = moeda.format(preco);
        elements.entradaValorTotal.textContent = moeda.format(arredondar(preco * quantidade));
    }

    function atualizarResumoVenda() {
        const produto = state.produtos.find(p => p.id === elements.vendaProduto.value);
        const quantidade = toNumber(elements.vendaQuantidade.value);
        const preco = produto ? produto.precoVenda : 0;
        elements.vendaPrecoUnitario.textContent = moeda.format(preco);
        elements.vendaValorTotal.textContent = moeda.format(arredondar(preco * quantidade));
    }
    function calcularEstoqueDetalhado() {
        const mapa = new Map();
        state.produtos.forEach(prod => {
            mapa.set(prod.id, {
                produto: prod,
                nome: prod.nome,
                unidade: prod.unidade,
                quantidade: 0,
                custoReferencia: prod.precoCusto
            });
        });

        state.entradas.forEach(item => {
            if (!mapa.has(item.produtoId)) {
                mapa.set(item.produtoId, {
                    produto: null,
                    nome: item.produtoNome,
                    unidade: item.unidade,
                    quantidade: 0,
                    custoReferencia: item.precoUnitario
                });
            }
            const alvo = mapa.get(item.produtoId);
            alvo.quantidade = arredondar(alvo.quantidade + item.quantidade);
            if (!alvo.custoReferencia) {
                alvo.custoReferencia = item.precoUnitario;
            }
        });

        state.vendas.forEach(item => {
            if (!mapa.has(item.produtoId)) {
                mapa.set(item.produtoId, {
                    produto: null,
                    nome: item.produtoNome,
                    unidade: item.unidade,
                    quantidade: 0,
                    custoReferencia: item.precoCusto
                });
            }
            const alvo = mapa.get(item.produtoId);
            alvo.quantidade = arredondar(alvo.quantidade - item.quantidade);
            if (!alvo.custoReferencia) {
                alvo.custoReferencia = item.precoCusto;
            }
        });

        return mapa;
    }

    function exportarEstoque() {
        const estoqueMapa = calcularEstoqueDetalhado();
        const dados = [...estoqueMapa.values()].map(item => ({
            produto: item.produto?.nome || item.nome,
            unidade: item.produto?.unidade || item.unidade,
            quantidade: item.quantidade,
            valorEstimado: arredondar(item.quantidade * (item.produto?.precoCusto ?? item.custoReferencia ?? 0))
        }));
        const conteudo = JSON.stringify({
            geradoEm: new Date().toISOString(),
            estoque: dados
        }, null, 2);
        downloadArquivo(conteudo, 'pdv-simples-estoque.json');
        mostrarToast('Estoque exportado!', 'success');
    }

    function exportarRelatorioExcel() {
        const estoqueMapa = calcularEstoqueDetalhado();
        const itensEstoque = [...estoqueMapa.values()].map(item => ({
            nome: item.produto?.nome || item.nome || 'Produto',
            unidade: item.produto?.unidade || item.unidade || '-',
            quantidade: arredondar(item.quantidade),
            custoReferencia: item.produto?.precoCusto ?? item.custoReferencia ?? 0,
            status: item.quantidade <= 0 ? 'Zerado' : item.quantidade <= ESTOQUE_ALERTA ? 'Baixo' : 'OK'
        })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

        const entradasOrdenadas = [...state.entradas].sort((a, b) => (b.criadoEm || Date.parse(b.data)) - (a.criadoEm || Date.parse(a.data)));
        const vendasOrdenadas = [...state.vendas].sort((a, b) => (b.criadoEm || Date.parse(b.data)) - (a.criadoEm || Date.parse(a.data)));

        const totalEstoque = itensEstoque.reduce((total, item) => total + Math.max(0, item.quantidade) * item.custoReferencia, 0);
        const totalEntradas = state.entradas.reduce((total, item) => total + item.valorTotal, 0);
        const totalVendas = state.vendas.reduce((total, item) => total + item.valorTotal, 0);
        const totalLucro = state.vendas.reduce((total, item) => total + (item.valorTotal - arredondar(item.quantidade * item.precoCusto)), 0);
        const saldoCaixa = totalVendas - totalEntradas;

        const produtosCadastrados = state.produtos.length;
        const itensBaixoEstoque = itensEstoque.filter(item => item.quantidade > 0 && item.quantidade <= ESTOQUE_ALERTA).length;

        const estoqueLinhas = itensEstoque.map(item => [
            item.nome,
            item.unidade,
            quantidadeFmt.format(item.quantidade),
            moeda.format(Math.max(0, arredondar(item.quantidade * item.custoReferencia))),
            item.status
        ]);

        const entradasLinhas = entradasOrdenadas.map(item => [
            formatarDataSimples(item.data),
            item.produtoNome,
            `${quantidadeFmt.format(item.quantidade)} ${item.unidade}`,
            moeda.format(item.valorTotal)
        ]);

        const vendasLinhas = vendasOrdenadas.map(item => [
            formatarDataSimples(item.data),
            item.produtoNome,
            `${quantidadeFmt.format(item.quantidade)} ${item.unidade}`,
            moeda.format(item.valorTotal),
            moeda.format(arredondar(item.valorTotal - item.quantidade * item.precoCusto))
        ]);

        const estoqueRodape = estoqueLinhas.length ? ['Total', '', '', moeda.format(Math.max(0, arredondar(totalEstoque))), ''] : null;
        const entradasRodape = entradasLinhas.length ? ['Total', '', '', moeda.format(totalEntradas)] : null;
        const vendasRodape = vendasLinhas.length ? ['Total', '', '', moeda.format(totalVendas), moeda.format(totalLucro)] : null;

        const agora = new Date();
        const dataArquivo = obterDataHoje().replace(/-/g, '');
        const resumoHtml = gerarResumoExcel([
            { titulo: 'Vendas totais', valor: moeda.format(totalVendas) },
            { titulo: 'Compras totais', valor: moeda.format(totalEntradas) },
            { titulo: 'Saldo do caixa', valor: moeda.format(saldoCaixa) },
            { titulo: 'Lucro bruto', valor: moeda.format(totalLucro) },
            { titulo: 'Produtos cadastrados', valor: produtosCadastrados.toString() },
            { titulo: 'Itens com estoque baixo', valor: itensBaixoEstoque.toString() }
        ]);

        const estilo = `
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f1a09; background: #fffdf2; padding: 32px; }
                h1 { font-size: 26px; margin-bottom: 6px; }
                .generated-date { color: #6f6652; margin-bottom: 24px; }
                .summary { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }
                .summary-item { background: #fff8c7; border: 1px solid #f4e4a5; border-radius: 12px; padding: 12px 18px; min-width: 180px; }
                .summary-item span { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: #6f6652; margin-bottom: 6px; }
                .summary-item strong { font-size: 1.1rem; }
                .summary-item small { display: block; margin-top: 4px; color: #6f6652; font-size: 0.7rem; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
                caption { text-align: left; font-size: 1.2rem; font-weight: 700; margin-bottom: 10px; color: #1f1a09; }
                th { background: #ffeaa7; border: 1px solid #f4e4a5; padding: 10px 12px; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem; }
                td { border: 1px solid #f4e4a5; padding: 9px 12px; }
                tbody tr:nth-child(even) { background: #fffdf2; }
                tfoot td { background: #fff3b0; font-weight: 700; }
                .empty { text-align: center; font-style: italic; color: #6f6652; padding: 16px 12px; }
            </style>
        `;

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório PDV Simples</title>
${estilo}
</head>
<body>
    <h1>Relatório geral - PDV Simples</h1>
    <p class="generated-date">Gerado em ${escapeHtml(dataFmt.format(agora))} às ${escapeHtml(horaFmt.format(agora))}</p>
    ${resumoHtml}
    ${gerarTabelaExcel('Estoque atual', ['Produto', 'Unidade', 'Quantidade', 'Valor em estoque', 'Status'], estoqueLinhas, estoqueRodape)}
    ${gerarTabelaExcel('Entradas registradas', ['Data', 'Produto', 'Quantidade', 'Valor'], entradasLinhas, entradasRodape)}
    ${gerarTabelaExcel('Vendas registradas', ['Data', 'Produto', 'Quantidade', 'Valor', 'Lucro'], vendasLinhas, vendasRodape)}
</body>
</html>`;

        downloadArquivo(html, `pdv-simples-relatorio-${dataArquivo}.xls`, 'application/vnd.ms-excel');
        mostrarToast('Relatório em Excel exportado!', 'success');
    }

    function exportarBackupJson() {
        const backup = {
            metadata: {
                geradoEm: new Date().toISOString(),
                versao: 1
            },
            produtos: state.produtos,
            entradas: state.entradas,
            vendas: state.vendas
        };
        const conteudo = JSON.stringify(backup, null, 2);
        const data = obterDataHoje().replace(/-/g, '');
        downloadArquivo(conteudo, `pdv-simples-backup-${data}.json`);
        mostrarToast('Backup exportado com sucesso!', 'success');
    }

    function importarBackup(event) {
        const arquivo = event.target.files?.[0];
        if (!arquivo) {
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const dados = JSON.parse(e.target.result);
                if (!dados || !Array.isArray(dados.produtos) || !Array.isArray(dados.entradas) || !Array.isArray(dados.vendas)) {
                    throw new Error('Estrutura inválida');
                }
                state.produtos = dados.produtos.map(normalizarProduto);
                state.entradas = dados.entradas.map(normalizarEntrada);
                state.vendas = dados.vendas.map(normalizarVenda);
                garantirEstruturas();
                renderizarTudo();
                mostrarToast('Backup importado!', 'success');
            } catch (erro) {
                console.error(erro);
                mostrarToast('Não foi possível importar o backup.', 'alert');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(arquivo, 'utf-8');
    }

    function escapeHtml(value) {
        const str = value == null ? '' : String(value);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatarDataSimples(dataISO) {
        if (!dataISO) {
            return '';
        }
        const partes = dataISO.split('-');
        if (partes.length !== 3) {
            return dataISO;
        }
        const [ano, mes, dia] = partes;
        if (!ano || !mes || !dia) {
            return dataISO;
        }
        return `${dia}/${mes}/${ano}`;
    }

    function gerarTabelaExcel(titulo, colunas, linhas, rodape = null) {
        const cabecalho = colunas.map(coluna => `<th>${escapeHtml(coluna)}</th>`).join('');
        let corpo = '';
        if (!linhas.length) {
            corpo = `<tr><td class="empty" colspan="${colunas.length}">Sem registros</td></tr>`;
        } else {
            corpo = linhas
                .map(linha => `<tr>${linha.map(celula => `<td>${escapeHtml(celula)}</td>`).join('')}</tr>`)
                .join('');
        }
        let rodapeHtml = '';
        if (rodape && rodape.length) {
            rodapeHtml = `<tfoot><tr>${rodape.map(celula => `<td>${escapeHtml(celula)}</td>`).join('')}</tr></tfoot>`;
        }
        return `<table>
    <caption>${escapeHtml(titulo)}</caption>
    <thead><tr>${cabecalho}</tr></thead>
    <tbody>${corpo}</tbody>
    ${rodapeHtml}
</table>`;
    }

    function gerarResumoExcel(itens) {
        if (!itens || !itens.length) {
            return '';
        }
        const blocos = itens
            .map(item => {
                const descricao = item.descricao ? `<small>${escapeHtml(item.descricao)}</small>` : '';
                return `<div class="summary-item"><span>${escapeHtml(item.titulo)}</span><strong>${escapeHtml(item.valor)}</strong>${descricao}</div>`;
            })
            .join('');
        return `<div class="summary">${blocos}</div>`;
    }

    function downloadArquivo(conteudo, nomeArquivo, tipo = 'application/json') {
        const blob = new Blob([conteudo], { type: tipo });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function adicionarCelulaTexto(tr, texto) {
        const td = document.createElement('td');
        td.textContent = texto;
        tr.appendChild(td);
    }

    function criarBotaoTabela(rotulo, onClick) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'table-btn';
        botao.textContent = rotulo;
        botao.addEventListener('click', onClick);
        return botao;
    }

    function mostrarToast(mensagem, tipo = 'info') {
        clearTimeout(toastTimeoutId);
        elements.toast.textContent = mensagem;
        elements.toast.dataset.type = tipo;
        elements.toast.hidden = false;
        toastTimeoutId = setTimeout(() => {
            ocultarToast();
        }, 3200);
    }

    function ocultarToast() {
        clearTimeout(toastTimeoutId);
        elements.toast.hidden = true;
    }

    function carregarColecao(chave) {
        try {
            const bruto = localStorage.getItem(STORAGE_KEYS[chave]);
            if (!bruto) return [];
            const dados = JSON.parse(bruto);
            return Array.isArray(dados) ? dados : [];
        } catch (erro) {
            console.error('Erro ao carregar dados', chave, erro);
            return [];
        }
    }

    function salvarColecao(chave, dados) {
        try {
            localStorage.setItem(STORAGE_KEYS[chave], JSON.stringify(dados));
        } catch (erro) {
            console.error('Erro ao salvar dados', chave, erro);
            mostrarToast('Não foi possível salvar os dados.', 'alert');
        }
    }

    function normalizarProduto(item = {}) {
        return {
            id: item.id || gerarId(),
            nome: (item.nome || '').toString().trim(),
            codigoBarras: normalizarCodigoBarras(item.codigoBarras ?? item.codigo ?? item.barcode ?? ''),
            unidade: (item.unidade || '').toString().trim(),
            precoCusto: arredondar(toNumber(item.precoCusto ?? item.custo ?? 0)),
            precoVenda: arredondar(toNumber(item.precoVenda ?? item.precoUnitario ?? item.venda ?? 0)),
            criadoEm: typeof item.criadoEm === 'number' ? item.criadoEm : Date.now(),
            atualizadoEm: typeof item.atualizadoEm === 'number' ? item.atualizadoEm : Date.now()
        };
    }

    function normalizarEntrada(item = {}) {
        const quantidade = arredondar(toNumber(item.quantidade));
        const precoUnitario = arredondar(toNumber(item.precoUnitario ?? item.precoCusto ?? 0));
        const valorTotal = arredondar(item.valorTotal != null ? toNumber(item.valorTotal) : quantidade * precoUnitario);
        return {
            id: item.id || gerarId(),
            produtoId: item.produtoId || '',
            produtoNome: (item.produtoNome || '').toString(),
            unidade: (item.unidade || '').toString(),
            precoUnitario,
            quantidade,
            valorTotal,
            data: item.data || item.date || obterDataHoje(),
            criadoEm: typeof item.criadoEm === 'number' ? item.criadoEm : (item.criadoEm ? Date.parse(item.criadoEm) : Date.now())
        };
    }

    function normalizarVenda(item = {}) {
        const quantidade = arredondar(toNumber(item.quantidade));
        const precoVenda = arredondar(toNumber(item.precoVenda ?? item.precoUnitario ?? 0));
        const precoCusto = arredondar(toNumber(item.precoCusto ?? 0));
        const valorTotal = arredondar(item.valorTotal != null ? toNumber(item.valorTotal) : quantidade * precoVenda);
        return {
            id: item.id || gerarId(),
            produtoId: item.produtoId || '',
            produtoNome: (item.produtoNome || '').toString(),
            unidade: (item.unidade || '').toString(),
            precoVenda,
            precoCusto,
            quantidade,
            valorTotal,
            data: item.data || item.date || obterDataHoje(),
            origem: (item.origem || 'manual'),
            criadoEm: typeof item.criadoEm === 'number' ? item.criadoEm : (item.criadoEm ? Date.parse(item.criadoEm) : Date.now())
        };
    }

    function gerarId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }

    function obterDataHoje() {
        const agora = new Date();
        const offset = agora.getTimezoneOffset();
        const ajustada = new Date(agora.getTime() - offset * 60000);
        return ajustada.toISOString().slice(0, 10);
    }

    function definirDatasPadrao() {
        const hoje = obterDataHoje();
        elements.entradaData.value = hoje;
        elements.vendaData.value = hoje;
        elements.relatorios.data.value = hoje;
    }

    function toNumber(valor) {
        const numero = Number.parseFloat(valor);
        return Number.isFinite(numero) ? numero : 0;
    }

    function arredondar(valor) {
        return Math.round((valor + Number.EPSILON) * 1000) / 1000;
    }

    function normalizarTexto(texto) {
        return texto
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[^a-z0-9\s]/g, '')
            .trim();
    }

    function extrairDigitosCodigoBarras(valor) {
        return valor ? valor.toString().replace(/\D/g, '') : '';
    }
    function normalizarCodigoBarras(codigo) {
        return codigo
            ? codigo.toString().trim().replace(/\s+/g, '').toUpperCase()
            : '';
    }

    function normalizarChave(nome, unidade) {
        return `${normalizarTexto(nome)}-${normalizarTexto(unidade)}`;
    }

    function formatarDataCompleta(dataISO, timestamp) {
        const data = dataISO ? new Date(`${dataISO}T00:00:00`) : new Date();
        const textoData = dataFmt.format(data);
        if (!timestamp) {
            return textoData;
        }
        return `${textoData} ${horaFmt.format(new Date(timestamp))}`;
    }
})();
