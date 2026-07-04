# Memórias Positivas do Ano

## Overview

Aplicativo web responsivo e acessível para criar e visualizar memórias positivas ao longo do ano. O app possui interface de carrossel para navegação das memórias, tela de criação/edição completa com editor rich text, sistema de navegação por anos anteriores e funcionalidade de backup/importação de dados. Construído com HTML, CSS e JavaScript vanilla, utiliza localStorage para persistência e foca em uma experiência de usuário limpa e acessível com localização em português.

## Funcionalidades Implementadas

### Tela de Visualização (Carrossel)
- Carrossel das notas do ano atual com navegação anterior/próxima
- Indicadores visuais de posição no carrossel 
- Visualização de memórias em formato de cartão com data em português, local e conteúdo
- Botão de edição diretamente no cartão da memória
- Estado vazio quando não há memórias

### Tela de Criação/Edição
- Data editável exibida no formato de carta em português (ex: "17 de Setembro de 2025")
- Campo para cidade e estado (formato "Cidade-ES")
- Editor rich text com funcionalidades de formatação (negrito, itálico, sublinhado)
- Inserção de imagens com validação de tipo e tamanho
- Botões de salvar, excluir e cancelar com feedback visual
- Modo de edição preserva dados originais

### Tela de Anos Anteriores
- Lista de anos disponíveis com contagem de memórias por ano
- Interface em grid responsivo para seleção de anos
- Navegação direta para visualização das memórias do ano selecionado

### Modal de Backup
- Exportação de todas as memórias em arquivo JSON
- Importação de arquivo JSON com validação e confirmação
- Interface clara com explicações das funcionalidades

### Sistema de Navegação
- Menu inferior com 4 abas: Visualizar, Criar, Anos, Backup
- Navegação fluida entre telas com transições CSS
- Estado ativo visual claro no menu

## User Preferences

Comunicação: Linguagem simples e cotidiana em português brasileiro

## Arquitetura do Sistema

### Arquitetura Frontend
- **Abordagem Vanilla JavaScript**: Utiliza classes ES6 e recursos modernos do JavaScript sem frameworks externos
- **Single-page application (SPA)**: Troca de telas gerenciada via classes CSS e gerenciamento de estado JavaScript
- **Estrutura baseada em componentes**: Classe principal `MemoryApp` gerencia estado da aplicação e interações do usuário
- **Design responsivo**: Abordagem mobile-first com layouts flexíveis e breakpoints otimizados

### Gerenciamento de Dados
- **Armazenamento client-side**: localStorage para persistência de dados (não requer backend)
- **Serialização JSON**: Notas armazenadas como objetos JSON com geração de ID único
- **Gerenciamento de estado**: Estado centralizado na classe principal com métodos para operações CRUD
- **Tratamento de erros**: Blocos try-catch para operações localStorage com feedback ao usuário

### Design da Interface
- **Navegação em carrossel**: Botões anterior/próximo com indicadores visuais para navegar pelas memórias
- **Layout multi-tela**: Visualizações separadas para navegação (carrossel), criação/edição e anos anteriores
- **Recursos de acessibilidade**: ARIA labels, estrutura HTML semântica, suporte à navegação por teclado
- **Feedback visual**: Sistema de mensagens para ações do usuário e estados de erro

### Arquitetura de Estilos
- **CSS Custom Properties**: Sistema de design abrangente com variáveis de cor, espaçamento e tipografia
- **CSS baseado em componentes**: Folhas de estilo modulares com convenções de nomenclatura claras
- **Recursos CSS modernos**: Layouts Flexbox, CSS Grid quando apropriado, e transições suaves
- **Design tokens**: Escalas consistentes de espaçamento, cores e tipografia definidas em variáveis CSS

### Funcionalidades de Acessibilidade
- **Screen reader support**: Textos sr-only para elementos visuais
- **Navegação por teclado**: Atalhos Ctrl+S para salvar, Escape para fechar modal, setas para carrossel
- **ARIA compliant**: Labels apropriados, roles e estados aria para componentes interativos
- **Contraste e legibilidade**: Cores e tamanhos de fonte otimizados para leitura

## Dependências Externas

### Fontes
- **Google Fonts**: Família de fontes Inter com múltiplos pesos (300, 400, 500, 600, 700)
- **Otimização de carregamento**: Links preconnect para performance

### APIs do Browser
- **localStorage**: Para persistência de dados client-side
- **Date API**: Para geração de timestamp e rastreamento de ano
- **File API**: Para funcionalidades de import/export JSON
- **DOM APIs**: APIs padrão do browser para manipulação de elementos e manipulação de eventos

### Sem Dependências de Backend
- Aplicação puramente client-side sem requisitos de servidor
- Sem conexões de banco de dados ou integrações de API
- Autocontida com todas as funcionalidades rodando no browser

## Configuração de Deploy

### Servidor de Desenvolvimento
- **Comando**: `python -m http.server 5000`
- **Porta**: 5000 (configurada para webview)
- **Tipo**: Servidor HTTP estático para arquivos HTML/CSS/JS

### Estrutura de Arquivos
```
/
├── index.html          # Estrutura HTML principal
├── styles.css          # Estilos CSS responsivos e acessíveis
├── script.js           # JavaScript principal com classe MemoryApp
└── replit.md          # Documentação do projeto
```