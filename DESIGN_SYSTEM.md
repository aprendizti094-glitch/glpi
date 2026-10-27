# Design System — Sistema Comodato (Brago App System)

> **Documento Oficial de Especificação e Diretrizes de Design**  
> **Versão:** 2.1  
> **Última Atualização:** Setembro / 2026  
> **Escopo:** Aplicação Mobile Vendedores (PWA), Formulários de Serviço e Console de Gestão (Command Center / Painéis)

---

## REGRA MANDATÓRIA: PROIBIÇÃO ABSOLUTA DE EMOJIS NA UI

> [!CAUTION]
> **NUNCA UTILIZE EMOJIS UNICODE EM NENHUM COMPONENTE OU TELA DO SISTEMA.**  
> Esta é uma regra arquitetural estrita do Comodato (Brago App System).

### O que é terminantemente PROIBIDO:
- **Botões e CTAs:** Nada de textos como `Salvar 💾`, `Enviar 🚀`, `Adicionar ➕`.
- **Títulos e Cabeçalhos:** Nada de títulos como `📋 Novo Comodato`, `⭐ Destaques`, `🎨 Solicitar Arte`.
- **Mensagens de Feedback e Toasts:** Nada de toasts com `✅ Sucesso!`, `❌ Erro`, `⚠️ Atenção`.
- **Alertas e Banners:** Nada de caixas de texto com emojis decorativos no início.
- **Labels, Tabs, Badges e Tabelas:** Proibido o uso de emojis para indicar status, categorias ou contadores.

### O que deve ser usado no lugar:
- **FontAwesome 6.4.0 (Padrão Oficial):** Utilize tags semânticas `<i class="fas fa-[nome-do-icone]"></i>` com classes auxiliares de tamanho (`text-xs`, `text-sm`, `text-base`, `text-lg`) e cor (`text-orange-500`, `text-emerald-500`, etc.).
- **Ícones Vetoriais SVG:** Ícones limpos integrados via `<svg>` ou referenciados da pasta `assets/`.

### Justificativas Técnicas e Corporativas:
1. **Inconsistência entre Plataformas:** Emojis possuem desenhos, tamanhos e alinhamentos verticais completamente diferentes no iOS (Apple), Android (Google, Samsung, Xiaomi) e Windows, quebrando a harmonia da interface.
2. **Identidade B2B Profissional:** O Sistema Comodato é uma aplicação corporativa de missão crítica integrada com ERP Oracle e Field Control. Ícones vetoriais monocromáticos ou com cores de token transmitem maturidade e confiabilidade.
3. **Controle Estrito de Estilos:** Emojis não respeitam variáveis CSS, herança de cor (`currentColor`), gradientes ou transições de hover. Ícones FontAwesome e SVGs integram-se com precisão ao CSS da aplicação.
4. **Acessibilidade:** Leitores de tela pronunciam descrições literais de emojis (ex.: "marca de verificação branca em caixa verde"), poluindo a navegação assistiva.

| Elemento | Incorreto (PROIBIDO) | Correto (OBRIGATÓRIO) |
|---|---|---|
| Botão Salvar | `<button>Salvar 💾</button>` | `<button><i class="fas fa-save mr-2"></i>Salvar</button>` |
| Botão Enviar | `<button>Enviar 🚀</button>` | `<button><span>Enviar</span><i class="fas fa-paper-plane ml-1.5"></i></button>` |
| Toast de Sucesso | `toast.innerText = '✅ Salvo com sucesso'` | `<i class="fas fa-check-circle text-green-400"></i> Salvo com sucesso` |
| Alerta Inadimplência | `⚠️ Cliente Inadimplente` | `<i class="fas fa-triangle-exclamation text-amber-600"></i> Cliente Inadimplente` |
| Card de Arte | `<h3>Arte Meiwa 🎨</h3>` | `<h3><i class="fas fa-palette mr-2"></i>Arte Meiwa</h3>` |

---

## 1. Visão Geral & Filosofia de Design

