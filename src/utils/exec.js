const { spawn } = require('child_process');

/**
 * Executa um comando de sistema e resolve com stdout/stderr completos.
 * Usado para pg_dump, pg_restore, psql e supabase CLI.
 * Nunca loga env (pode conter senha/token) — apenas o nome do comando.
 */
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(options.env || {}) },
      cwd: options.cwd,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      reject(new Error(`Falha ao iniciar "${command}": ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(Object.assign(new Error(`Comando "${command}" saiu com codigo ${code}`), { stdout, stderr, code }));
      }
    });
  });
}

module.exports = { runCommand };
