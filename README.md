# agenda-nunes

Projeto de agenda web com Firebase (Auth + Firestore), pronto para deploy estático.

## Link com Firebase

Este repositório já está ligado ao projeto Firebase `agenda-nunes` via `.firebaserc`.

### Pré-requisitos
- Node.js instalado
- Firebase CLI instalada (`npm i -g firebase-tools`)
- Login no Firebase CLI

```bash
firebase login
```

### Deploy no Firebase Hosting

```bash
firebase deploy --only hosting
```

Arquivos de configuração usados:
- `firebase.json`
- `.firebaserc`

## Link com Netlify

O deploy no Netlify está preparado com `netlify.toml` (publicação da raiz do projeto).

### Opção A — UI do Netlify
1. Crie um novo site no Netlify conectando este repositório.
2. Build command: `echo 'Static build - no compilation needed'`
3. Publish directory: `.`

### Opção B — Netlify CLI

```bash
npm i -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

## Observações
- O app consome Firebase diretamente no front-end (config em `config.js`).
- Como é um projeto estático, não há etapa de build obrigatória.
