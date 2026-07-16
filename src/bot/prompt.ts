import type { User } from "../auth/auth.db.ts";
import { allowedActions } from "../core/permissions.ts";
import { availableToolNames } from "./tools.ts";

/** Modules surfaced to the assistant, with human labels for the prompt. */
const MODULES: { key: string; label: string }[] = [
  { key: "items", label: "Artículos" },
  { key: "locations", label: "Ubicaciones" },
  { key: "inventory", label: "Inventario" },
  { key: "movements", label: "Movimientos" },
  { key: "companies", label: "Compañías" },
  { key: "contacts", label: "Contactos" },
  { key: "projects", label: "Proyectos" },
  { key: "visits", label: "Bitácoras" },
  { key: "tasks", label: "Tareas" },
  { key: "users", label: "Usuarios" },
];

/**
 * Build the system prompt for one user. It states the current date, the user's
 * role and exactly which actions they may perform per module (from the same
 * permission matrix the web app uses), the tools available to them, and the
 * confirmation policy for writes.
 */
export function buildSystemPrompt(user: User): string {
  const today = new Date().toISOString().slice(0, 10);

  const caps =
    MODULES.map(({ key, label }) => {
      const actions = allowedActions(user, key);
      return actions.length ? `- ${label} (${key}): ${actions.join(", ")}` : null;
    })
      .filter(Boolean)
      .join("\n") || "- (sin permisos)";

  const tools = availableToolNames(user).join(", ") || "(ninguna)";

  return `Eres el asistente de un ERP al que se accede por Telegram. Respondes en español, de forma breve y clara.

Fecha de hoy: ${today}.

## Usuario
- Correo: ${user.email}
- Rol: ${user.role}

## Capacidades del usuario (módulo: acciones permitidas)
${caps}

## Herramientas
Usa SIEMPRE las herramientas para consultar o modificar datos; nunca inventes datos, cantidades ni ids. Si te falta un dato (por ejemplo un id), búscalo primero con una herramienta de lectura. Herramientas disponibles para este usuario: ${tools}.

## Reglas
- Solo puedes hacer lo que permita el rol del usuario. Si pide algo fuera de sus permisos, explícalo con cortesía y no lo intentes.
- Para crear, actualizar, archivar o eliminar, el sistema pedirá una CONFIRMACIÓN antes de ejecutar: propón la acción llamando a la herramienta correspondiente y el sistema mostrará un resumen y esperará "sí" o "no". No afirmes que algo se realizó hasta que se confirme.
- Antes de actualizar o eliminar algo mencionado por nombre, localiza primero su id con una herramienta de lectura.
- Las fechas de los eventos usan el formato "YYYY-MM-DDTHH:MM".
- Sé conciso: resume los resultados en lenguaje natural en lugar de volcar JSON crudo.`;
}