O **Sistema Comodato (Brago App System)** atende a dois perfis principais de operação com jornadas e contextos de uso distintos:

1. **Vendedores em Campo (Mobile-First / PWA):**
   - Operam frequentemente em celulares com redes móveis 4G/3G instáveis, sob luz solar direta e em ambientes dinâmicos de clientes.
   - **Prioridades:** Áreas de toque generosas (mínimo de 44x44px), navegação guiada passo a passo (wizards), contraste nítido, persistência de dados local à prova de falhas (rascunhos automáticos via `IndexedDB` e `localStorage`), microanimações táteis e feedback instantâneo.

2. **Gestores, Supervisores e Diretoria (Desktop Command Center):**
   - Operam em desktops e tablets para auditoria, aprovação de Ordens de Serviço (OS), dashboards de inteligência, acompanhamento de SLA e gestão de equipes.
   - **Prioridades:** Alta densidade de dados estruturados, visualização em tempo real (shimmer em KPIs, gráficos Chart.js, kanbans interativos), gavetas laterais de inspeção (*drawers*) e navegação corporativa lateral padronizada.

---

## 2. Princípios Fundamentais

| Princípio | Aplicação Prática |
|---|---|
| **Resiliência Máxima (Zero Data Loss)** | O usuário nunca perde o que digitou. Falhas momentâneas de sinal são absorvidas com retry automático, avisos claros e formulários preservados localmente. |
| **Identidade Visual Marcante** | Harmonização do Laranja Brago enérgico (`#F97316`) com o Azul Royal Institucional (`#0120F8` / `#2F00FF`), criando contraste profissional e contemporâneo. |
| **Feedback Imediato & Tátil** | Todos os botões possuem estados ativos com redução de escala (`active:scale-95` / `scale-98`), estados de loading com spinners animados e toasts informativos no topo. |
| **Arquitetura Modular** | Componentes desacoplados, estilos compartilhados (`form-styles.css`), barra lateral unificada (`sidebar.js`) e catálogo compartilhado. |
| **Zero Emojis na Interface** | Uso exclusivo de iconografia vetorial FontAwesome 6 e SVGs para máxima sobriedade e padronização. |

---

## 3. Cores & Tokens Globais (Color Tokens)

### 3.1. Cores Primárias da Marca

```
+-----------------+  +-----------------+  +-----------------+
| Laranja Brago   |  | Laranja Claro   |  | Laranja Escuro  |
| #F97316         |  | #FB923C         |  | #EA580C         |
+-----------------+  +-----------------+  +-----------------+
+-----------------+  +-----------------+  +-----------------+
| Azul Royal      |  | Azul Corporativo|  | Dark Navy       |
| #0120F8         |  | #2F00FF         |  | #0B1EE0         |
+-----------------+  +-----------------+  +-----------------+
```

| Token / Variável | Valor Hex | Uso Principal | Classe Tailwind Equivalente |
|---|---|---|---|
| `--color-primary` | `#F97316` | Ações principais, botão "Continuar/Enviar", steppers ativos, borda de foco de inputs | `text-primary` / `bg-primary` / `border-orange-500` |
| `--color-primary-light` | `#FB923C` | Gradientes de botões primários, badges de destaque | `bg-orange-400` |
| `--color-primary-dark` | `#EA580C` | Hover de botões, estados pressionados e scrollbars | `bg-orange-600` |
| `--color-secondary` | `#0120F8` | Headers institucionais, cards hero, ícones corporativos Brago | `text-secondary` / `bg-secondary` / `bg-[#0120F8]` |
| `--color-royal` | `#2F00FF` | Barra lateral ativa do Command Center, botões de ação do gestor | `border-royal` / `text-royal` |
| `--color-royal-dark` | `#0118C8` / `#0D47A1` | Fim de gradientes em banners e cabeçalhos escuros | `bg-[#0118C8]` |

### 3.2. Cores Semânticas & Feedback

