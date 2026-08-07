const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const unzipper = require('unzipper');
const archiver = require('archiver');
const { runCommand } = require('../utils/exec');
const logger = require('../utils/logger');

const router = express.Router();
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
const upload = multer({ dest: TMP_DIR });

/**
 * POST /backup/edge-functions
 * body: { projectRef, accessToken, backupId }
 * Usa a Supabase CLI para listar e baixar o codigo-fonte de cada Edge Function.
 */
router.post('/backup/edge-functions', async (req, res) => {
  const { projectRef, accessToken, backupId } = req.body;

  if (!projectRef || !accessToken || !backupId) {
    return res.status(400).json({ error: 'projectRef, accessToken e backupId sao obrigatorios.' });
  }

  const workDir = path.join(TMP_DIR, `${backupId}-functions`);
  fs.mkdirSync(workDir, { recursive: true });

  const env = { SUPABASE_ACCESS_TOKEN: accessToken };

  try {
    // A CLI baixa o codigo das funcoes para ./supabase/functions quando rodada dentro de um projeto linkado.
    await runCommand('supabase', ['link', '--project-ref', projectRef], { cwd: workDir, env });
    await runCommand('supabase', ['functions', 'download', '--project-ref', projectRef], { cwd: workDir, env }).catch(async () => {
      // Fallback: algumas versoes da CLI exigem baixar funcao por funcao apos listar.
      const list = await runCommand('supabase', ['functions', 'list', '--project-ref', projectRef], { cwd: workDir, env });
      logger.warn('functions download em lote indisponivel, usando fallback por funcao', { raw: list.stdout });
    });

    // Empacota tudo em um zip para o backend da Lovable buscar depois.
    const zipPath = path.join(TMP_DIR, `${backupId}-functions.zip`);
    await zipDirectory(path.join(workDir, 'supabase', 'functions'), zipPath);

    logger.info('Backup de edge functions concluido', { backupId });
    res.json({ success: true, backupId, zipPath: `/tmp/${backupId}-functions.zip` });
  } catch (err) {
    logger.error('Falha no backup de edge functions', { backupId, error: err.message });
    res.status(500).json({ success: false, error: 'Falha ao baixar edge functions.', details: err.stderr || err.message });
  }
});

/**
 * POST /restore/edge-functions (deploy)
 * multipart/form-data: file (zip com as funcoes), projectRef, accessToken
 * Extrai o zip e roda "supabase functions deploy" para cada funcao, reportando progresso por funcao.
 */
router.post('/restore/edge-functions', upload.single('file'), async (req, res) => {
  const { projectRef, accessToken, envVarsJson } = req.body;
  const file = req.file;

  if (!projectRef || !accessToken || !file) {
    return res.status(400).json({ error: 'projectRef, accessToken e o arquivo zip das funcoes sao obrigatorios.' });
  }

  const workDir = path.join(TMP_DIR, `deploy-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const functionsDir = path.join(workDir, 'supabase', 'functions');
  fs.mkdirSync(functionsDir, { recursive: true });

  const env = { SUPABASE_ACCESS_TOKEN: accessToken };
  const results = [];

  try {
    await fs.createReadStream(file.path).pipe(unzipper.Extract({ path: functionsDir })).promise();

    await runCommand('supabase', ['link', '--project-ref', projectRef], { cwd: workDir, env });

    const functionNames = fs.readdirSync(functionsDir).filter((f) =>
      fs.statSync(path.join(functionsDir, f)).isDirectory()
    );

    const envVars = envVarsJson ? JSON.parse(envVarsJson) : {};

    for (const fnName of functionNames) {
      try {
        if (envVars[fnName]) {
          const secretsArgs = Object.entries(envVars[fnName]).map(([k, v]) => `${k}=${v}`);
          if (secretsArgs.length) {
            await runCommand('supabase', ['secrets', 'set', ...secretsArgs, '--project-ref', projectRef], { cwd: workDir, env });
          }
        }

        await runCommand('supabase', ['functions', 'deploy', fnName, '--project-ref', projectRef], { cwd: workDir, env });
        results.push({ function: fnName, status: 'sucesso' });
        logger.info('Deploy de edge function concluido', { function: fnName });
      } catch (fnErr) {
        results.push({ function: fnName, status: 'falha', details: fnErr.stderr || fnErr.message });
        logger.error('Falha no deploy de edge function', { function: fnName, error: fnErr.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    logger.error('Falha geral no deploy de edge functions', { error: err.message });
    res.status(500).json({ success: false, error: 'Falha ao processar deploy das edge functions.', details: err.message, results });
  } finally {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
});

function zipDirectory(sourceDir, outPath) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(sourceDir)) fs.mkdirSync(sourceDir, { recursive: true });
    archive.directory(sourceDir, false).on('error', reject).pipe(stream);
    stream.on('close', resolve);
    archive.finalize();
  });
}

module.exports = router;
