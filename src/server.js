require('dotenv').config();
const express = require('express');
const authMiddleware = require('./middleware/auth');
const logger = require('./utils/logger');

const healthRoutes = require('./routes/health');
const databaseRoutes = require('./routes/database');
const storageRoutes = require('./routes/storage');
const edgeFunctionsRoutes = require('./routes/edgeFunctions');
const minioRoutes = require('./routes/minio');

const app = express();
app.use(express.json({ limit: '10mb' }));

// /health fica publico (sem chave) para o Portainer/monitoramento externo checar status.
app.use(healthRoutes);

// Todas as demais rotas exigem a chave de autenticacao do worker.
app.use(authMiddleware);
app.use(databaseRoutes);
app.use(storageRoutes);
app.use(edgeFunctionsRoutes);
app.use(minioRoutes);

app.use((err, req, res, next) => {
  logger.error('Erro nao tratado', { error: err.message });
  res.status(500).json({ error: 'Erro interno no worker.' });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  logger.info(`Worker de backup rodando na porta ${PORT}`);
});