| Significado | Valor Hex | Tokens CSS | Uso no Sistema |
|---|---|---|---|
| **Sucesso (Success)** | `#10B981` / `#059669` | `--color-success` | Solicitação aprovada, concluída, cliente liberado, indicador de online, steps finalizados |
| **Atenção / Pendência (Warning)** | `#F59E0B` / `#EAB308` | `--color-warning` | Aguardando aprovação, pendente com supervisor, alertas de crédito, prazos próximos |
| **Perigo / Erro (Danger)** | `#EF4444` / `#DC2626` | `--color-danger` | Reprovações, cancelamentos, remoção de itens, retirada de equipamento, cliente inadimplente |
| **Informativo / Suporte (Info)** | `#3B82F6` / `#2563EB` | `--color-info` | Manutenção técnica, orientações, cards de documentação e links |
| **Evento Especial (Superagos)** | `#DFDD00` (Texto: `#0F172A`) | `--color-event` | Estande e formulário da feira Superagos (amarelo neon de alta visibilidade) |
| **Demonstração / Teste** | `#7C3AED` / `#9333EA` | `--color-demo` | Fluxo de demonstração de equipamentos (48h), novidades |
| **Artes & Personalização** | `#EC4899` / `#DB2777` | `--color-artes` | Módulo de personalização de embalagens e copos (Meiwa/Brago) |

### 3.3. Neutros & Superfícies

| Token | Hex | Descrição |
|---|---|---|
| `--color-bg-light` | `#F3F4F6` | Fundo padrão de telas mobile e formulários (Gray 100) |
| `--color-bg-command`| `#D7D7D7` ou `#F8FAFC` | Fundo do Command Center para contraste com cards brancos |
| `--color-surface` | `#FFFFFF` | Superfície de cards, modais, painéis e inputs |
| `--color-border` | `#E5E7EB` / `#E8EDF2` | Linhas divisórias, bordas de cards e inputs padrão |
| `--color-text-primary` | `#1F2937` / `#0F172A` | Títulos, textos de alta ênfase e valores em tabelas |
| `--color-text-secondary` | `#6B7280` / `#64748B` | Textos descritivos, rótulos auxiliares e ícones passivos |
| `--color-text-muted` | `#9CA3AF` / `#CBD5E1` | Placeholders, itens desabilitados e textos de rodapé |

### 3.4. Gradientes Padronizados

- **Hero Vendedor:**  
  `linear-gradient(135deg, #0B1EE0 0%, #0118C8 50%, #0D47A1 100%)`
- **Botão Primário / Destaque Laranja:**  
  `linear-gradient(135deg, #F97316 0%, #FB923C 100%)`
- **Botão Finalizar / Envio com Sucesso:**  
  `linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)` (Cyan 500/600)
- **Superagos (Alta Visibilidade):**  
  `linear-gradient(125deg, #0F172A 0%, #1E293B 55%, #35350A 100%)` com borda `rgba(223, 221, 0, 0.5)`
- **Banner Demonstração:**  
  `linear-gradient(135deg, #7C3AED 0%, #4F46E5 50%, #2563EB 100%)`

---

## 4. Tipografia & Escala

A tipografia do sistema utiliza como fonte primária a **Inter**, combinada com a **Roboto** e fontes do sistema operacional (*system-ui*).

