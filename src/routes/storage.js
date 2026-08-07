const express = require('express');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const router = express.Router();
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');

/**
 * POST /backup/storage
 * body: { projectUrl, serviceRoleKey, backupId }
 * Lista buckets e baixa todos os arquivos via API REST de Storage do Supabase,
 * salvando localmente na mesma estrutura de diretorios do bucket original.
 */
router.post('/backup/storage', async (req, res) => {
  const { projectUrl, serviceRoleKey, backupId } = req.body;

  if (!projectUrl || !serviceRoleKey || !backupId) {
    return res.status(400).json({ error: 'projectUrl, serviceRoleKey e backupId sao obrigatorios.' });
  }

  const destDir = path.join(TMP_DIR, `${backupId}-storage`);
  fs.mkdirSync(destDir, { recursive: true });

  try {
    const bucketsResp = await fetch(`${projectUrl}/storage/v1/bucket`, {
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    });
    if (!bucketsResp.ok) throw new Error(`Falha ao listar buckets (HTTP ${bucketsResp.status})`);
    const buckets = await bucketsResp.json();

    const manifest = { backupId, buckets: [] };

    for (const bucket of buckets) {
      const bucketDir = path.join(destDir, bucket.name);
      fs.mkdirSync(bucketDir, { recursive: true });

      const listResp = await fetch(`${projectUrl}/storage/v1/object/list/${bucket.name}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: '', limit: 10000 }),
      });
      const files = listResp.ok ? await listResp.json() : [];

      let downloaded = 0;
      for (const f of files) {
        if (!f.id) continue; // pula "pastas" virtuais sem id
        const fileResp = await fetch(`${projectUrl}/storage/v1/object/${bucket.name}/${f.name}`, {
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
        });
        if (!fileResp.ok) continue;
        const buffer = Buffer.from(await fileResp.arrayBuffer());
        const filePath = path.join(bucketDir, f.name);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buffer);
        downloaded++;
      }

      manifest.buckets.push({ name: bucket.name, public: bucket.public, filesDownloaded: downloaded });
    }

    fs.writeFileSync(path.join(destDir, 'manifest-storage.json'), JSON.stringify(manifest, null, 2));

    logger.info('Backup de storage concluido', { backupId, buckets: manifest.buckets.length });
    res.json({ success: true, backupId, manifest, localPath: `/tmp/${backupId}-storage` });
  } catch (err) {
    logger.error('Falha no backup de storage', { backupId, error: err.message });
    res.status(500).json({ success: false, error: 'Falha ao fazer backup do storage.', details: err.message });
  }
});

/**
 * POST /restore/storage
 * body: { projectUrl, serviceRoleKey, backupId }
 * Le a pasta local ja baixada (via MinIO/local, extraida previamente pelo backend)
 * e recria buckets + reenvia arquivos.
 */
router.post('/restore/storage', async (req, res) => {
  const { projectUrl, serviceRoleKey, backupId } = req.body;
  const sourceDir = path.join(TMP_DIR, `${backupId}-storage`);

  if (!fs.existsSync(sourceDir)) {
    return res.status(400).json({ error: 'Diretorio local do backup de storage nao encontrado. Extraia o pacote antes de chamar este endpoint.' });
  }

  try {
    const manifestPath = path.join(sourceDir, 'manifest-storage.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const results = [];

    for (const bucketInfo of manifest.buckets) {
      await fetch(`${projectUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: bucketInfo.name, public: bucketInfo.public }),
      }); // ignora erro se ja existir

      const bucketDir = path.join(sourceDir, bucketInfo.name);
      const filesUploaded = await uploadDirRecursive(bucketDir, bucketDir, projectUrl, serviceRoleKey, bucketInfo.name);
      results.push({ bucket: bucketInfo.name, filesUploaded });
    }

    logger.info('Restore de storage concluido', { backupId });
    res.json({ success: true, backupId, results });
  } catch (err) {
    logger.error('Falha no restore de storage', { backupId, error: err.message });
    res.status(500).json({ success: false, error: 'Falha ao restaurar o storage.', details: err.message });
  }
});

async function uploadDirRecursive(baseDir, currentDir, projectUrl, serviceRoleKey, bucketName) {
  let count = 0;
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      count += await uploadDirRecursive(baseDir, fullPath, projectUrl, serviceRoleKey, bucketName);
    } else {
      const relativePath = path.relative(baseDir, fullPath);
      const fileBuffer = fs.readFileSync(fullPath);
      const resp = await fetch(`${projectUrl}/storage/v1/object/${bucketName}/${relativePath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'x-upsert': 'true',
        },
        body: fileBuffer,
      });
      if (resp.ok) count++;
    }
  }
  return count;
}

module.exports = router;
