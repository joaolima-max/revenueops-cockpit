import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'prisma/config'

// O Prisma 7 nao carrega mais arquivos .env sozinho quando existe um
// prisma.config.ts, entao a CLI enxergava DATABASE_URL como undefined.
// Resolvemos pela pasta deste arquivo, e nao pelo cwd, para o carregamento
// nao depender de onde a CLI foi chamada. Variaveis ja exportadas no shell
// continuam tendo precedencia sobre o arquivo.
for (const envFile of ['.env.local', '.env']) {
  const envPath = join(__dirname, envFile)
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
