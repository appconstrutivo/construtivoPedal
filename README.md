# Construtivo Pedal — PDV

Projeto **novo e independente** de ponto de venda (PDV), desenvolvido do zero.

- **Offline-first** com armazenamento local
- Preparado para **Supabase** no futuro (sem acoplamento a outros sistemas)
- Repositório: [github.com/appconstrutivo/construtivoPedal](https://github.com/appconstrutivo/construtivoPedal)

## Como rodar

```bash
npm install
cp .env.example .env.local   # opcional, quando houver projeto Supabase
npm run dev
```

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase (futuro) |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/public (futuro) |

## Stack

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 3
