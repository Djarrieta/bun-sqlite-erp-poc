import type { Router } from "./router.ts";

/**
 * Base class every feature module extends so it can be mounted uniformly and
 * discovered by shared UI (e.g. the navigation bar). Subclasses declare their
 * identity and register their routes/permissions in `register()`.
 */
export abstract class AppModule {
  /** Unique key, also used for permission lookups (e.g. "items"). */
  abstract readonly name: string;
  /** Human label for navigation (e.g. "Items"). */
  abstract readonly label: string;
  /** Base path for the module's routes (e.g. "/items"). */
  abstract readonly basePath: string;
  /** Register the module's routes (and permissions) on the shared router. */
  abstract register(router: Router): void;
}

const registered: AppModule[] = [];

/** Mount a module: register its routes and remember it for navigation. */
export function registerModule(router: Router, module: AppModule): void {
  module.register(router);
  registered.push(module);
}

/** All mounted modules, in registration order. */
export function getModules(): readonly AppModule[] {
  return registered;
}
