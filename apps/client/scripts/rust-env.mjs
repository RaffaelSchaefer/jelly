import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * Kopie von `env`, deren Suchpfad zusätzlich `$CARGO_HOME/bin` (sonst `~/.cargo/bin`) enthält.
 *
 * So findet ein Unterprozess eine frisch installierte Rustup-Toolchain, auch wenn das Terminal den
 * neuen PATH noch nicht kennt. Unter Windows heißt die Variable oft `Path`; diese Schreibweise
 * bleibt erhalten, statt eine zweite `PATH`-Variable anzulegen.
 *
 * @param {NodeJS.ProcessEnv} env Umgebung des aufrufenden Prozesses. Wird nicht verändert.
 * @param {string} [home] Home-Verzeichnis, für Tests überschreibbar.
 */
export function withCargoPath(env, home = homedir()) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const cargoBin = join(env.CARGO_HOME || join(home, ".cargo"), "bin");
  return {
    ...env,
    [pathKey]: [env[pathKey], cargoBin].filter(Boolean).join(delimiter),
  };
}
