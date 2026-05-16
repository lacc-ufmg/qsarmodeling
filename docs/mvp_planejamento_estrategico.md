# QSAR Platform — MVP & Planejamento Estratégico

> [!WARNING]
> Documento gerado artificialmente (Claude 4.6 Sonnet) e não revisado.

## 1. Análise de Dores (Problem Space)

### Persona primária: Pesquisador de modelagem molecular
*Perfil: PhD ou pós-doc em quimioinformática, farmacologia computacional ou química medicinal. Trabalha em grupo acadêmico com funding ou em CRO de pequeno porte.*

| Dor | Intensidade | Solução atual (insatisfatória) |
|-----|-------------|-------------------------------|
| Softwares comerciais inacessíveis financeiramente | 🔴 Alta | Piratear licenças ou usar alternativas limitadas |
| Ferramentas open source (PaDEL, DRAGON free) com UX ruim e sem manutenção ativa | 🔴 Alta | Gambiarras em scripts Python |
| Pipeline fragmentado: um software por etapa, formatos incompatíveis | 🔴 Alta | Scripts de conversão frágeis |
| Reprodutibilidade impossível ou difícil de garantir | 🟡 Média | Documentação manual exaustiva |
| Integração com pacotes QM (ORCA, PSI4) manual e propensa a erro | 🟡 Média | Shell scripts artesanais |
| Processamento pesado em máquina local trava tudo | 🟡 Média | Submissão a cluster HPC (quando disponível) |
| Curva de aprendizado de ferramentas como RDKit + sklearn + scripts próprios | 🟡 Média | Tutoriais desatualizados do YouTube |

### Persona secundária: Cientista em farmacêutica/agroquímica
*Perfil: MSc ou PhD em CADD, empresa de médio/grande porte. Tem budget, mas enfrenta burocracia de TI e compliance.*

| Dor | Intensidade | Nota |
|-----|-------------|------|
| Dependência de fornecedor único (Schrödinger, Certara) | 🔴 Alta | Lock-in caro |
| Dados proprietários não podem ir para cloud | 🔴 Alta | Seu modelo local é argumento direto de venda |
| Onboarding de novos modelos demora meses | 🟡 Média | Burocracia de validação interna |
| Relatórios de validação não padronizados | 🟡 Média | Cada grupo faz diferente |

## 2. TAM / SAM / SOM

### Mercado global de software QSAR/cheminformatics
Estimativas conservadoras baseadas em dados públicos do setor (Grand View Research, relatórios de conferências EuroQSAR):

```
TAM — Mercado global de software de modelagem molecular
≈ USD 1.2–1.8 bilhão/ano (inclui docking, MD, QSAR, ADMET)

SAM — QSAR/QSPR específico + descritores + ML aplicado
≈ USD 120–200 milhões/ano
(estimativa: ~3.000–5.000 grupos ativos globalmente,
 ~600–1.000 empresas com pipeline computacional)

SOM — Acessível nos primeiros 3 anos (academia + CROs menores)
≈ USD 2–8 milhões/ano
(meta realista: 200–500 licenças pagas, mix acadêmico/comercial)
```

### Por que o SAM é menor do que parece
QSAR "puro" (sem docking, sem MD) tem público menor que o campo geral de CADD. Mas é um nicho mal atendido — a maioria dos softwares dedicados a QSAR tem 10+ anos sem renovação séria de UX ou metodologia.

## 3. Posicionamento Competitivo

### Mapa competitivo

| Software | Preço | UX | QSAR 4D | Open? | Ativo? |
|---|---|---|---|---|---|
| Schrödinger Canvas | ~$20k+/ano | Boa | Não | Não | Sim |
| StarDrop (Optibrium) | ~£10k/ano | Boa | Parcial | Não | Sim |
| DRAGON 7 | ~€2k/licença | Ruim | Não | Não | Pouco |
| PaDEL | Gratuito | Péssima | Não | Sim | Não |
| OCHEM | Gratuito (web) | Média | Não | Parcial | Sim |
| **Seu software** | €300–4k/ano | **Ótima** | **Sim** | **Core** | **Sim** |

### Posicionamento: "O único QSAR 4D com UX moderna, dados 100% locais e preço acessível"

Três pilares de diferenciação:
1. **Descritores 4D proprietários** — metodologia própria é barreira de entrada real
2. **Privacidade total** — dados nunca saem da máquina (argumento decisivo para indústria)
3. **Pipeline integrado** — do arquivo QM ao modelo validado, sem trocar de software

## 4. Estratégia de Pricing

### Estrutura open core

