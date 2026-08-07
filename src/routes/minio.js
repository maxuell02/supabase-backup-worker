const express = require('express');
const path = require('path');
const fs = require('fs');
const { Client } = require('minio');
const logger = require('../utils/logger');

const router = express.Router();
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');

/**
 * Faz o parse da connection string simplificada definida no prompt de MinIO:
 * s3://ACCESS_KEY:SECRET_KEY@endpoint:porta/bucket
 */
function parseMinioConnectionString(connectionString) {
  const match = connectionString.match(/^s3:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/(.+)$/);
  if (!match) throw new Error('Connection string do MinIO invalida. Formato esperado: s3://ACCESS_KEY:SECRET_KEY@endpoint:porta/bucket');
  const [, accessKey, secretKey, endPoint, port, bucket] = match;
  return { accessKey, secretKey, endPoint, port: parseInt(port, 10), bucket };
}

function buildClient({ endPoint, port, accessKey, secretKey, useSSL }) {
  return new Client({ endPoint, port, useSSL: !!useSSL, accessKey, secretKey });
}

/**
 * POST /minio/test-connection
 * body: { connectionString, useSSL }
 * Testa a conexao e cria o bucket automaticamente caso nao exista.
 */
router.post('/minio/test-connection', async (req, res) => {
  const { connectionString, useSSL = false } = req.body;
  if (!connectionString) return res.status(400).json({ error: 'connectionString e obrigatoria.' });

  try {
    const parsed = parseMinioConnectionString(connectionString);
    const client = buildClient({ ...parsed, useSSL });

    const exists = await client.bucketExists(parsed.bucket).catch(() => false);
    let bucketCreated = false;

    if (!exists) {
      await client.makeBucket(parsed.bucket);
      bucketCreated = true;
    }

    logger.info('Teste de conexao MinIO OK', { endpoint: parsed.endPoint, bucket: parsed.bucket, bucketCreated });

    res.json({
      success: true,
      endpoint: parsed.endPoint,
      port: parsed.port,
      bucket: parsed.bucket,
      bucketExisted: exists,
      bucketCreated,
    });
  } catch (err) {
    logger.error('Falha no teste de conexao MinIO', { error: err.message });
    res.status(500).json({ success: false, error: 'Falha ao conectar no MinIO.', details: err.message });
  }
});

/**
 * POST /minio/upload
 * body: { connectionString, useSSL, localFilePath, objectName }
 * Sobe um arquivo ja existente no volume local (gerado por /backup/database, por exemplo) para o MinIO.
 */
router.post('/minio/upload', async (req, res) => {
  const { connectionString, useSSL = false, localFilePath, objectName } = req.body;

  if (!connectionString || !localFilePath || !objectName) {
    return res.status(400).json({ error: 'connectionString, localFilePath e objectName sao obrigatorios.' });
  }

  const resolvedPath = path.join(TMP_DIR, path.basename(localFilePath));
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ error: 'Arquivo local nao encontrado no worker.' });
  }

  try {
    const parsed = parseMinioConnectionString(connectionString);
    const client = buildClient({ ...parsed, useSSL });

    const exists = await client.bucketExists(parsed.bucket).catch(() => false);
    if (!exists) await client.makeBucket(parsed.bucket);

    await client.fPutObject(parsed.bucket, objectName, resolvedPath);

    logger.info('Upload para MinIO concluido', { bucket: parsed.bucket, objectName });
    res.json({ success: true, bucket: parsed.bucket, objectName });
  } catch (err) {
    logger.error('Falha no upload para MinIO', { error: err.message });
    res.status(500).json({ success: false, error: 'Falha ao subir arquivo para o MinIO.', details: err.message });
  }
});

/**
 * POST /minio/download
 * body: { connectionString, useSSL, objectName, backupId }
 * Baixa um objeto do MinIO para o volume local do worker, para uso em restore.
 */
router.post('/minio/download', async (req, res) => {
  const { connectionString, useSSL = false, objectName, backupId } = req.body;

  if (!connectionString || !objectName || !backupId) {
    return res.status(400).json({ error: 'connectionString, objectName e backupId sao obrigatorios.' });
  }

  try {
    const parsed = parseMinioConnectionString(connectionString);
    const client = buildClient({ ...parsed, useSSL });

    const destPath = path.join(TMP_DIR, `${backupId}-${path.basename(objectName)}`);
    await client.fGetObject(parsed.bucket, objectName, destPath);

    logger.info('Download do MinIO concluido', { bucket: parsed.bucket, objectName });
    res.json({ success: true, localPath: `/tmp/${path.basename(destPath)}` });
  } catch (err) {
    logger.error('Falha no download do MinIO', { error: err.message });
    res.status(500).json({ success: false, error: 'Falha ao baixar arquivo do MinIO.', details: err.message });
  }
});

module.exports = router;
