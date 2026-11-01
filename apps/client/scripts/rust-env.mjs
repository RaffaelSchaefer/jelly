import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export function withCargoPath(env, home = homedir()) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const cargoBin = join(env.CARGO_HOME || join(home, '.cargo'), 'bin');
  return {
    ...env,
    [pathKey]: [env[pathKey], cargoBin].filter(Boolean).join(delimiter),
  };
}
