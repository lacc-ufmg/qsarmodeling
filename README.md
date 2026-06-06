# QSAR Modeling

**QSAR Modeling** é uma ferramenta desktop para construção e validação de modelos QSAR/QSPR de forma acessível, sem exigir conhecimento especializado em quimioinformática.

A Relação Estrutura-Atividade Quantitativa (QSAR) combina Química Computacional e _Machine Learning_ para prever propriedades de compostos (biológicas, físico-químicas, etc.) a partir das suas estruturas moleculares. Esse tipo de análise tem aplicações em diversas áreas: Química, Farmacologia, Biologia, Cosmetologia, entre outras.

Totalmente reescrita em Rust, esta nova versão representa um avanço paradigmático em termos de performance, robustez e usabilidade. Leia **[⚡ Por que Rust?](https://github.com/lacc-ufmg/qsarmodeling/wiki/%E2%9A%A1-Por-que-Rust%3F)** para mais detalhes.

## Objetivo e Requisitos

O **objetivo central** deste projeto é viabilizar análises QSAR/QSPR para pesquisadores sem formação específica em quimioinformática. Para isso, os requisitos abaixo guiam todas as decisões técnicas:

| # | Requisito | Descrição |
|---|-----------|-----------|
| 1 | **Usabilidade** | Interface intuitiva, acessível a usuários com pouca familiaridade com QSAR |
| 2 | **Compatibilidade** | Suporte mínimo a Windows e Linux; leitura de formatos comuns (`.csv`, `.xlsx`, etc.) |
| 3 | **Distribuição** | Instaladores nativos (`.exe`, `.deb`, `.AppImage`, …) sem necessidade de configurar ambiente |
| 4 | **Performance** | Uso eficiente de recursos: funcionar bem em hardware modesto |
| 5 | **Robustez** | Comportamento previsível, com testes unitários e de integração garantindo corretude numérica e estatística |

## Funcionalidades planejadas

| Estado | Funcionalidade                     | Detalhes                           |
| ------ | ---------------------------------- | ---------------------------------- |
| 🔴     | Carregar estruturas moleculares    | `.mol2`, `.sdf`, ou via SMILES     |
| 🔴     | Integração com cálculos quânticos  | ORCA, Psi4, Gaussian, etc.         |
| 🔴     | Geração de descritores moleculares | Inicialmente via LQTAGrid          |
| 🟢     | Importar descritores moleculares   | `X.csv` ($M\times N$)                            |
| 🟢     | Importar propriedades-alvo         | `y.csv` ($M\times 1$)                |
| 🟢     | Filtragem de descritores           |         |
|      | ↳ Variância                        | Ordered Predictors Selection       |
|      | ↳ y-correlação                     | Algoritmos Genéticos               |
|      | ↳ Colinearidade                    | Algoritmos Genéticos               |
| 🟡     | Seleção de variáveis               | Métodos de seleção automática      |
|      | ↳ OPS                              | Ordered Predictors Selection       |
|      | ↳ GA                               | Algoritmos Genéticos               |
| 🟡     | Construção do modelo               | Pipeline completo de modelagem     |
| ⚪     | Validação do modelo                | Validações estatísticas e cruzadas |
| ⚪     | Visualização e exportação          | Resultados e relatórios            |

> [!TIP]
> ```
> 🟢 Feito              ⚪ Planejado
> 🟡 Em andamento       🔴 Futuro/Talvez
> ```

## Autores e Licença

Este software é desenvolvido por autores do [LACC-UFMG](https://github.com/lacc-ufmg) e distribuído sob licença GPL v3.0.

### Principais contribuidores

- [**Heliton Martins Reis Filho**](https://github.com/hellmrf) (mantenedor principal)
- [**Prof. Dr. João Paulo Ataíde Martins**](https://github.com/joaopauloam) (algoritmos originais e supervisão científica)

## Contribuindo

Para contribuir com o projeto, comece lendo a [Wiki](https://github.com/lacc-ufmg/qsarmodeling/wiki/) do repositório.
