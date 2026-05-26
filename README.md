# QSAR Kit

A Relação Estrutura-Atividade Quantitativa (QSAR) aplica técnicas de Química Computacional e Machine Learning para prever a atividade (*e.g.*, biológica) de compostos a partir da sua estrutura química.

**QSAR Kit** é uma ferramenta que permite a construção e validação de modelos QSAR de forma acessível e amigável. Com ela, qualquer pessoa pode, de posse das estruturas químicas dos compostos e suas atividades, gerar um modelo preditivo validado.

> [!TIP]
> Leia: [MVP e Planejamento Estratégico](docs/mvp_planejamento_estrategico.md)

## Tecnologias

Não podemos ignorar a existência de muitas funcionalidades no [QSARModelingPy](https://github.com/hellmrf/QSARModelingPy), [HullQSAR](https://github.com/hellmrf/HullQSAR). No entanto, a oportunidade de otimizar a experiência do usuário elege outras tecnologias possíveis.

Para evitar os custos proibitivos de hospedagem, inicialmente, pensei em distribuir o *software* como um instalável (`.dmg`, `.exe`, `.AppImage` e talvez `snap` ou `flatpak` para Linux) contendo:

- App Tauri (Rust)
- Frontend em React + Vite

O usuário poderia:

- Selecionar as estruturas localmente (.mol2, .sdf...) ou via SMILES
- Selecionar um arquivo ou informar as propriedades-alvo
- Utilizar as ferramentas disponíveis localmente para fazer os cálculos (orca, psi4, gaussian...)
- Gerar descritores usando o método escolhido (inicialmente LQTAGrid)
- Filtrar os descritores (redução de dimensionalidade)
- Selecionar as melhores variáveis
- Gerar o modelo completo
- Rodar as validações
- Visualizar os resultados

## Desenvolvimento

As dependências são:

- Node v24
- rustup

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

1. Instale o `pnpm`
```bash
npm i -g pnpm
```
2. Instale as dependências Node.js
```bash
pnpm install
```
3. Instale o `rustup`
4. Rode o script `dev`:
```bash
pnpm dev

# equivale a:
just dev
```

