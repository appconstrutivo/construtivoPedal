import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2]
const name = process.argv[3]
if (!file || !name) {
  console.error('Usage: node apply-sql-mcp.mjs <sql-file> <migration-name>')
  process.exit(1)
}

const query = fs.readFileSync(path.resolve(file), 'utf8')
const payload = {
  project_id: 'cwjopgywdynsvhmxqcxh',
  name,
  query,
}
process.stdout.write(JSON.stringify(payload))