```css
font-family: 'Inter', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Escala Tipográfica Oficial

| Nível | Tamanho Desktop | Tamanho Mobile | Peso (Font-Weight) | Uso Recomendado |
|---|---|---|---|---|
| **Display / 3XL** | 28px (`1.75rem`) | 24px (`1.5rem`) | 700 / 800 (Bold / Extrabold) | Cabeçalhos de boas-vindas, títulos principais de painel |
| **Title / 2XL** | 22px (`1.375rem`) | 20px (`1.25rem`) | 700 (Bold) | Títulos dos passos (Steps), cabeçalhos de seções principais |
| **Subtitle / XL** | 18px (`1.125rem`) | 17px (`1.06rem`) | 600 / 700 (Semibold / Bold) | Títulos de cards de serviço, títulos de modais |
| **Heading / LG** | 16px (`1rem`) | 15px (`0.93rem`) | 600 (Semibold) | Títulos de blocos internos, campos destacados |
| **Body / BASE** | 14px (`0.875rem`) | 14px (`0.875rem`) | 400 / 500 (Regular / Medium) | Texto corrido, inputs de formulário, botões padrão |
| **Small / SM** | 13px (`0.8125rem`) | 12.5px (`0.78rem`)| 500 / 600 (Medium / Semibold) | Labels de campos, dados em tabelas, subtítulos de cards |
| **Caption / XS** | 12px (`0.75rem`) | 11px (`0.6875rem`)| 400 / 500 | Descrições secundárias, metadados, contadores de itens |
| **Micro / 2XS** | 10px (`0.625rem`) | 9px (`0.5625rem`) | 800 / 900 (Black) | Badges de status uppercase, tags de novidade, SLA tags |

---

## 5. Espaçamento, Raios & Elevação

### 5.1. Escala de Espaçamento

O sistema segue a base modular de 4px / 8px:
- `space-1`: 4px
- `space-2`: 8px
- `space-3`: 12px
- `space-4`: 16px (padrão de padding em cards mobile)
- `space-5`: 20px
- `space-6`: 24px (padding em drawers e cards de dashboard)
- `space-8`: 32px

### 5.2. Raios de Borda (Border Radius)

```
+---------+   +---------+   +---------+   +---------+   +---------+
|  --sm   |   |  --md   |   |  --lg   |   |  --xl   |   | --full  |
|   6px   |   |  12px   |   |  16px   |   |  20px   |   | 9999px  |
+---------+   +---------+   +---------+   +---------+   +---------+
```

- **`radius-sm` (6px):** Badges compactos, tooltips e pequenas tags.
- **`radius-md` (12px):** Inputs, botões de ação e caixas de seleção.
- **`radius-lg` (16px):** Cards de serviço, cards de KPI e caixas de etapas.
- **`radius-xl` (20px - 24px):** Topo de modais *bottom-sheet* móveis, containers de formulário e cantos arredondados de heros.
- **`radius-full` (9999px):** Pílulas de status, botões circulares flutuantes, indicadores de steps e avatares.

### 5.3. Sombras & Profundidade (Elevation)

- **`shadow-sm`:** `0 1px 2px rgba(0, 0, 0, 0.05)` (Cards neutros em repouso)
- **`shadow-md`:** `0 4px 6px -1px rgba(0, 0, 0, 0.07)` (Cards com foco e botões)
- **`shadow-lg`:** `0 10px 15px -3px rgba(0, 0, 0, 0.1)` (Hover de cards e banners flutuantes)
- **`shadow-xl`:** `0 20px 25px -5px rgba(0, 0, 0, 0.15)` (Modais e popups)
- **Sombras Coloridas Especiais:**
  - Laranja: `box-shadow: 0 10px 20px rgba(249, 115, 22, 0.25)`
  - Verde: `box-shadow: 0 10px 20px rgba(16, 185, 129, 0.25)`
  - Azul: `box-shadow: 0 10px 24px rgba(1, 32, 248, 0.25)`

---

## 6. Componentes do Sistema (Component Library)

### 6.1. Hero Header do Vendedor (Mobile)

O cabeçalho inicial do app reúne a identidade visual da Brago, foto do vendedor, saudação personalizada com animação de digitação e contadores rápidos das solicitações.

```html
<header class="relative overflow-hidden">
  <!-- Gradiente de fundo com sobreposição suave -->
  <div class="absolute inset-0 bg-gradient-to-br from-[#0B1EE0] via-[#0118C8] to-[#0D47A1]"></div>
  <div class="max-w-lg mx-auto px-5 pt-5 pb-7 relative z-10">
    <div class="flex items-center justify-between mb-5">
      <img src="assets/Logo Brago App System Branco.svg" alt="BRAGO" class="h-6">
      <div class="flex items-center gap-2">
        <button class="w-9 h-9 rounded-xl bg-white/[0.08] backdrop-blur-sm flex items-center justify-center text-white/70">
          <i class="fas fa-gear text-sm"></i>
        </button>
      </div>
    </div>
    <!-- Linha do Usuário -->
    <div class="flex items-center gap-4 mb-6">
      <div class="w-[56px] h-[56px] rounded-full bg-gradient-to-br from-[#F97316] to-[#EC4899] ring-[3px] ring-white/20 flex items-center justify-center font-bold text-white text-lg">
        JS
      </div>
      <div>
        <p class="text-[13px] text-blue-200/80">Bom dia,</p>
        <h1 class="text-[20px] font-extrabold text-white">JOAZ SOUZA</h1>
      </div>
    </div>
  </div>
