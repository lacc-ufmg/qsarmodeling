## Ambiente de desenvolvimento

### 1. Rust

Instale o [`rustup`](https://rustup.rs/):

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Tauri System Dependencies

Instale as [dependências de Tauri](https://v2.tauri.app/start/prerequisites/#system-dependencies).

Em Debian/Ubuntu, use:

```sh
sudo apt update -y
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### 3. Node.js
Instale o [Node.js v24](https://nodejs.org/en/download) diretamente ou via [`nvm`](https://github.com/nvm-sh/nvm).

O `nvm` permite a utilização de múltiplas versões do Node.js. Se optar por utilizá-lo, [instale-o](https://github.com/nvm-sh/nvm#installing-and-updating) e então execute os comandos a seguir no repositório:

```sh
nvm install --default
nvm use
```

### 4. `pnpm`

```sh
npm i -g pnpm
```

### 5. Just (opcional, mas recomendado)

Instale o [Just](https://just.systems/):

```sh
cargo install just
```

### IDE Recomendada

[VS Code](https://code.visualstudio.com/) com as extensões:
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
