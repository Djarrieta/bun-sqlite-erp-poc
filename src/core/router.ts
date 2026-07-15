import type { User } from "../auth/auth.db.ts";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Everything a route handler needs to serve a request. */
export interface RouteContext {
  req: Request;
  url: URL;
  params: Record<string, string>;
  user: User;
}

export type RouteHandler = (ctx: RouteContext) => Response | Promise<Response>;

interface CompiledRoute {
  method: Method;
  regex: RegExp;
  keys: string[];
  handler: RouteHandler;
}

/**
 * Tiny path-pattern router. Patterns use `:name` for path params, e.g.
 * `/items/:id`. Keep patterns free of regex metacharacters. Routes are
 * matched in registration order, so register literal paths (e.g. `/items/new`)
 * before parameterized ones (e.g. `/items/:id`).
 */
export class Router {
  private routes: CompiledRoute[] = [];

  add(method: Method, path: string, handler: RouteHandler): this {
    const keys: string[] = [];
    const source =
      "^" +
      path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => {
        keys.push(key);
        return "([^/]+)";
      }) +
      "$";
    this.routes.push({ method, regex: new RegExp(source), keys, handler });
    return this;
  }

  get(path: string, handler: RouteHandler): this {
    return this.add("GET", path, handler);
  }
  post(path: string, handler: RouteHandler): this {
    return this.add("POST", path, handler);
  }
  put(path: string, handler: RouteHandler): this {
    return this.add("PUT", path, handler);
  }
  patch(path: string, handler: RouteHandler): this {
    return this.add("PATCH", path, handler);
  }
  delete(path: string, handler: RouteHandler): this {
    return this.add("DELETE", path, handler);
  }

  /** Find the first route matching the method + path, extracting params. */
  match(
    method: string,
    pathname: string
  ): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1] ?? "");
      });
      return { handler: route.handler, params };
    }
    return null;
  }
}
