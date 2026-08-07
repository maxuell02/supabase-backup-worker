/**
 * Exige o header "x-worker-auth-key" batendo com WORKER_AUTH_KEY.
 * O endpoint /health fica fora dessa exigência (ver server.js).
 */
function authMiddleware(req, res, next) {
  const expected = process.env.WORKER_AUTH_KEY;
  const provided = req.header('x-worker-auth-key');

  if (!expected) {
    return res.status(500).json({ error: 'WORKER_AUTH_KEY nao configurada no worker.' });
  }

  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Nao autorizado. Chave de autenticacao invalida ou ausente.' });
  }

  next();
}

module.exports = authMiddleware;