</header>
```

### 6.2. Cards de Serviços (Menu Principal em Grid 2xN)

Cards com visual tátil, ícones com cantos arredondados (`rounded-xl`), gradientes específicos por serviço e microinteração de clique.

```html
<div class="service-card bg-white rounded-2xl p-4 cursor-pointer shadow-sm hover:shadow-md transition active:scale-95">
  <div class="w-12 h-12 bg-gradient-to-br from-[#FF6B35] to-[#F97316] rounded-xl flex items-center justify-center shadow-md mb-3">
    <i class="fas fa-plus-circle text-white text-xl"></i>
  </div>
  <h3 class="text-sm font-bold text-gray-800 mb-0.5 leading-tight">Novo Comodato</h3>
  <p class="text-[11px] text-gray-400 leading-snug mb-3">Iniciar contrato com cliente</p>
  <div class="flex items-center text-[#F97316] text-[11px] font-semibold">
    <span>Solicitar</span>
    <i class="fas fa-arrow-right ml-1.5 text-[10px]"></i>
  </div>
</div>
```

**Mapeamento de Cores dos Serviços:**
- **Novo Comodato:** Ícone com gradiente Laranja (`#FF6B35` -> `#F97316`)
- **Manutenção Corretiva:** Ícone com gradiente Azul (`#3B82F6` -> `#2563EB`)
- **Retirada de Equipamento:** Ícone com gradiente Vermelho (`#EF4444` -> `#DC2626`)
- **Inclusão de Equipamento:** Ícone com gradiente Verde (`#10B981` -> `#059669`)
- **Substituição de Equipamento:** Fundo âmbar suave (`bg-orange-100`) com ícone laranja
- **Demonstração (48h):** Fundo roxo suave (`bg-purple-100`) com ícone roxo
- **Solicitar Arte Meiwa/Brago:** Fundo rosa suave (`bg-pink-100`) com ícone rosa

### 6.3. Wizard / Stepper Multi-Etapas

O padrão de formulários segue navegação passo a passo com barra de progresso horizontal e círculos numerados:

1. **Estado Concluído:** Fundo verde (`bg-green-500`), ícone de check (`fa-check`), texto verde.
2. **Estado Atual / Ativo:** Fundo laranja (`bg-[#F97316]`), ícone temático em branco, anel de foco.
3. **Estado Futuro / Pendente:** Fundo cinza suave (`bg-gray-200`), ícone cinza, texto desabilitado.

```html
<!-- Stepper Indicator -->
<div class="step-dot" data-step="1">
  <div class="w-9 h-9 rounded-full bg-[#F97316] border-4 border-white shadow-lg flex items-center justify-center">
    <i class="fas fa-building text-white text-sm"></i>
  </div>
  <span class="text-[10px] font-semibold text-gray-700">Cliente</span>
</div>
```

### 6.4. Barra de Ação Fixa no Rodapé (Bottom Navigation)

Garante acessibilidade com o polegar em celulares, contendo o botão "Voltar" e o botão "Continuar / Enviar".

