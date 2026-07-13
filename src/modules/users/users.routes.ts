import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { authService } from "../auth/auth.service.ts";
import { UserRepository } from "../auth/auth.db.ts";
import {
  USERS_MODULE,
  parseNewUserForm,
  parsePasswordForm,
  generateTempPassword,
} from "./users.rules.ts";
import {
  userNewPage,
  userPasswordPage,
  usersListPage,
  usersTableFragment,
} from "./users.views.ts";

/**
 * Admin-only user management. Every handler checks the `users` module rules, and
 * deletes are guarded so an admin can't remove themselves or the last admin.
 */
export function registerUserRoutes(router: Router): void {
  const users = new UserRepository();

  // List
  router.get("/users", ({ user }: RouteContext) => {
    if (!can(user, USERS_MODULE, "view")) return forbidden();
    return html(usersListPage(users.list(), user));
  });

  // New form — registered before "/users/:id" style routes (there are none yet).
  router.get("/users/new", ({ user }: RouteContext) => {
    if (!can(user, USERS_MODULE, "create")) return forbidden();
    return html(
      userNewPage(user, {
        email: "",
        role: "member",
        password: generateTempPassword(),
      })
    );
  });

  // Create
  router.post("/users", async ({ req, user }: RouteContext) => {
    if (!can(user, USERS_MODULE, "create")) return forbidden();
    const { email, password, role, errors } = parseNewUserForm(
      await req.formData()
    );
    if (Object.keys(errors).length > 0) {
      return html(userNewPage(user, { email, role, password }, errors), 400);
    }
    const result = await authService.createUser(email, password, role);
    if (!result.ok) {
      return html(
        userNewPage(user, { email, role, password }, { email: result.error ?? "" }),
        400
      );
    }
    return redirect("/users");
  });

  // Set a temporary password (admin override) — form
  router.get("/users/:id/password", ({ user, params }: RouteContext) => {
    if (!can(user, USERS_MODULE, "update")) return forbidden();
    const target = users.findById(Number(params.id));
    if (!target) return notFound();
    return html(userPasswordPage(user, target, ""));
  });

  // Set a temporary password (admin override) — submit
  router.post("/users/:id/password", async ({ req, user, params }: RouteContext) => {
    if (!can(user, USERS_MODULE, "update")) return forbidden();
    const target = users.findById(Number(params.id));
    if (!target) return notFound();
    const { password, errors } = parsePasswordForm(await req.formData());
    if (Object.keys(errors).length > 0)
      return html(
        userPasswordPage(user, target, password, { error: errors.password }),
        400
      );
    const result = await authService.adminSetPassword(target.id, password);
    if (!result.ok)
      return html(
        userPasswordPage(user, target, password, { error: result.error }),
        400
      );
    return html(userPasswordPage(user, target, password, { success: true }));
  });

  // Delete
  router.delete("/users/:id", ({ user, params }: RouteContext) => {
    if (!can(user, USERS_MODULE, "delete")) return forbidden();
    const targetId = Number(params.id);
    const target = users.findById(targetId);
    if (!target) return notFound();
    // Safety: never delete yourself or the last remaining admin.
    if (target.id === user.id)
      return forbidden("No puedes eliminar tu propia cuenta.");
    if (target.role === "admin" && users.countByRole("admin") <= 1)
      return forbidden("No puedes eliminar al último administrador.");
    users.delete(targetId);
    return html(usersTableFragment(users.list(), user));
  });
}