```
┌─────────────────────────────────────────────────────┐
│  COMMUNITY (MIT / gratuito para sempre)             │
│  • Descritores 2D/3D via RDKit-rs ou chemfiles      │
│  • PCA, PLS, MLR                                    │
│  • Validação básica (LOO, 5-fold CV)                │
│  • Leitura SDF, CSV, XYZ                            │
│  • Exportação de resultados em CSV                  │
└─────────────────────────────────────────────────────┘
         ↓ upgrade natural quando precisar de mais
┌─────────────────────────────────────────────────────┐
│  ACADEMIC  €290/ano por usuário                     │
│  + Descritores 4D completos                         │
│  + OPS e GA para seleção de variáveis               │
│  + Y-scrambling, bootstrap, AD (domain of           │
│    applicability)                                   │
│  + Integração ORCA/PSI4 (wizard)                    │
│  + Exportação de relatório PDF                      │
│  + Suporte por e-mail (48h)                         │
│  Elegível: e-mail institucional ou carta do PI      │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│  PROFESSIONAL  €990/ano por usuário                 │
│  + Tudo do Academic                                 │
│  + Batch processing (múltiplos datasets)            │
│  + API local (HTTP) para integração com pipelines   │
│  + Suporte prioritário (24h)                        │
│  + Licença para uso comercial de modelos gerados    │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│  ENTERPRISE  €8.000–25.000/ano (site license)       │
│  + Usuários ilimitados na organização               │
│  + Treinamento remoto (2h onboarding)               │
│  + SLA de suporte (4h resposta)                     │
│  + Customização de relatórios com logo              │
│  + NDA + contrato formal                            │
│  Negociação direta, por proposta                    │
└─────────────────────────────────────────────────────┘
```

### Métricas de viabilidade financeira

| Cenário | Licenças | MRR equivalente | ARR |
|---------|----------|-----------------|-----|
| Conservador (ano 1) | 20 Academic + 5 Professional | — | €10.8k |
| Moderado (ano 2) | 60 Academic + 20 Pro + 1 Enterprise | — | €56k |
| Otimista (ano 3) | 150 Academic + 60 Pro + 4 Enterprise | — | €200k |

Break-even de dedicação parcial: ~30–40 licenças pagas. Possível no ano 1 com execução focada.

## 5. MVP — 3 Semanas

O objetivo do MVP não é ter tudo funcionando — é ter **o suficiente para mostrar a alguém real e coletar feedback pago (ou carta de intenção)**.

### Semana 1 — Esqueleto que funciona end-to-end

**Meta:** Um binário que abre o browser, carrega um CSV com descritores pré-calculados e exibe uma tabela.

```
Dia 1–2: Backend Rust
├── axum com rota GET / (serve index.html embutido via rust-embed)
├── rota POST /api/dataset (recebe JSON, devolve ACK)
├── rota GET /api/health
└── Abertura automática do browser (open crate)

Dia 3–4: Frontend React/Vite
├── Upload de arquivo CSV (File API)
├── Parsing client-side (papaparse)
├── Tabela de dados com paginação básica
└── Estado global simples (Zustand)

Dia 5: Integração + empacotamento
├── Vite build → assets estáticos → rust-embed
├── cargo build --release funcional nas 3 plataformas
└── Teste manual básico
```

**Critério de conclusão:** Qualquer pessoa consegue baixar o binário, abrir, carregar um CSV e ver os dados.

### Semana 2 — Análise real

**Meta:** Rodar PCA e PLS em dados reais com visualização utilizável.

```
Dia 6–7: PCA
├── ndarray + implementação PCA (ou crate linfa)
├── Rota POST /api/pca → devolve scores, loadings, variância explicada
├── Scores plot interativo (Plotly.js ou Recharts scatter)
└── Loading plot

Dia 8–9: PLS + Regressão
├── PLS1 via ndarray (implementação direta — ~200 linhas)
├── Rota POST /api/pls
├── Predicted vs Observed plot
└── R², Q² (LOO) calculados no backend

Dia 10: WebSocket para progresso
├── tokio + axum WebSocket
├── Canal de progresso para cálculos > 1s
└── Barra de progresso na UI
```

**Critério de conclusão:** Consegue carregar dataset de QSAR real (ex: dataset de Debnath, público), rodar PCA + PLS e ver os gráficos.

### Semana 3 — Diferencial + distribuição

**Meta:** Mostrar o que nenhum concorrente gratuito faz.

