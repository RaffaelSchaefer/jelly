import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withCargoPath } from './rust-env.mjs';

describe('Rust subprocess environment', () => {
  it('finds a standard rustup installation when the inherited PATH omits Cargo', () => {
    const env = { PATH: '/existing/tools', KEEP: 'unchanged' };
    const result = withCargoPath(env, '/user/home');
    expect(result.PATH.split(delimiter)).toEqual(['/existing/tools', join('/user/home', '.cargo', 'bin')]);
    expect(result.KEEP).toBe('unchanged');
    expect(env.PATH).toBe('/existing/tools');
  });

  it('uses a custom CARGO_HOME, including paths containing spaces', () => {
    const result = withCargoPath({ PATH: '/tools', CARGO_HOME: '/custom rust' }, '/user/home');
    expect(result.PATH.split(delimiter)).toEqual(['/tools', join('/custom rust', 'bin')]);
  });

  it('preserves Windows Path casing without creating a competing PATH variable', () => {
    const result = withCargoPath({ Path: '/tools' }, '/user/home');
    expect(result.Path.split(delimiter)).toEqual(['/tools', join('/user/home', '.cargo', 'bin')]);
    expect(result).not.toHaveProperty('PATH');
  });

  it('works without an inherited search path', () => {
    expect(withCargoPath({}, '/user/home').PATH).toBe(join('/user/home', '.cargo', 'bin'));
  });
});
