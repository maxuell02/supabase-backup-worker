const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { runCommand } = require('../utils/exec');
const { sha256OfFile } = require('../utils/checksum');
const logger = require('../utils/logger');

const router = express.Router();
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
const upload = multer({ dest: TMP_DIR, limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '500', 10)) * 1024 * 1024 } });

/**
 * POST /backup/database
 * body: { connectionString, backupId, format } // format: "plain" | "custom"
 * Executa pg_dump e retorna caminho local + checksum.
 * O backend da Lovable e responsavel por buscar o arquivo depois (GET /files/:backupId)
 * ou orientar o upload para MinIO (POST /minio/upload).
 */
router.post('/backup/database', async (req, res) => {
  const { connectionString, backupId, format = 'custom' } = req.body;

  if (!connectionString || !backupId) {
    return res.status(400).json({ error: 'connectionString e backupId sao obrigatorios.' });
  }

  const ext = format === 'plain' ? 'sql' : 'dump';
  const outputPath = path.join(TMP_DIR, `${backupId}.${ext}`);

  const args = [
    connectionString,
    '-F', format === 'plain' ? 'p' : 'c',
    '-f', outputPath,
    '--no-owner',
    '--no-privileges',
  ];

  try {
    logger.info('Iniciando pg_dump', { backupId, format });
    await runCommand('pg_dump', args);

    const checksum = await sha256OfFile(outputPath);
    const stats = fs.statSync(outputPath);

    logger.info('pg_dump concluido', { backupId, sizeBytes: stats.size });

    res.json({
      success: true,
      backupId,
      format,
      filePath: `/tmp/${backupId}.${ext}`,
      fileName: `${backupId}.${ext}`,
      sizeBytes: stats.size,
      checksumSha256: checksum,
    });
  } catch (err) {
    logger.error('Falha no pg_dump', { backupId, error: err.message });
    res.status(500).json({
      success: false,
      error: 'Falha ao executar pg_dump.',
      details: err.stderr || err.message,
    });
  }
});

/**
 * POST /restore/database
 * multipart/form-data: file (o dump), connectionString, format
 * Executa pg_restore (formato custom) ou psql (formato plain) contra o banco de destino.
 */
router.post('/restore/database', upload.single('file'), async (req, res) => {
  const { connectionString, format = 'custom' } = req.body;
  const file = req.file;

  if (!connectionString || !file) {
    return res.status(400).json({ error: 'connectionString e o arquivo de dump sao obrigatorios.' });
  }

  try {
    logger.info('Iniciando restore do banco', { format, originalName: file.originalname });

    if (format === 'plain') {
      await runCommand('psql', [connectionString, '-f', file.path]);
    } else {
      await runCommand('pg_restore', [
        '--no-owner',
        '--no-privileges',
        '-d', connectionString,
        file.path,
      ]);
    }

    fs.unlinkSync(file.path);

    logger.info('Restore do banco concluido');
    res.json({ success: true, message: 'Restore do banco concluido com sucesso.' });
  } catch (err) {
    logger.error('Falha no restore do banco', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Falha ao restaurar o banco.',
      details: err.stderr || err.message,
    });
  } finally {
    if (file && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (_) {}
    }
  }
});

/**
 * GET /files/:fileName
 * Permite ao backend da Lovable baixar um arquivo gerado (ex: apos o backup, para enviar ao MinIO
 * ou repassar como download direto ao usuario, conforme a Fase de "Download do Banco").
 */
router.get('/files/:fileName', (req, res) => {
  const filePath = path.join(TMP_DIR, req.params.fileName);
  if (!filePath.startsWith(TMP_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo nao encontrado.' });
  }
  res.download(filePath);
});

module.exports = router;
