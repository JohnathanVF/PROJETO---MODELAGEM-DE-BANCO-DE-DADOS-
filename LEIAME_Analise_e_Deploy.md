# Dicionário de Dados - Gestão de Tratativas de Clientes (Sala de arquivos)

Este arquivo reúne as Partes 1, 2, 4 e 5 do prompt. O código (Parte 3) está em `index.html`, `style.css` e `script.js`.

## PARTE 1 - Metadados do projeto

| Item | Valor |
|---|---|
| Projeto | Gestão de Tratativas de Clientes ("Sala de arquivos") |
| Empresa | PREENCHER (em `PROJETO.empresa`, no início do `script.js`) |
| Professor orientador | Prof. Dr. Diego Carvalho |
| Integrantes | PREENCHER (em `PROJETO.responsaveis`, no `script.js`) |
| Tecnologia | SQLite (desenvolvimento) e PostgreSQL (produção) |
| Escopo do dicionário | 6 tabelas e 38 colunas, conferidas automaticamente contra `SCHEMA_POSTGRES` de `db.py` (nomes, ordem e tipos) |
| Identidade visual | Fundo #0B0F14, destaque #3B82F6 (modo escuro); fundo #F4F6FA (modo claro) |
| Data desta revisão | 12/11/2026 |

**Data Literacy.** Este dicionário transforma o esquema técnico do sistema de tratativas em um vocabulário comum entre quem opera os processos, quem desenvolve e quem responde pela conformidade. Pelo DAMA-DMBOK, ele é o principal artefato de metadados da área de Data Governance e Data Modeling: cada coluna tem definição, regra de negócio, dono e linhagem, o que reduz ambiguidades como a diferença entre `criado_em` e `atualizado_em`, que decide quando um processo gera alerta. Pelo COBIT (APO14 Gestão de Dados e DSS05 Serviços de Segurança Gerenciados), ele documenta controles verificáveis: quais colunas guardam dados pessoais (CPF, CNPJ, nome, login, IP), onde está a única credencial de terceiros (`senha_cliente_enc`, cifrada com Fernet), quem pode revelá-la e qual tabela guarda a trilha de auditoria. Para uma operação que lida com dados de clientes de planos de saúde, isso sustenta o atendimento aos princípios da LGPD (finalidade, necessidade, segurança e prestação de contas) e acelera a resposta a incidentes e a pedidos de titulares.

## PARTE 2 - Análise de coerência e ajustes manuais

**Aviso importante: o dicionário não pode ser publicado sem as alterações abaixo nos documentos de requisitos e no DER.**

### 2.1 Documentos que não foram entregues

1. **Especificação de Requisitos e Regras de Negócio:** não existe no material enviado. A pasta `docs/` contém apenas um aviso. Anexe o documento oficial e exporte em PDF como `Especificacao_Requisitos_Regras_Negocio_BD.pdf`.
2. **DER:** não existe no material enviado. O arquivo `assets/der.png` foi gerado a partir do DDL (`SCHEMA_POSTGRES`) para que o modal funcione. Se a equipe já tem o DER oficial, substitua este arquivo (mantendo o nome, ou ajustando o `src` em `index.html`), exportado em PNG.

Como esses dois documentos não puderam ser lidos, os itens "Textos entre colchetes não substituídos", "páginas de instruções do template" e "nomes fictícios no histórico de revisões" não puderam ser verificados neles. Ao revisá-los, remova todo texto entre colchetes, toda caixa "Orientação:", a página "COMO UTILIZAR ESTE MODELO" e os nomes de exemplo. O histórico de revisões deve ter ao menos 4 linhas: (1) criação inicial; (2) e (3) revisões anteriores; (4) esta revisão, de 12/11/2026, que inclui as correções desta lista.

### 2.2 Divergências encontradas (código x modelo esperado nos documentos)

