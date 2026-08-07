/**
 * Exige a chave configurada em WORKER_AUTH_KEY, aceitando qualquer um destes formatos
 * (compatibilidade com diferentes clientes/backends que podem chamar o worker):
 *  - x-worker-auth-key: <token>
 *  - x-worker-token: <token>
 *  - x-api-key: <token>
 *  - authorization: Bearer <token>
 *  - authorization: <token>
 * O endpoint /health fica fora dessa exigência (ver server.js).
 */
function extractProvidedToken(req) {
  const direct = req.header('x-worker-auth-key') || req.header('x-worker-token') || req.header('x-api-key');
  if (direct) return direct;

  const authHeader = req.header('authorization');
  if (authHeader) {
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  }

  return null;
}

function authMiddleware(req, res, next) {
  const expected = process.env.WORKER_AUTH_KEY;

  if (!expected) {
    return res.status(500).json({ error: 'WORKER_AUTH_KEY nao configurada no worker.' });
  }

  const provided = extractProvidedToken(req);

  if (!provided || provided.trim() !== expected.trim()) {
    return res.status(401).json({ error: 'Nao autorizado. Chave de autenticacao invalida ou ausente.' });
  }

  next();
}

module.exports = authMiddleware;