```html
<footer class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
  <div class="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
    <div class="text-left">
      <p class="text-[10px] text-gray-400 uppercase tracking-wide">PRÓXIMO</p>
      <p class="text-xs font-bold text-[#F97316]">Categoria</p>
    </div>
    <div class="flex gap-3">
      <button class="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-semibold text-sm">
        <i class="fas fa-arrow-left mr-1.5"></i>Voltar
      </button>
      <button class="px-7 py-3 bg-gradient-to-r from-[#F97316] to-[#FB923C] text-white rounded-2xl font-bold text-sm shadow-lg">
        <span>Continuar</span><i class="fas fa-arrow-right ml-1.5"></i>
      </button>
    </div>
  </div>
</footer>
```

### 6.5. Formulários & Entradas de Dados

```css
/* Padrão de foco com anel translúcido */
input:focus, textarea:focus, select:focus {
    border-color: #F97316 !important;
    background: #FFFFFF;
    outline: none;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
}
```

- **Validação de Sucesso:** Borda `#10B981`, ícone de confirmação verde à direita (`<i class="fas fa-circle-check"></i>`).
- **Validação de Erro:** Borda `#EF4444`, fundo com matiz avermelhada suave (`rgba(239, 68, 68, 0.02)`), mensagem descritiva com ícone de alerta (`<i class="fas fa-circle-exclamation"></i>`) abaixo do campo.
- **Cards Selecionáveis de Escolha (Radio Cards):**
  - Meiwa: Borda laranja vibrante (`border-orange-500`), fundo com sutil brilho laranja.
  - Brago: Borda azul real (`border-[#0120F8]`), fundo azul sutil.

### 6.6. Dropzone de Upload de Arquivos

Área de transferência para logomarcas, fotos e comprovantes com indicação de formatos aceitos e limite de tamanho.

- Estados: Normal, Hover, Drag-over (`drag-over` com borda e fundo em destaque).
- Lista de arquivos anexados com chip contendo ícone de arquivo (`<i class="fas fa-file"></i>`), nome truncado, tamanho formatado (KB/MB) e botão de remoção rápida (`<i class="fas fa-xmark"></i>`).

### 6.7. Feedback, Toasts & Alertas

#### Toast Flutuante Centralizado
```html
<div id="toast" class="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-2">
  <i class="fas fa-check-circle text-green-400"></i>
  <span>Operação realizada com sucesso!</span>
</div>
```

#### Alerta em Linha (Ex: Cliente Inadimplente)
```html
<div class="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 text-xs text-amber-900 leading-relaxed shadow-sm">
  <div class="flex items-start gap-2.5">
    <i class="fas fa-triangle-exclamation text-amber-600 text-base flex-shrink-0 mt-0.5"></i>
    <div>
      <p class="font-bold text-amber-900 text-sm mb-1">Aviso — Fila de Baixa Prioridade (Inadimplência)</p>
      <p>Cliente com pendência financeira em aberto. Produção liberada mediante pagamento antecipado.</p>
    </div>
  </div>
</div>
```

### 6.8. Padrões de Navegação Desktop (Command Center / Gestão)

#### Barra Lateral Canônica (`assets/sidebar.js`)
- **Fundo:** `#FFFFFF` com borda direita sutil `1px solid rgba(0, 0, 0, 0.05)`.
- **Item Normal:** Cor `#64748B`, transição suave de 0.25s, padding `px-6 py-4`, `rounded-2xl`.
- **Item Ativo:** Fundo `#F3F4F6`, borda esquerda `4px solid #2F00FF`, cor `#2F00FF`.
- **Divisores de Grupo:** Borda cinza suave separando *Operações de Comodato*, *DP/RH* e *Administração*.

#### Cards de KPI Executivos com Shimmer
```html
<div class="kpi-card bg-white p-5 rounded-2xl border border-black/5 shadow-sm relative overflow-hidden">
  <div class="flex items-center justify-between mb-3">
    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Contratos</span>
    <div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
      <i class="fas fa-file-signature"></i>
    </div>
  </div>
  <p class="text-3xl font-extrabold text-gray-900">1.284</p>
  <span class="text-[11px] text-emerald-600 font-bold mt-1 inline-flex items-center gap-1">
    <i class="fas fa-arrow-up"></i> +12% este mês
  </span>
</div>
```

