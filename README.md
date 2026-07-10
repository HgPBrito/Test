# Memórias Positivas do Ano

## Overview

Progressive Web App (PWA) para criar e visualizar memórias positivas ao longo do ano, construído com **HTML, CSS e JavaScript puro** (sem frameworks, sem bundler, sem backend). A partir desta versão, o app foi reestruturado em módulos ES (JavaScript nativo) com armazenamento em **IndexedDB**, imagens desacopladas do texto das notas, seletor de emoji no editor, e sincronização automática com um arquivo de backup real no dispositivo — com um fluxo alternativo de um toque para navegadores mobile, que não suportam esse recurso nativamente.

## Arquitetura de Arquivos

```
/
├── index.html            # Estrutura HTML principal (com tags de PWA)
├── styles.css            # Estilos CSS responsivos e acessíveis
├── manifest.json         # Manifesto do PWA (ícones, cores, modo de exibição)
├── service-worker.js     # Cache offline dos arquivos estáticos e instalação como PWA
├── offline.html          # Página exibida só se abrir offline antes de qualquer cache existir
├── script.js             # Bootstrap: apenas importa e inicializa js/app.js
├── js/
│   ├── app.js             # Orquestrador principal (estado da UI, fluxo de telas)
│   ├── database.js        # Wrapper genérico sobre IndexedDB (MemoryAppDB)
│   ├── storage.js         # CRUD de notas/imagens, migração, exportação/importação de backup
│   ├── backup.js          # File System Access API + fallback para mobile
│   ├── sync.js            # SyncManager: merge, debounce, estado da sincronização
│   ├── pwa.js              # Registro do Service Worker e prompt de instalação
│   ├── ui.js               # Funções de renderização (carrossel, anos, indicadores)
│   └── utils.js            # Funções auxiliares (id, debounce, datas, mensagens)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-192.png
    └── icon-maskable-512.png
```

Todos os módulos usam `import`/`export` nativos do navegador (`<script type="module">`), sem necessidade de Webpack, Vite ou qualquer bundler.

## O banco de dados: de localStorage para IndexedDB

A versão anterior guardava tudo em `localStorage` (limite de poucos MB, operações síncronas que travam a interface, e imagens embutidas em base64 direto no HTML de cada nota — o que inflava bastante o tamanho dos dados).

Agora as notas e imagens ficam no **IndexedDB**, banco `MemoryAppDB`, com quatro object stores:

- **`notes`**: cada nota (`id`, `date`, `location`, `content`, `createdAt`, `updatedAt`). O campo `content` referencia imagens por `data-image-id`, sem embutir os bytes.
- **`images`**: cada imagem como `Blob` binário, referenciada pelo `id` usado nas notas. Isso deixa os registros de notas pequenos e a leitura/renderização mais rápida — a imagem só é carregada (como URL de objeto temporária) no momento de exibir aquela nota específica.
- **`settings`**: preferências simples (ex: se o onboarding já foi visto).
- **`sync`**: guarda a referência (`FileSystemFileHandle`) do arquivo de backup vinculado, para persistir entre sessões.

**Migração automática**: quem já usava a versão anterior tem suas notas migradas do `localStorage` para o IndexedDB automaticamente, na primeira abertura desta versão — incluindo a extração de imagens base64 embutidas para o novo formato desacoplado. A migração roda uma única vez (controlada por uma flag em `settings`) e não apaga o `localStorage` antigo, apenas para de usá-lo.

## Salvamento explícito e seletor de emoji

Notas só são gravadas no IndexedDB quando a pessoa clica em **"Salvar Agora"** — não existe salvamento automático enquanto se digita. Isso evita salvar estados incompletos (ex: só uma imagem inserida, sem revisar o texto ainda) e deixa o botão **Cancelar** simples e previsível: como nada foi persistido durante a edição, cancelar só descarta as imagens inseridas nesta sessão que ainda não foram salvas (evitando "imagens órfãs" no banco).

O placeholder do editor ("Escreva sua memória positiva aqui...") é puramente visual, via CSS (`:empty::before`) — nunca é inserido como texto real, então inserir uma imagem antes de escrever qualquer coisa não deixa mais o texto de exemplo "grudado" na nota salva.

O editor também tem um seletor de emoji (ícone de carinha na barra de ferramentas), com uma seleção de emojis organizados por categoria (rostos, corações, celebração, natureza), inseridos diretamente na posição do cursor.

## Imagens desacopladas do texto

Ao inserir uma imagem, ela é salva imediatamente como `Blob` no store `images`, e a nota passa a referenciá-la por um `data-image-id` (sem o base64 embutido no HTML). Ao exibir uma nota (no carrossel ou no editor), o app busca a imagem no IndexedDB e gera uma URL de objeto temporária só para aquela visualização — que é revogada (liberada da memória) assim que a nota deixa de estar em tela.

Isso deixa o banco muito mais leve e a navegação entre memórias mais rápida, especialmente em anos com muitas fotos.

**Observação sobre o arquivo de backup**: como é um arquivo externo autocontido (não pode referenciar o IndexedDB de outro aparelho), as imagens são convertidas de volta para base64 só no momento de gerar o arquivo de backup/exportação — e reconvertidas para `Blob` ao importar. Backups gerados pela versão anterior do app (com imagens base64 embutidas direto no texto) continuam sendo importados normalmente; o app converte esse formato antigo para o novo automaticamente.