```
Dia 11–12: Detecção de software externo
├── Detecção de ORCA/PSI4 no PATH e caminhos comuns
├── UI de configuração ("ORCA encontrado em /opt/orca/orca")
├── Execução de job simples via tokio::process
└── Captura de stdout em tempo real via WebSocket

Dia 13–14: Seleção de variáveis (versão simples)
├── OPS simplificado (versão determinística, sem GA ainda)
│   → selecionável para tier pago futuramente
└── Exibição do subconjunto selecionado + modelo resultante

Dia 15: Empacotamento e landing page
├── cargo-bundle → .dmg, .exe, .AppImage
├── GitHub Releases com binários
├── Landing page estática (Next.js ou Astro)
│   └── Proposta de valor + waitlist/email capture
└── Vídeo de demo de 3 min (Loom)
```

**Critério de conclusão:** Landing page no ar, binário disponível para download, formulário de waitlist capturando e-mails.

## 6. O que fica fora do MVP (e por quê)

| Feature | Por que adiar |
|---------|---------------|
| Descritores 4D no app | Complexidade alta; usá-los como arquivo de entrada é suficiente para validar |
| GA para seleção de variáveis | OPS simples valida o conceito; GA é detalhe de implementação |
| Sistema de licenças | Não monetize antes de ter usuários pedindo para pagar |
| Suporte a múltiplos formatos (MOL2, SDF) | CSV de descritores é suficiente para o MVP |
| Relatório PDF | Nice to have; não é o que convence no primeiro contato |

## 7. Go-to-Market (primeiros 90 dias pós-MVP)

### Canal 1: Comunidade científica (semanas 1–4)
- Post no r/cheminformatics e r/chemistry com demo + link
- Thread no Mastodon científico (fosstodon.org tem comunidade ativa de quimioinformática)
- E-mail direto para 10–20 professores de quimioinformática conhecidos na sua rede
- **Meta:** 100 downloads, 20 e-mails de feedback, 3 conversas aprofundadas

### Canal 2: Preprint + publicação (semanas 4–12)
- Submeter para *Journal of Cheminformatics* (open access, alto impacto no nicho)
  - Foco: metodologia dos descritores 4D + benchmarks
  - Mencionar o software como implementação de referência
- Preprint no ChemRxiv primeiro (feedback rápido, citável)
- **Meta:** Aceite ou R&R em 90 dias; isso gera citações que geram downloads

### Canal 3: Conferências (paralelo)
- EuroQSAR (anual, europeu) — submeter abstract de poster/talk
- QSAR World (online, mais acessível)
- ACS National Meeting se tiver acesso
- **Meta:** 1 apresentação em 6 meses

### Sequência de conversão sugerida
```
Download gratuito
    → uso real por 2–4 semanas
    → hit em feature do tier pago (GA, relatório, 4D)
    → e-mail automático: "Você está usando X,
      disponível no plano Academic por €290/ano"
    → conversão
```

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Adoção lenta (nicho pequeno) | Alta | Alto | Open core cria base de usuários sem barreira; academia vira referência |
| Concorrente grande copia funcionalidade 4D | Média | Médio | Publicar metodologia primeiro cria prioridade intelectual |
| Usuário não quer instalar binário desconhecido | Média | Médio | Código aberto + build reprodutível elimina a desconfiança |
| Manutenção solo insustentável | Alta | Alto | Escopo mínimo, dependências bem escolhidas; buscar colaborador técnico cedo |
| Plataformas QM mudam interface de linha de comando | Baixa | Médio | Abstração no backend; adaptar por plugin |

## 9. Stack Técnica Definitiva

```toml
# Cargo.toml — dependências principais
axum = "0.7"           # servidor HTTP + WebSocket
tokio = { features = ["full"] }
rust-embed = "8"       # embutir frontend no binário
serde_json = "1"
ndarray = "0.16"
ndarray-linalg = "0.16"  # LAPACK bindings
faer = "0.19"          # álgebra linear alternativa, sem deps C
rayon = "1"            # paralelismo
which = "6"            # detecção de softwares externos
open = "5"             # abrir browser automaticamente
```

```json
// package.json — frontend
"dependencies": {
  "react": "^18",
  "zustand": "^4",
  "plotly.js-dist": "^2",
  "papaparse": "^5",
  "@tanstack/react-table": "^8"
}
```

```yaml
# GitHub Actions — build cross-platform
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
```

## 10. KPIs para os primeiros 6 meses

| Métrica | Mês 1 | Mês 3 | Mês 6 |
|---------|-------|-------|-------|
| Downloads totais | 50 | 300 | 1.000 |
| Usuários ativos (abriu 3x+) | 10 | 60 | 200 |
| E-mails de feedback recebidos | 5 | 25 | 60 |
| Licenças pagas | 0 | 3 | 15 |
| ARR | €0 | €870 | €7.5k |
| Estrelas no GitHub | 30 | 150 | 400 |

O GitHub star count importa nesse mercado — pesquisadores avaliam atividade do repositório antes de adotar.
