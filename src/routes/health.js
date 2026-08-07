const express = require('express');
const { runCommand } = require('../utils/exec');

const router = express.Router();

router.get('/health', async (req, res) => {
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

  res.json(info);
});

module.exports = router;