## Sincronização com arquivo de backup no dispositivo

**Desktop (Chrome/Edge):** ao vincular um arquivo pela primeira vez (menu Backup → "Criar Novo Arquivo" ou "Vincular Arquivo Existente"), a referência fica salva no IndexedDB. A partir daí:
- **Ao abrir o app**: verifica silenciosamente (sem nenhum clique) se há um arquivo vinculado com permissão concedida, lê o conteúdo e mescla com as notas locais (a versão mais recente de cada nota, por `updatedAt`, prevalece).
- **A cada alteração salva** (criar/editar via "Salvar Agora", excluir, importação manual): agenda uma gravação automática no arquivo (debounce de 1,5s).
- **Ao fechar a aba, minimizar ou trocar de app**: os eventos `visibilitychange`/`pagehide` forçam a gravação imediata de qualquer alteração pendente.

**Mobile e outros navegadores (Firefox, Safari/iOS, a maioria do Android):** a File System Access API não existe nesses ambientes — nenhum site consegue ler/escrever num arquivo do sistema sem uma ação explícita do usuário a cada vez, em nenhum navegador. Para esses casos, existe o **botão de sincronização rápida no header** (ícone 🔄): em um único toque, ele abre o seletor de arquivo, mescla o conteúdo escolhido com as notas locais e baixa automaticamente uma versão atualizada do backup. Guardar esse arquivo numa pasta de nuvem (Google Drive, iCloud Drive) permite que ele "viaje" entre aparelhos ao repetir esse toque em cada um.

Um indicador visual (bolinha no ícone do header) aparece sempre que há alterações ainda não sincronizadas.

## Onboarding

Na primeira execução, se o navegador suportar a File System Access API, o app pergunta se o usuário quer ativar o backup automático agora (vinculando um arquivo na hora). Em navegadores sem suporte, essa pergunta é substituída por uma dica sobre o botão de sincronização rápida no header.

## Funcionalidades Implementadas

### Tela de Visualização (Carrossel)
- Carrossel das notas do ano atual com navegação anterior/próxima e indicadores de posição
- Cartão de memória com data em português, local e conteúdo (imagens carregadas sob demanda do IndexedDB)
- Edição direto pelo cartão

### Tela de Criação/Edição
- Data em formato de carta em português (ex: "17 de Setembro de 2025")
- Campo de cidade/estado, editor rich text (negrito, itálico, sublinhado, emoji), inserção de imagens
- Salvamento explícito via **"Salvar Agora"** (sem gravação automática enquanto digita)
- Botões "Salvar Agora", "Excluir" e "Cancelar"

### Tela de Filtro (aba "Filtrar")
- Navegação em camadas: **Anos → Meses → Semanas** (domingo a sábado), com breadcrumb pra voltar a qualquer nível
- Cada nível tem checkboxes pra seleção múltipla (ex: selecionar 2 anos, ou 3 meses de um mesmo ano) — tocar no nome do item explora mais fundo, marcar a caixinha seleciona
- Barra fixa embaixo mostra quantas memórias estão selecionadas e aplica o filtro
- Botão "Ver Todas as Memórias" sempre visível no topo
- Botão de acesso rápido no header (badge do período atual) abre um atalho num modal: Todas / Este Mês / Esta Semana / lista de anos

### Backup
- Sincronização automática via arquivo vinculado (desktop) ou botão de sincronização rápida (mobile/outros navegadores)
- Exportação/importação manual de JSON completo (notas + imagens), com merge por `updatedAt` em vez de substituição total

### PWA
- Instalável em desktop e mobile (`manifest.json`, ícones 192x192/512x512 e variantes maskable)
- Funciona offline (Service Worker com cache dos arquivos estáticos; os dados do usuário já são locais via IndexedDB)
- Meta tags específicas para iOS

### Acessibilidade
- ARIA labels, estrutura semântica, navegação por teclado (Ctrl+S para salvar, Escape para fechar modal, setas para o carrossel)

## Dependências Externas

### Fontes
- Google Fonts (Inter), com preconnect para performance

### APIs do Browser
- **IndexedDB**: armazenamento primário de notas, imagens, configurações e referência do arquivo de backup
- **File System Access API**: vincular, ler e escrever no arquivo de backup local (Chrome/Edge/Opera desktop apenas)
- **Service Worker / Cache API**: instalação como PWA e funcionamento offline dos arquivos estáticos
- **File API**: leitura de arquivos selecionados (importação manual, fallback mobile, inserção de imagens)
- **DOM APIs / execCommand**: editor rich text

### Sem Dependências de Backend
Aplicação 100% client-side, sem servidor, banco remoto ou APIs externas de dados.

## Configuração de Deploy

- **Servidor de desenvolvimento**: `python -m http.server 5000`
- **Requisito para PWA**: Service Worker e File System Access API exigem contexto seguro (`https://` ou `localhost`) — publique sempre em HTTPS
- Como o app agora usa `<script type="module">`, ele **não funciona abrindo o `index.html` direto do disco** (`file://`) em alguns navegadores devido a restrições de CORS em módulos ES — sempre sirva por um servidor HTTP, mesmo em desenvolvimento local
