const crypto = require('crypto');
const fs = require('fs');

/**
 * Calcula o checksum SHA-256 de um arquivo em disco (streaming, seguro para arquivos grandes).
 */
function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

module.exports = { sha256OfFile };
