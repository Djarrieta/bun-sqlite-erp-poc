// Minimal ambient declarations for the Bun runtime globals used in this app.
// These let the TypeScript editor resolve `process` and `Bun` when the
// official type packages (`bun-types` / `@types/bun`) are not installed.
// When network access is available, run `bun add -d @types/bun` and this
// file can be deleted.

declare const process: {
  env: Record<string, string | undefined>;
};

declare const Bun: {
  env: Record<string, string | undefined>;
  serve(options: {
    port?: number;
    fetch(req: Request): Response | Promise<Response>;
  }): { port: number };
  file(path: string | URL): Blob & { exists(): Promise<boolean> };
  write(
    destination: string | URL,
    input: string | Uint8Array | ArrayBuffer | Blob
  ): Promise<number>;
  password: {
    hash(
      password: string,
      algorithm?:
        | "argon2id"
        | "argon2i"
        | "argon2d"
        | "bcrypt"
        | { algorithm: "argon2id" | "argon2i" | "argon2d"; memoryCost?: number; timeCost?: number }
        | { algorithm: "bcrypt"; cost?: number }
    ): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
  };
};

declare module "bun:sqlite" {
  export class Database {
    constructor(
      filename?: string,
      options?: { create?: boolean; readonly?: boolean }
    );
    exec(sql: string): void;
    query<Row = unknown, Params extends unknown[] = unknown[]>(
      sql: string
    ): {
      all(...params: Params): Row[];
      get(...params: Params): Row | null;
      run(...params: Params): void;
    };
    transaction<Fn extends (...args: any[]) => any>(fn: Fn): Fn;
  }
}
