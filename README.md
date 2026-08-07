# Supabase Backup Worker

Worker externo (Node.js + Docker) responsável pelas operações que não rodam em Edge Functions:
`pg_dump`/`pg_restore`, deploy de Edge Functions via Supabase CLI, backup/restore do Storage e integração com MinIO.

## Deploy no Portainer

1. No Portainer, vá em **Stacks → Add Stack**.
2. Dê um nome (ex.: `supabase-backup-worker`).
3. Escolha **Repository** (se for subir este código para um Git) ou **Web editor** e cole o conteúdo de `docker-compose.yml`.
4. Se usar o Web editor, você também vai precisar que o Portainer tenha acesso ao `Dockerfile` e à pasta `src/` — a forma mais simples é subir este projeto para um repositório Git (mesmo privado) e usar a opção **Repository** no Stack, apontando build context para a raiz do repo.
5. Em **Environment variables**, adicione:
   - `WORKER_AUTH_KEY` → gere com `openssl rand -hex 32`
   - `MAX_UPLOAD_SIZE_MB` → opcional, padrão 500
6. Deploy the stack. Aguarde o build (instala `postgresql-client` + Supabase CLI, pode levar alguns minutos na primeira vez).
7. Confirme que subiu acessando `http://SEU_IP:3333/health` — deve retornar `status: online` e as versões do `pg_dump`/`supabase` instaladas.

## Configuração na página /configuracoes da Lovable

- **URL do worker**: `http://SEU_IP:3333` (ou domínio/proxy reverso, se configurado)
- **Chave de autenticação**: o mesmo valor definido em `WORKER_AUTH_KEY`

Todas as chamadas (exceto `/health`) exigem autenticação. O worker aceita qualquer um destes formatos de header, com o valor de `WORKER_AUTH_KEY`:
```
x-worker-auth-key: <token>
x-worker-token: <token>
x-api-key: <token>
authorization: Bearer <token>
authorization: <token>
```

## Endpoints disponíveis

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Status do worker + versões de pg_dump/Supabase CLI (sem autenticação) |
| GET | `/status` | Igual ao `/health`, mas **exigindo autenticação** — é o endpoint usado pela Lovable para validar a chave configurada em `/configuracoes` |
| POST | `/backup/database` | Executa `pg_dump`, retorna caminho local + checksum SHA-256 |
| POST | `/restore/database` | Recebe upload do dump e executa `pg_restore`/`psql` |
| GET | `/files/:fileName` | Baixa um arquivo gerado (para envio ao MinIO ou download direto pelo usuário) |
| POST | `/backup/storage` | Baixa todos os buckets/arquivos via API REST de Storage |
| POST | `/restore/storage` | Recria buckets e reenvia arquivos a partir de um backup local |
| POST | `/backup/edge-functions` | Baixa o código-fonte das Edge Functions via Supabase CLI |
| POST | `/restore/edge-functions` | Extrai um zip de funções e faz deploy via `supabase functions deploy`, uma a uma |
| POST | `/minio/test-connection` | Testa conexão e cria o bucket automaticamente se não existir |
| POST | `/minio/upload` | Sobe um arquivo local para o MinIO |
| POST | `/minio/download` | Baixa um objeto do MinIO para o volume local |

## Observações importantes

- Este worker **não persiste jobs em fila** — cada chamada roda de forma síncrona e retorna o resultado. Para volumes grandes de backup, considere que a requisição HTTP pode levar minutos; ajuste o timeout do lado do backend da Lovable de acordo (ou evolua este worker para um sistema de filas como BullMQ, se o volume justificar).
- Arquivos temporários ficam no volume `worker_data` (`/app/tmp` dentro do container) — implemente uma rotina de limpeza periódica (ex.: `node-cron` já está nas dependências) para não acumular arquivos indefinidamente.
- Nunca são logadas connection strings, senhas, access keys, secret keys ou tokens completos — apenas metadados (nomes de bucket, IDs de backup, contagem de arquivos).
- Este worker assume que o backend da Lovable envia as credenciais já descriptografadas apenas no momento da chamada (nunca armazenadas aqui).