1. **Tecnologia.** O template previa MySQL; o projeto usa SQLite (local) e PostgreSQL (produção, Neon/Supabase). No documento de requisitos e no DER, troque "MySQL" por "SQLite (desenvolvimento) e PostgreSQL (produção)". Se o professor exigir MySQL, o DDL precisa ser reescrito e o dicionário deixa de refletir o banco real.
2. **Datas como texto.** `criado_em`, `atualizado_em`, `concluido_em` (processos), `criado_em` das demais tabelas e `prazo_resolucao` são VARCHAR/TEXT, não DATE/TIMESTAMP. Nos requisitos, registre o formato ISO 8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`) e, para o prazo, `YYYY-MM-DD`. No DER, use VARCHAR(50) e VARCHAR(30).
3. **Limites diferentes entre aplicação e banco.** Nome do cliente: validação de 120 caracteres x VARCHAR(255). Plano: 100 x 150. Login do cliente: 100 x 120. Protocolo: 40 x 100. Decida qual vale e documente; recomendação: documentar o limite da aplicação (mais restritivo) e citar o do banco como limite técnico.
4. **Relacionamentos lógicos sem FK.** `auditoria.processo_id` não tem FK (proposital, para preservar o rastro). `atualizacoes.usuario` e `auditoria.usuario` guardam o username como texto, sem FK para `usuarios.id`. No DER, desenhe `processos 1:N auditoria` com linha tracejada e identifique como "referência lógica".
5. **`processos.criado_por`.** FK opcional para `usuarios.id`, sem ON DELETE. Os requisitos devem dizer que usuários são desativados (`usuarios.ativo = 0`) e não excluídos. Cardinalidade no DER: `usuarios 1 : 0..N processos`.
6. **`usuarios.ativo`.** INTEGER usado como booleano (1 ativo, 0 inativo). Documente assim.
7. **Regras só na aplicação.** CPF ou CNPJ obrigatório (ao menos um, com dígitos verificadores), nome com 2 ou mais palavras, protocolo de 3 a 40 caracteres, conclusão com confirmação, atraso automático por prazo vencido, janela de alertas (1 a 365 dias, `dias_atencao` menor que `dias_alerta`) e bloqueio de login (5 falhas em 15 min) não estão no DDL. Devem estar listadas nos requisitos como regras de negócio.
8. **Diferença entre ambientes.** No SQLite, `username` e `protocolo` usam COLLATE NOCASE (unicidade sem diferenciar maiúsculas e minúsculas); no PostgreSQL do DDL não. Registre como divergência conhecida ou ajuste o PostgreSQL (por exemplo, índice único sobre `lower(coluna)`).
9. **Conteúdo do README.** O README usa emojis e cita a pasta "SISTEMA DE GESTÃO/". Se for reaproveitado em documento oficial, remova os emojis e padronize o nome.
10. **Privacidade (observação de governança).** `login_cliente` fica em texto claro e `atualizacoes.texto` e `auditoria.detalhe` aceitam texto livre que pode conter dado de saúde. Os requisitos devem prever orientação de uso e política de retenção para processos arquivados.

### 2.3 Pendências no dicionário gerado

- Substituir `PREENCHER` por empresa e integrantes (início do `script.js`).
- Substituir o `der.png` gerado pelo DER oficial, se houver.
- Colocar o PDF de requisitos em `docs/`.

## PARTE 4 - Estrutura de pastas e arquivos

Dentro do projeto, o dicionário fica em uma pasta própria, sem afetar a aplicação Flask:

```text
SISTEMA-DE-GESTAO-main/
├── (arquivos da aplicação: app.py, db.py, ...)
└── dicionario-de-dados/
    ├── index.html
    ├── style.css
    ├── script.js
    ├── LEIAME_Analise_e_Deploy.md
    ├── docs/
    │   └── Especificacao_Requisitos_Regras_Negocio_BD.pdf   (colocar aqui)
    └── assets/
        └── der.png
```

Para publicar, use somente o conteúdo de `dicionario-de-dados/` como raiz do repositório (`index.html` precisa ficar na raiz). Como as tags já apontam para essa estrutura:

- `<link rel="stylesheet" href="style.css">` e `<script src="script.js">` usam caminhos relativos, sem barra inicial, então funcionam na raiz do repositório e em subcaminho do GitHub Pages.
- O botão do PDF usa `href="docs/Especificacao_Requisitos_Regras_Negocio_BD.pdf"`.
- O DER usa `src="assets/der.png"`.
- O Panzoom vem do CDN oficial (jsDelivr, `@panzoom/panzoom@4.5.1`), por isso é preciso internet para o zoom funcionar.

Para testar localmente, dê um duplo clique em `index.html` ou, na pasta, rode `python -m http.server 8000` e abra http://localhost:8000.

## PARTE 5 - Deploy no GitHub Pages

1. Crie uma conta e um repositório **público** em github.com (botão New repository). Marque a opção de criar sem README.
2. Copie o conteúdo de `dicionario-de-dados/` (não a pasta, e sim os arquivos: `index.html`, `style.css`, `script.js`, `docs/`, `assets/`) para uma pasta nova.
3. No terminal, dentro dessa pasta:
   ```bash
   git init
   git add .
   git commit -m "Dicionario de Dados"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
   Alternativa sem terminal: no repositório, Add file > Upload files e arraste os arquivos e pastas.
4. No repositório, acesse **Settings > Pages > Build and deployment > Source: Deploy from a branch > Select "main" (pasta / (root)) > Save**.
5. Aguarde 1 a 3 minutos. O endereço aparece no topo da página Pages: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

**Aviso sobre maiúsculas e minúsculas.** O servidor do GitHub Pages diferencia maiúsculas de minúsculas nos caminhos (Linux), ao contrário do Windows. `assets/der.png`, `Assets/der.png` e `assets/DER.PNG` são arquivos diferentes. O nome do PDF deve ser exatamente `Especificacao_Requisitos_Regras_Negocio_BD.pdf` dentro de `docs/`, e o DER exatamente `assets/der.png` (minúsculas). Se o DER oficial for `.jpg`, altere o `src` em `index.html`. Um link que funciona localmente no Windows e dá erro 404 no GitHub quase sempre é diferença de maiúsculas.
