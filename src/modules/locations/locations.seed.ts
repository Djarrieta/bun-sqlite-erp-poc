import { LocationRepository, type LocationInput } from "./locations.db.ts";

/**
 * Development seed for the locations module. Creates a small directory of
 * warehouses, stores and a transit location. The directory is shared org-wide,
 * so no owner is needed. Idempotent: skips when any locations already exist.
 */
const SEED_LOCATIONS: LocationInput[] = [
  { code: "BOD-01", name: "Bodega Central", kind: "warehouse", isActive: true },
  { code: "BOD-02", name: "Bodega Norte", kind: "warehouse", isActive: true },
  { code: "TIE-01", name: "Tienda Centro", kind: "store", isActive: true },
  { code: "TIE-02", name: "Tienda Sur", kind: "store", isActive: true },
  { code: "TRA-01", name: "Tránsito", kind: "transit", isActive: true },
];

export function seedLocations(): void {
  const locations = new LocationRepository();
  if (locations.list().total > 0) {
    console.log("   locations: already seeded, skipping");
    return;
  }
  for (const input of SEED_LOCATIONS) locations.create(input);
  console.log(`   locations: created ${SEED_LOCATIONS.length} locations`);
}
