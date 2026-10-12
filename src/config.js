function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida (veja .env.example)`);
  return value;
}

const encryptionKey = required('ENCRYPTION_KEY');
if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
  throw new Error('ENCRYPTION_KEY precisa ter 64 caracteres hexadecimais (32 bytes)');
}

export const config = {
  port: Number(process.env.PORT) || 8080,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  encryptionKey: Buffer.from(encryptionKey, 'hex'),
  corsOrigin: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
};
