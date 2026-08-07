const express = require('express');
const { runCommand } = require('../utils/exec');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

async function buildHealthInfo() {
  const info = {
    status: 'online',
    timestamp: new Date().toISOString(),
    versions: {},
  };

  try {
    const pgDump = await runCommand('pg_dump', ['--version']);
    info.versions.pg_dump = pgDump.stdout.trim();
  } catch (e) {
    info.versions.pg_dump = 'indisponivel';
  }

  try {
    const supabaseCli = await runCommand('supabase', ['--version']);
    info.versions.supabase_cli = supabaseCli.stdout.trim();
  } catch (e) {
    info.versions.supabase_cli = 'indisponivel';
  }

  return info;
}

// /health fica publico (sem chave) — usado por healthcheck do Docker/monitoramento.
router.get('/health', async (req, res) => {
  const info = await buildHealthInfo();
  res.json(info);
});

// /status exige autenticacao — e o endpoint que a Lovable chama para validar
// a chave configurada na pagina /configuracoes. Aceita os mesmos formatos de
// header definidos em middleware/auth.js (x-worker-auth-key, x-worker-token,
// x-api-key, authorization Bearer ou puro).
router.get('/status', authMiddleware, async (req, res) => {
  const info = await buildHealthInfo();
  res.json(info);
});

module.exports = router;