#### Gaveta Lateral de Inspeção (*Drawer Panel* - 680px)
- Painel fixo que desliza da direita para exibir detalhes completos de Ordens de Serviço (OS), histórico de eventos e assinaturas sem perder a visão do quadro ou tabela ao fundo.
- Overlay com desfoque de fundo (`backdrop-filter: blur(2px)`).

---

## 7. Padrões de UX, Resiliência & Offline-First

1. **Persistência Dupla (Rascunho Automático):**
   - Campos de texto e seleções simples são salvos via `AutoFormPersistence` no `localStorage`.
   - Arquivos binários anexados (logos, fotos, PDFs) e objetos complexos são salvos no `IndexedDB` (`comodato_arte_draft`).
   - Ao recarregar ou sofrer fechamento acidental da tela, o formulário pergunta se o usuário deseja restaurar os dados anteriores ou começar do zero.

2. **Prevenção de Duplicidade (Idempotency Key):**
   - Todo envio gera uma chave única estável (`idempotency_key`).
   - Se houver retry automático por oscilação de sinal, o backend rejeita duplicações e devolve a confirmação existente.

3. **Proteção contra Cliques Múltiplos:**
   - No momento do envio, o botão é imediatamente desabilitado (`disabled = true`) e tem seu conteúdo trocado para um spinner com rótulo "Enviando...".

---

## 8. Diretrizes Técnicas de Código (Tailwind & CSS)

> **ATENÇÃO TÉCNICA OBRIGATÓRIA (BUILD ESTÁTICO DO TAILWIND):**  
> O projeto utiliza um arquivo CSS estático purgado (`frontend/assets/css/tailwind.css`).  
> **Não invente classes utilitárias arbitrárias do Tailwind** que nunca foram utilizadas antes no repositório (ex.: `w-[432px]` ou classes raras), pois elas não existirão no arquivo compilado e falharão em silêncio.

### Boas Práticas:
1. **Reaproveitamento:** Utilize as classes presentes no `tailwind.css` e as classes utilitárias de `form-styles.css` e `painel-marketing.css`.
2. **Estilos Dinâmicos e Novos Layouts:** Sempre que precisar de um tamanho, cor ou comportamento que não esteja previsto nas classes existentes, utilize estilos em linha explícitos:
   ```html
   <!-- Correto e seguro no Comodato -->
   <div style="width: 280px; background: #DFDD00;"></div>
   ```
3. **PWA Mobile Viewport:** Manter meta tags de visualização para prevenir zoom indesejado em formulários de entrada de dados no celular:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
   ```
4. **Links e Ícones:** Utilizar ícones do **FontAwesome 6.4.0** com classes consistentes (`fas fa-...`). **Nunca use emojis unicode.**

---

## 9. Sumário Rápido de Referência (Cheat Sheet)

```
Regra de Iconografia:
  ZERO EMOJIS na UI. Sempre usar FontAwesome 6 (<i class="fas fa-..."></i>) ou SVGs.

Cores Principais:
  Laranja Brago: #F97316 (Ação primária)
  Azul Royal:    #0120F8 / #2F00FF (Identidade institucional)
  Sucesso:       #10B981 (Aprovado / Online)
  Perigo:        #EF4444 (Erro / Reprovado / Retirada)
  Aviso:         #F59E0B (Pendente / Inadimplente)
  Superagos:     #DFDD00 (Feiras & Eventos)

Fontes:
  Principal:     Inter, Roboto, sans-serif
  Código/Docs:   Monaco, Consolas, monospace

Raios de Borda:
  Inputs/Botões: 12px (rounded-xl)
  Cards:         16px (rounded-2xl)
  Containers:    20px - 24px (rounded-3xl)
  Pills/Avatares: 9999px (rounded-full)
```
