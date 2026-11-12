(function () {
  "use strict";

  /* ------------------------------------------------------------------
     DADOS DO PROJETO
     Campos "PREENCHER" devem ser substituídos pelos nomes reais da equipe.
     ------------------------------------------------------------------ */
  var PROJETO = {
    nome: "Gestão de Tratativas de Clientes (Sala de arquivos)",
    empresa: "PREENCHER: nome da empresa ou operadora",
    professor: "Prof. Dr. Diego Carvalho",
    escopo: "Sistema web (Flask) para controlar processos (tratativas) de clientes de planos de saúde. Cada processo pertence a uma de cinco pastas por tipo (agendar consulta, cancelamento, inclusão, exclusão e alteração cadastral) e possui status Andamento, Atrasado ou Concluído. O modelo de dados sustenta o cadastro com validação de CPF/CNPJ, o histórico de atualizações, os alertas de processos parados ou atrasados com prazos configuráveis, o arquivamento e a reabertura de processos concluídos, o controle de acesso por perfis (admin e operador), a proteção contra força bruta no login e a trilha de auditoria exigida pela LGPD.",
    tecnologia: "SQLite (desenvolvimento) e PostgreSQL (produção). Tipos e tamanhos deste dicionário seguem o esquema PostgreSQL (SCHEMA_POSTGRES em db.py); no SQLite, textos são TEXT sem limite e chaves são INTEGER PRIMARY KEY AUTOINCREMENT.",
    responsaveis: [
      { nome: "PREENCHER: nome do integrante 1", papel: "Data Owner (Regras de Negócio)" },
      { nome: "PREENCHER: nome do integrante 2", papel: "Data Steward (Qualidade Técnica e Dicionário)" }
    ]
  };

  /* ------------------------------------------------------------------
     DICIONÁRIO: 6 tabelas / 38 colunas, conforme db.py (SCHEMA_POSTGRES)
     ------------------------------------------------------------------ */
  var TABELAS = [
    {
      nome: "usuarios",
      titulo: "Usuários do sistema",
      descricao: "Contas de acesso à aplicação. Cada conta tem um perfil (admin ou operador) que define o que ela pode fazer. Somente contas com ativo = 1 conseguem entrar. A senha mínima é de 10 caracteres e é armazenada apenas como hash (scrypt, via Werkzeug).",
      acesso: "Sem tela de consulta. Criação via CLI (flask --app app create-user) ou bootstrap do primeiro admin. Leitura e escrita direta: DBA.",
      colunas: [
        {
          nome: "id", tipo: "INTEGER", tipoNota: "SERIAL (PostgreSQL); INTEGER PRIMARY KEY AUTOINCREMENT (SQLite)",
          cons: ["PK", "NOT NULL"], priv: "N/A", privNota: "Identificador técnico.",
          desc: "Identificador único e sequencial do usuário. Gerado automaticamente pelo banco.",
          origem: "Gerado pelo SGBD no INSERT (bootstrap do admin ou CLI create-user).",
          destino: "Referenciado por processos.criado_por; usado na sessão para recarregar o usuário logado.",
          rbac: "Sistema (leitura); DBA"
        },
        {
          nome: "username", tipo: "VARCHAR(100)", tipoNota: "TEXT COLLATE NOCASE (SQLite)",
          cons: ["UNIQUE", "NOT NULL"], priv: "DP", privNota: "Identifica o funcionário que usa o sistema.",
          desc: "Nome de login do usuário. Único no sistema. No SQLite a unicidade ignora maiúsculas e minúsculas; no PostgreSQL do DDL, não.",
          origem: "Informado no bootstrap (ADMIN_USERNAME) ou na CLI create-user.",
          destino: "Autenticação; exibido na barra superior; gravado como texto em atualizacoes.usuario e auditoria.usuario.",
          rbac: "Sistema (leitura); DBA. O próprio usuário vê o seu nome na interface."
        },
        {
          nome: "password_hash", tipo: "TEXT", tipoNota: "Mesmo tipo no SQLite",
          cons: ["NOT NULL"], priv: "DP", privNota: "Credencial de funcionário armazenada apenas como hash.",
          desc: "Hash da senha (scrypt/Werkzeug). A senha em texto puro nunca é gravada. Senha mínima de 10 caracteres validada antes do hash.",
          origem: "Gerado por generate_password_hash a partir da senha informada no bootstrap, no .env (ADMIN_PASSWORD) ou na CLI.",
          destino: "Comparado com check_password_hash no login. Nunca exibido em tela nem retornado pela API.",
          rbac: "Sistema (somente verificação); DBA. Nenhum perfil de aplicação lê o valor."
        },
        {
          nome: "role", tipo: "VARCHAR(20)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL", "DEFAULT 'operador'", "CHECK (role IN ('admin', 'operador'))"], priv: "N/A", privNota: "Atributo de autorização, sem identificar pessoa.",
          desc: "Perfil do usuário. admin: altera prazos, exclui definitivamente processos concluídos e revela senhas de clientes (REVEAL_ROLES). operador: opera os processos.",
          origem: "Parâmetro --role da CLI create-user; o bootstrap cria o primeiro como admin.",
          destino: "Decorators admin_required e verificação REVEAL_ROLES em api.py.",
          rbac: "Sistema (leitura); DBA (alteração)"
        },
        {
          nome: "ativo", tipo: "INTEGER", tipoNota: "Booleano 0/1. Mesmo tipo no SQLite",
          cons: ["NOT NULL", "DEFAULT 1"], priv: "N/A", privNota: "Indicador técnico.",
          desc: "Indica se a conta está ativa (1) ou inativa (0). Contas inativas não conseguem autenticar nem manter sessão.",
          origem: "Valor padrão 1 na criação; alteração apenas por DBA.",
          destino: "Filtro ativo = 1 no login e no carregamento da sessão (app.py).",
          rbac: "Sistema (leitura); DBA (alteração)"
        },
        {
          nome: "criado_em", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite). Formato ISO 8601 UTC: YYYY-MM-DDTHH:MM:SSZ",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Metadado técnico.",
          desc: "Data e hora de criação da conta, em UTC, gravada como texto ISO 8601.",
          origem: "Função agora_iso() no momento da criação.",
          destino: "Consulta administrativa direta no banco.",
          rbac: "Sistema; DBA"
        }
      ]
    },
    {
      nome: "processos",
      titulo: "Processos (tratativas de clientes)",
      descricao: "Tabela central do sistema. Cada linha é uma tratativa de um cliente de plano de saúde, classificada por tipo (pasta) e status. Contém dados pessoais do cliente (nome, CPF/CNPJ, login) e a senha opcional do cliente, criptografada com Fernet (AES). Processos concluídos ficam arquivados e podem ser reabertos.",
      acesso: "Todos os perfis autenticados (admin e operador) operam os processos não concluídos. Exclusão definitiva de concluídos: somente admin, digitando o protocolo.",
      colunas: [
        {
          nome: "id", tipo: "INTEGER", tipoNota: "SERIAL (PostgreSQL); INTEGER PRIMARY KEY AUTOINCREMENT (SQLite)",
          cons: ["PK", "NOT NULL"], priv: "N/A", privNota: "Identificador técnico.",
          desc: "Identificador único do processo. Gerado automaticamente.",
          origem: "Gerado pelo SGBD no INSERT feito por POST /api/processos.",
          destino: "Referenciado por atualizacoes.processo_id (FK) e auditoria.processo_id (referência lógica); usado nas rotas /api/processos/<id>.",
          rbac: "admin, operador (indireto via API); DBA"
        },
        {
          nome: "cliente_nome", tipo: "VARCHAR(255)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL"], priv: "DP", privNota: "Nome de pessoa natural ou titular do contrato.",
          desc: "Nome completo do cliente. A aplicação exige nome e sobrenome (mínimo de 2 palavras) e no máximo 120 caracteres, embora a coluna aceite até 255.",
          origem: "Formulário de cadastro, validado em validators.py (validar_processo).",
          destino: "Listas e detalhes do processo; busca por nome sem acento (norm).",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "cpf", tipo: "VARCHAR(20)", tipoNota: "TEXT (SQLite). Gravado somente com dígitos",
          cons: ["NULL"], priv: "DP", privNota: "Identificador de pessoa natural (LGPD).",
          desc: "CPF do cliente, gravado apenas com dígitos (11). Validado com dígitos verificadores. Regra da aplicação: ao menos CPF ou CNPJ deve ser informado.",
          origem: "Formulário de cadastro; máscara no front-end e validação real no back-end (valida_cpf).",
          destino: "Exibido formatado (formata_cpf) nos detalhes; usado na busca por CPF.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "cnpj", tipo: "VARCHAR(30)", tipoNota: "TEXT (SQLite). Gravado somente com dígitos",
          cons: ["NULL"], priv: "DP", privNota: "Pode identificar titular empresário individual ou sócio.",
          desc: "CNPJ do cliente pessoa jurídica, gravado com dígitos (14). Validado com dígitos verificadores. Regra da aplicação: ao menos CPF ou CNPJ deve ser informado.",
          origem: "Formulário de cadastro, validado em validators.py (valida_cnpj).",
          destino: "Exibido formatado (formata_cnpj) nos detalhes.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "plano", tipo: "VARCHAR(150)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Nome comercial do plano, sem identificar pessoa isoladamente.",
          desc: "Nome do plano de saúde do cliente. A aplicação limita a 100 caracteres, embora a coluna aceite até 150.",
          origem: "Formulário de cadastro.",
          destino: "Listas, detalhes e telas de concluídos.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "login_cliente", tipo: "VARCHAR(120)", tipoNota: "TEXT (SQLite)",
          cons: ["NULL"], priv: "DP", privNota: "Credencial de acesso do cliente a portal externo.",
          desc: "Login do cliente em portal da operadora, guardado em texto claro e opcional. Limite de 100 caracteres na aplicação.",
          origem: "Formulário de cadastro (campo opcional).",
          destino: "Exibido nos detalhes do processo para quem tem acesso.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "senha_cliente_enc", tipo: "TEXT", tipoNota: "Mesmo tipo no SQLite. Token Fernet (AES)",
          cons: ["NULL"], priv: "DP", privNota: "Credencial do cliente, criptografada. Minimização: campo opcional.",
          desc: "Senha do cliente, opcional, gravada criptografada com Fernet. Nunca é enviada em listas ou detalhes (a API informa apenas se existe). Só é revelada sob demanda, ocultada após 15 segundos e registrada na auditoria (acao = revelar_senha).",
          origem: "Formulário de cadastro; criptografada em security.criptografar antes do INSERT (até 200 caracteres antes de cifrar).",
          destino: "Descriptografada somente na rota de revelar senha. Sem a fernet.key, o valor não é recuperável.",
          rbac: "Revelar: perfis em REVEAL_ROLES (padrão admin). operador: não. DBA: vê apenas o valor cifrado."
        },
        {
          nome: "protocolo", tipo: "VARCHAR(100)", tipoNota: "TEXT COLLATE NOCASE (SQLite)",
          cons: ["UNIQUE", "NOT NULL"], priv: "N/A", privNota: "Número de protocolo do atendimento.",
          desc: "Número de protocolo do atendimento. Único. A aplicação aceita de 3 a 40 caracteres (letras, números, ponto, barra, hífen). No SQLite a unicidade ignora maiúsculas e minúsculas.",
          origem: "Formulário de cadastro, validado por expressão regular em validators.py.",
          destino: "Busca por protocolo; confirmação de exclusão definitiva de concluídos; campo detalhe da auditoria.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "tipo", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL", "CHECK (tipo IN ('agendar_consulta','cancelamento','inclusao','exclusao','alteracao_cadastral'))"], priv: "N/A", privNota: "Classificação do processo.",
          desc: "Tipo do processo, que define a pasta em que ele aparece. Valores permitidos: agendar_consulta, cancelamento, inclusao, exclusao, alteracao_cadastral.",
          origem: "Seleção no formulário; lista de referência TIPOS em db.py.",
          destino: "Contagem por pasta na tela inicial; filtros e listas.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "status", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL", "DEFAULT 'andamento'", "CHECK (status IN ('andamento','atrasado','concluido'))"], priv: "N/A", privNota: "Estado do processo.",
          desc: "Situação do processo: andamento, atrasado ou concluido. Concluir exige confirmação, preenche concluido_em e arquiva. Processos em andamento com prazo vencido viram atrasado automaticamente pelo backend.",
          origem: "Formulário ou rota de status; alteração automática em services.sincronizar_atrasos (histórico gravado como usuário sistema).",
          destino: "Alertas (calcular_alertas), resumo por pasta, tela de concluídos.",
          rbac: "admin, operador (alteração); Sistema (atraso automático); DBA"
        },
        {
          nome: "prazo_resolucao", tipo: "VARCHAR(30)", tipoNota: "TEXT (SQLite). Formato YYYY-MM-DD",
          cons: ["NULL"], priv: "N/A", privNota: "Data limite operacional.",
          desc: "Data limite para resolução do processo, em texto no formato YYYY-MM-DD. Opcional. Processos sem prazo aparecem em nota informativa nos alertas.",
          origem: "Formulário de cadastro; validada com date.fromisoformat.",
          destino: "Cálculo de atraso (dias de atraso) e mudança automática para atrasado.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "criado_em", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite). ISO 8601 UTC: YYYY-MM-DDTHH:MM:SSZ",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Metadado técnico.",
          desc: "Data e hora de criação do processo, em UTC, como texto ISO 8601.",
          origem: "agora_iso() na criação (POST /api/processos).",
          destino: "Ordenação das listas de ativos (mais recentes primeiro).",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "atualizado_em", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite). ISO 8601 UTC: YYYY-MM-DDTHH:MM:SSZ",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Metadado técnico.",
          desc: "Data e hora da última movimentação humana. Base do cálculo de tempo parado (alertas de Atenção e Alerta). A mudança automática para atrasado não altera este campo.",
          origem: "agora_iso() em criação, edição, mudança de status, nova atualização e reabertura.",
          destino: "Regras de alerta: dias_atencao e dias_alerta em calcular_alertas.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "concluido_em", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite). ISO 8601 UTC: YYYY-MM-DDTHH:MM:SSZ",
          cons: ["NULL"], priv: "N/A", privNota: "Metadado técnico.",
          desc: "Data e hora da conclusão. Preenchido ao concluir e limpo (NULL) ao reabrir ou mudar o status. Nulo enquanto o processo não está concluído.",
          origem: "services.aplicar_status ao concluir; rota de reabertura limpa o valor.",
          destino: "Ordenação da tela de Processos concluídos (mais recentes primeiro).",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "criado_por", tipo: "INTEGER", tipoNota: "Mesmo tipo no SQLite",
          cons: ["FK", "NULL", "REFERENCES usuarios(id)"], priv: "N/A", privNota: "Chave técnica; a identificação do usuário está em usuarios.",
          desc: "Usuário que cadastrou o processo. Opcional. Não há regra ON DELETE definida: usuários não são excluídos, apenas desativados (usuarios.ativo).",
          origem: "ID do usuário da sessão no momento do cadastro.",
          destino: "Rastreabilidade de autoria do cadastro.",
          rbac: "Sistema; DBA"
        }
      ]
    },
    {
      nome: "atualizacoes",
      titulo: "Atualizações (histórico do processo)",
      descricao: "Linha do tempo de cada processo: observações digitadas pelos usuários e registros automáticos do sistema (mudanças de status, conclusão, reabertura). Removida em cascata quando o processo é excluído. A API retorna as 100 mais recentes por processo.",
      acesso: "Leitura e inclusão: admin e operador, dentro dos detalhes do processo. Não há edição nem exclusão avulsa.",
      colunas: [
        {
          nome: "id", tipo: "INTEGER", tipoNota: "SERIAL (PostgreSQL); INTEGER PRIMARY KEY AUTOINCREMENT (SQLite)",
          cons: ["PK", "NOT NULL"], priv: "N/A", privNota: "Identificador técnico.",
          desc: "Identificador único da atualização. A ordenação do histórico usa este campo (mais recentes primeiro).",
          origem: "Gerado pelo SGBD no INSERT em registrar_historico.",
          destino: "Ordenação do histórico nos detalhes do processo.",
          rbac: "Sistema; DBA"
        },
        {
          nome: "processo_id", tipo: "INTEGER", tipoNota: "Mesmo tipo no SQLite",
          cons: ["FK", "NOT NULL", "REFERENCES processos(id) ON DELETE CASCADE"], priv: "N/A", privNota: "Chave técnica.",
          desc: "Processo ao qual a atualização pertence. Relacionamento N:1 obrigatório. Ao excluir o processo, todo o seu histórico é excluído.",
          origem: "ID do processo da rota em que a atualização foi registrada.",
          destino: "Agrupamento do histórico por processo; índice idx_atualizacoes_proc.",
          rbac: "Sistema; DBA"
        },
        {
          nome: "usuario", tipo: "VARCHAR(100)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL"], priv: "DP", privNota: "Nome do funcionário autor, guardado como texto (sem FK).",
          desc: "Nome (username) de quem fez o registro, ou 'sistema' para ações automáticas. É texto, não chave estrangeira para usuarios.id.",
          origem: "username do usuário da sessão ou literal 'sistema'.",
          destino: "Exibido ao lado de cada item do histórico.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "texto", tipo: "TEXT", tipoNota: "Mesmo tipo no SQLite",
          cons: ["NOT NULL"], priv: "DP", privNota: "Campo livre: pode conter dados pessoais e, por digitação do usuário, dado pessoal sensível (DPS), como informação de saúde.",
          desc: "Conteúdo da atualização. Texto livre digitado pelo usuário ou mensagem padrão do sistema (ex.: Status alterado de Andamento para Atrasado). Orientar os usuários a não registrar dados de saúde.",
          origem: "Digitação do usuário (nova atualização) ou mensagem gerada pelas regras de status.",
          destino: "Histórico exibido nos detalhes do processo.",
          rbac: "admin, operador; DBA"
        },
        {
          nome: "criado_em", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite). ISO 8601 UTC: YYYY-MM-DDTHH:MM:SSZ",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Metadado técnico.",
          desc: "Data e hora do registro, em UTC, como texto ISO 8601.",
          origem: "agora_iso() em registrar_historico.",
          destino: "Exibido no histórico.",
          rbac: "admin, operador; DBA"
        }
      ]
    },
    {
      nome: "auditoria",
      titulo: "Auditoria (trilha de ações)",
      descricao: "Trilha de auditoria para conformidade com a LGPD e controles COBIT. Registra login, falha de login, logout, criação, visualização, edição, mudança de status, atualização, revelação de senha, reabertura, exclusão e alteração de configurações. Não possui FK com processos de propósito, para que o rastro sobreviva à exclusão do processo.",
      acesso: "Gravada automaticamente pela aplicação (services.auditar). Não há rota ou tela de consulta: leitura direta no banco pelo administrador técnico.",
      colunas: [
        {
          nome: "id", tipo: "INTEGER", tipoNota: "SERIAL (PostgreSQL); INTEGER PRIMARY KEY AUTOINCREMENT (SQLite)",
          cons: ["PK", "NOT NULL"], priv: "N/A", privNota: "Identificador técnico.",
          desc: "Identificador único e sequencial do evento de auditoria.",
          origem: "Gerado pelo SGBD no INSERT em services.auditar.",
          destino: "Ordenação cronológica na consulta.",
          rbac: "DBA"
        },
        {
          nome: "usuario", tipo: "VARCHAR(100)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL"], priv: "DP", privNota: "Identifica o funcionário que executou a ação.",
          desc: "Username de quem executou a ação. Em falhas de login com usuário não informado, grava '?'. É texto, sem FK.",
          origem: "username da sessão ou do formulário de login.",
          destino: "Investigação de incidentes e conformidade.",
          rbac: "DBA"
        },
        {
          nome: "acao", tipo: "VARCHAR(100)", tipoNota: "TEXT (SQLite)",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Nome técnico do evento.",
          desc: "Tipo do evento: login, login_falhou, logout, criar, visualizar, editar, status, atualizacao, revelar_senha, reabrir, excluir, alterar_configuracoes.",
          origem: "Literal informado pelo código em cada chamada de services.auditar.",
          destino: "Filtro e análise na consulta direta.",
          rbac: "DBA"
        },
        {
          nome: "processo_id", tipo: "INTEGER", tipoNota: "Mesmo tipo no SQLite",
          cons: ["NULL"], priv: "N/A", privNota: "Referência técnica, sem FK.",
          desc: "Processo relacionado ao evento. Referência lógica, sem chave estrangeira: o valor permanece mesmo após a exclusão do processo. Nulo para eventos sem processo (login, configurações).",
          origem: "ID do processo da rota que gerou o evento.",
          destino: "Rastreio do histórico de um processo, inclusive excluído.",
          rbac: "DBA"
        },
        {
          nome: "detalhe", tipo: "TEXT", tipoNota: "Mesmo tipo no SQLite",
          cons: ["NULL"], priv: "DP", privNota: "Texto de apoio: protocolo, mudança de status ou valores de configuração. Pode, em tese, conter dado pessoal.",
          desc: "Complemento do evento: protocolo do processo (criar, editar, excluir), transição de status (ex.: andamento -> atrasado) ou valores salvos nas configurações.",
          origem: "Parâmetro detalhe de services.auditar.",
          destino: "Consulta direta para conformidade.",
          rbac: "DBA"
        },
        {
          nome: "ip", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite)",
          cons: ["NULL"], priv: "DP", privNota: "Endereço IP é dado pessoal pela LGPD quando permite identificar a pessoa.",
          desc: "Endereço IP de origem da requisição (request.remote_addr).",
          origem: "security.ip_cliente() no momento do evento.",
          destino: "Investigação de incidentes.",
          rbac: "DBA"
        },
        {
          nome: "criado_em", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite). ISO 8601 UTC: YYYY-MM-DDTHH:MM:SSZ",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Metadado técnico.",
          desc: "Data e hora do evento, em UTC, como texto ISO 8601.",
          origem: "agora_iso() em services.auditar.",
          destino: "Linha do tempo de auditoria.",
          rbac: "DBA"
        }
      ]
    },
    {
      nome: "configuracoes",
      titulo: "Configurações de prazos e alertas",
      descricao: "Parâmetros chave/valor que controlam os alertas. Chaves semeadas na criação do banco: dias_atencao = 2, dias_alerta = 5, dias_prioridade_alta = 3 e prazo_padrao_dias = 7. Administradores alteram os valores pela tela de prazos.",
      acesso: "Leitura: qualquer usuário autenticado (GET /api/configuracoes). Alteração: somente admin (PUT /api/configuracoes), com auditoria.",
      colunas: [
        {
          nome: "chave", tipo: "VARCHAR(100)", tipoNota: "TEXT (SQLite)",
          cons: ["PK", "NOT NULL"], priv: "N/A", privNota: "Parâmetro técnico.",
          desc: "Nome do parâmetro. Valores existentes: dias_atencao, dias_alerta, dias_prioridade_alta, prazo_padrao_dias.",
          origem: "Semeada por CONFIG_PADRAO em db.init_db (INSERT ... ON CONFLICT DO NOTHING).",
          destino: "Chave de leitura em obter_config e de atualização em salvar_config.",
          rbac: "admin, operador (leitura); admin (alteração); DBA"
        },
        {
          nome: "valor", tipo: "TEXT", tipoNota: "Mesmo tipo no SQLite. Armazena número inteiro como texto",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Parâmetro técnico.",
          desc: "Valor do parâmetro, guardado como texto e convertido para inteiro na leitura. Regras na aplicação: entre 1 e 365 dias e dias_atencao menor que dias_alerta.",
          origem: "Valor padrão do sistema ou edição por admin (salvar_config, com UPSERT).",
          destino: "Cálculo de alertas (calcular_alertas) e prazo padrão de novos processos.",
          rbac: "admin, operador (leitura); admin (alteração); DBA"
        }
      ]
    },
    {
      nome: "tentativas_login",
      titulo: "Tentativas de login (proteção contra força bruta)",
      descricao: "Registra falhas de login para bloquear tentativas repetidas: por padrão, 5 falhas em 15 minutos para a mesma combinação de IP e usuário. Registros fora da janela são apagados automaticamente a cada nova falha, e as falhas do par são limpas após um login bem-sucedido.",
      acesso: "Uso interno da aplicação (módulo security.py). Sem tela ou rota de consulta; leitura direta no banco pelo DBA.",
      colunas: [
        {
          nome: "id", tipo: "INTEGER", tipoNota: "SERIAL (PostgreSQL); INTEGER PRIMARY KEY AUTOINCREMENT (SQLite)",
          cons: ["PK", "NOT NULL"], priv: "N/A", privNota: "Identificador técnico.",
          desc: "Identificador único da tentativa registrada.",
          origem: "Gerado pelo SGBD no INSERT em registrar_falha_login.",
          destino: "Uso interno.",
          rbac: "Sistema; DBA"
        },
        {
          nome: "chave", tipo: "VARCHAR(200)", tipoNota: "TEXT (SQLite). Formato IP|username em minúsculas",
          cons: ["NOT NULL", "INDEX idx_tentativas_chave"], priv: "DP", privNota: "Combina endereço IP e nome de usuário.",
          desc: "Chave de contagem no formato IP|username (username em minúsculas). Usada para somar falhas dentro da janela de tempo.",
          origem: "security._chave_tentativa(), a partir do IP da requisição e do username digitado.",
          destino: "Consulta de bloqueio (login_bloqueado) e limpeza (limpar_falhas_login).",
          rbac: "Sistema; DBA"
        },
        {
          nome: "criado_em", tipo: "VARCHAR(50)", tipoNota: "TEXT (SQLite). ISO 8601 UTC: YYYY-MM-DDTHH:MM:SSZ",
          cons: ["NOT NULL"], priv: "N/A", privNota: "Metadado técnico.",
          desc: "Data e hora da falha, em UTC. Usada para comparar com a janela de bloqueio (LOGIN_JANELA_MIN).",
          origem: "agora_iso() em registrar_falha_login.",
          destino: "Janela de bloqueio; exclusão automática de registros antigos.",
          rbac: "Sistema; DBA"
        }
      ]
    }
  ];

  /* ------------------------------------------------------------------
     Utilitários
     ------------------------------------------------------------------ */
  function esc(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function norm(t) {
    return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  var BADGE = { "DPS": "badge-dps", "DP": "badge-dp", "N/A": "badge-na" };
  var SIMPLES = { "PK": 1, "FK": 1, "UNIQUE": 1, "NOT NULL": 1, "NULL": 1 };

  function consHtml(lista) {
    return lista.map(function (c) {
      return SIMPLES[c]
        ? '<strong class="cons">[' + esc(c) + "]</strong>"
        : "<code>" + esc(c) + "</code>";
    }).join("");
  }

  /* ------------------------------------------------------------------
     Renderização
     ------------------------------------------------------------------ */
  function renderIdentificacao() {
    document.getElementById("tbProjeto").textContent = PROJETO.nome;
    document.getElementById("tbEmpresa").textContent = PROJETO.empresa;
    document.getElementById("idProjeto").textContent = PROJETO.nome;
    document.getElementById("idEmpresa").textContent = PROJETO.empresa;
    document.getElementById("idProfessor").textContent = PROJETO.professor;
    document.getElementById("idEscopo").textContent = PROJETO.escopo;
    document.getElementById("idTecnologia").textContent = PROJETO.tecnologia;
    var ul = document.getElementById("idResponsaveis");
    PROJETO.responsaveis.forEach(function (r) {
      var li = document.createElement("li");
      li.innerHTML = "<strong>" + esc(r.nome) + "</strong> - " + esc(r.papel);
      ul.appendChild(li);
    });
  }

  function renderTabelas() {
    var side = document.getElementById("sideTables");
    var main = document.getElementById("tabelas");
    var htmlSide = "";
    var htmlMain = "";

    TABELAS.forEach(function (t) {
      htmlSide += '<a class="side-link" data-tabela="' + esc(t.nome) + '" href="#' + esc(t.nome) + '">' + esc(t.nome) + "</a>";

      var linhas = t.colunas.map(function (c) {
        return '<tr data-col="' + esc(norm(c.nome)) + '">' +
          '<td class="attr" data-label="Atributo">' + esc(c.nome) + "</td>" +
          '<td data-label="Descrição / Regra de Negócio">' + esc(c.desc) + "</td>" +
          '<td data-label="Tipo e Tamanho"><code>' + esc(c.tipo) + '</code><span class="sub">' + esc(c.tipoNota) + "</span></td>" +
          '<td data-label="Constraints"><div class="cons-list">' + consHtml(c.cons) + "</div></td>" +
          '<td data-label="Privacidade (LGPD/GDPR)"><span class="badge ' + BADGE[c.priv] + '">' + esc(c.priv) + '</span><span class="priv-note">' + esc(c.privNota) + "</span></td>" +
          '<td class="lin" data-label="Linhagem (Data Lineage)"><b>Origem:</b> ' + esc(c.origem) + "<br><b>Destino:</b> " + esc(c.destino) + "</td>" +
          '<td class="rbac" data-label="Controle de Acesso (RBAC)">' + esc(c.rbac) + "</td>" +
          "</tr>";
      }).join("");

      htmlMain +=
        '<section id="' + esc(t.nome) + '" class="card tbl-section" data-tabela="' + esc(norm(t.nome)) + '">' +
        '<div class="tbl-head"><h2>' + esc(t.nome) + '</h2><span class="tbl-meta">' + esc(t.titulo) + " - " + t.colunas.length + " colunas</span></div>" +
        '<p class="tbl-desc">' + esc(t.descricao) + "</p>" +
        '<p class="tbl-access"><strong>Acesso à tabela:</strong> ' + esc(t.acesso) + "</p>" +
        '<div class="tbl-wrap"><table class="dd"><thead><tr>' +
        "<th>Atributo</th><th>Descrição / Regra de Negócio</th><th>Tipo e Tamanho</th><th>Constraints</th>" +
        "<th>Privacidade (LGPD/GDPR)</th><th>Linhagem (Data Lineage)</th><th>Controle de Acesso (RBAC)</th>" +
        "</tr></thead><tbody>" + linhas + "</tbody></table></div></section>";
    });

    side.innerHTML = htmlSide;
    main.innerHTML = htmlMain;
  }

  /* ------------------------------------------------------------------
     Busca em tempo real (nome da tabela ou da coluna)
     ------------------------------------------------------------------ */
  function filtrar(termo) {
    var q = norm(termo.trim());
    var secoes = document.querySelectorAll(".tbl-section");
    var visTabelas = 0, visLinhas = 0;

    secoes.forEach(function (sec) {
      var nomeTabela = sec.getAttribute("data-tabela");
      var tabelaCasa = q === "" || nomeTabela.indexOf(q) !== -1;
      var algumaLinha = false;

      sec.querySelectorAll("tbody tr").forEach(function (tr) {
        var casa = tabelaCasa || tr.getAttribute("data-col").indexOf(q) !== -1;
        tr.classList.toggle("is-hidden", !casa);
        if (casa) { algumaLinha = true; visLinhas++; }
      });

      sec.hidden = !algumaLinha;
      if (algumaLinha) visTabelas++;

      var link = document.querySelector('.side-link[data-tabela="' + sec.id + '"]');
      if (link) link.classList.toggle("is-hidden", !algumaLinha);
    });

    document.getElementById("semResultado").hidden = visTabelas !== 0;
    document.getElementById("resultadoBusca").textContent =
      q === "" ? "" : visTabelas + " tabela(s) e " + visLinhas + " coluna(s) encontradas.";
  }

  /* ------------------------------------------------------------------
     Tema claro/escuro
     ------------------------------------------------------------------ */
  function aplicarTema(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    document.getElementById("themeLabel").textContent = tema === "dark" ? "Modo claro" : "Modo escuro";
  }
  function iniciarTema() {
    var salvo = null;
    try { salvo = localStorage.getItem("dd-tema"); } catch (e) { salvo = null; }
    var inicial = salvo || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    aplicarTema(inicial);
    document.getElementById("themeBtn").addEventListener("click", function () {
      var novo = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      aplicarTema(novo);
      try { localStorage.setItem("dd-tema", novo); } catch (e) { /* armazenamento indisponível */ }
    });
  }

  /* ------------------------------------------------------------------
     Menu lateral responsivo
     ------------------------------------------------------------------ */
  function iniciarMenu() {
    var sidebar = document.getElementById("sidebar");
    var btn = document.getElementById("menuBtn");
    var backdrop = document.getElementById("backdrop");
    function abrir(v) {
      sidebar.classList.toggle("open", v);
      backdrop.hidden = !v;
      btn.setAttribute("aria-expanded", v ? "true" : "false");
    }
    btn.addEventListener("click", function () { abrir(!sidebar.classList.contains("open")); });
    backdrop.addEventListener("click", function () { abrir(false); });
    sidebar.addEventListener("click", function (e) {
      if (e.target.closest("a")) abrir(false);
    });
    window.addEventListener("resize", function () { if (window.innerWidth > 960) abrir(false); });
  }

  /* ------------------------------------------------------------------
     Modal do DER com Panzoom
     ------------------------------------------------------------------ */
  function iniciarModalDER() {
    var modal = document.getElementById("derModal");
    var stage = document.getElementById("derStage");
    var img = document.getElementById("derImg");
    var pz = null;

    function criarPanzoom() {
      if (typeof Panzoom === "undefined") return;
      if (pz) pz.destroy();
      pz = Panzoom(img, { maxScale: 10, minScale: 0.3, step: 0.3, cursor: "grab" });
      stage.addEventListener("wheel", pz.zoomWithWheel, { passive: false });
      pz.reset({ animate: false });
    }

    function abrir() {
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      if (img.complete) { criarPanzoom(); } else { img.addEventListener("load", criarPanzoom, { once: true }); }
      document.getElementById("derClose").focus();
    }
    function fechar() {
      modal.hidden = true;
      document.body.style.overflow = "";
      if (pz) {
        stage.removeEventListener("wheel", pz.zoomWithWheel);
        pz.destroy();
        pz = null;
      }
      document.getElementById("derBtn").focus();
    }

    document.getElementById("derBtn").addEventListener("click", abrir);
    document.getElementById("derClose").addEventListener("click", fechar);
    document.getElementById("zoomIn").addEventListener("click", function () { if (pz) pz.zoomIn(); });
    document.getElementById("zoomOut").addEventListener("click", function () { if (pz) pz.zoomOut(); });
    document.getElementById("zoomReset").addEventListener("click", function () { if (pz) pz.reset(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) fechar();
    });
  }

  /* ------------------------------------------------------------------
     Realce do item ativo na sidebar
     ------------------------------------------------------------------ */
  function iniciarScrollSpy() {
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (en.isIntersecting) {
          document.querySelectorAll(".side-link.active").forEach(function (a) { a.classList.remove("active"); });
          var link = document.querySelector('.side-link[data-tabela="' + en.target.id + '"]');
          if (link) link.classList.add("active");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    document.querySelectorAll(".tbl-section").forEach(function (s) { obs.observe(s); });
  }

  /* ------------------------------------------------------------------
     Inicialização
     ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", function () {
    renderIdentificacao();
    renderTabelas();
    iniciarTema();
    iniciarMenu();
    iniciarModalDER();
    iniciarScrollSpy();
    var busca = document.getElementById("busca");
    busca.addEventListener("input", function () { filtrar(busca.value); });
  });
})();
