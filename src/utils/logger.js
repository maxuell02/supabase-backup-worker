function timestamp() {
  return new Date().toISOString();
}

// Nunca logar connectionString, senha, access key, secret key ou tokens completos.
const logger = {
  info: (msg, meta = {}) => console.log(`[${timestamp()}] [INFO] ${msg}`, meta),
  warn: (msg, meta = {}) => console.warn(`[${timestamp()}] [WARN] ${msg}`, meta),
  error: (msg, meta = {}) => console.error(`[${timestamp()}] [ERROR] ${msg}`, meta),
};

module.exports = logger;
