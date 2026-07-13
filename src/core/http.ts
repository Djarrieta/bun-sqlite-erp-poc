/** Shared HTTP response helpers used across the app and its feature modules. */

export function html(
  body: string,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

export function redirect(
  location: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...headers },
  });
}

export function notFound(message = "Not Found"): Response {
  return new Response(message, { status: 404 });
}

/**
 * A downloadable file response (sets `Content-Disposition: attachment`). Keep
 * `filename` a trusted, developer-supplied value — it goes into the header.
 */
export function attachment(
  body: string | Uint8Array,
  filename: string,
  contentType = "application/octet-stream"
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** 403 response for when a user's business rules don't permit an action. */
export function forbidden(
  message = "No tienes permiso para hacer esto."
): Response {
  return html(
    `<p style="font-family:system-ui;padding:2rem;text-align:center">403 · ${message}</p>`,
    403
  );
}
