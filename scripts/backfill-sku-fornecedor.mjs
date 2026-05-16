import XLSX from 'xlsx'
import fs from 'fs'

const xlsxPath = process.argv[2]
if (!xlsxPath) {
  console.error('Uso: node scripts/backfill-sku-fornecedor.mjs <caminho.xlsx>')
  process.exit(1)
}

const esc = (s) => String(s).replace(/'/g, "''")
const wb = XLSX.readFile(xlsxPath)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
const updates = []

for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  if (!r || !r[1]) continue
  const sku = String(r[0]).trim()
  const nome = String(r[1]).replace(/\s+/g, ' ').trim()
  if (!sku || !nome) continue
  updates.push(
    `update public.estoque_itens set sku_fornecedor = '${esc(sku)}' where ativo = true and upper(trim(nome)) = upper(trim('${esc(nome)}'));`,
  )
}

const out = 'supabase/sql/_backfill_sku_fornecedor_temp.sql'
fs.writeFileSync(out, updates.join('\n'))
console.log('Gerado', out, '—', updates.length, 'updates')
