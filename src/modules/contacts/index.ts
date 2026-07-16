import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./contacts.db.ts"; // side effect: ensure the contacts table exists
import { CONTACTS_MODULE, CONTACT_PERMISSIONS } from "./contacts.rules.ts";
import { registerContactRoutes } from "./contacts.routes.ts";

/**
 * The contacts module: manage CRM contacts, each optionally linked to a
 * company. Shared org-wide.
 */
export class ContactsModule extends AppModule {
  readonly name = CONTACTS_MODULE;
  readonly label = "Contactos";
  readonly basePath = "/contacts";

  register(router: Router): void {
    registerPermissions(CONTACTS_MODULE, CONTACT_PERMISSIONS);
    registerContactRoutes(router);
  }
}

export const contactsModule = new ContactsModule();
