import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonRow } from "@/types/database";

type Address = Pick<
  PersonRow,
  "address_line" | "address_line2" | "city" | "postal_code" | "country"
>;

/** Dirección completa (0051): dos líneas, ciudad, código postal y país. */
export function AddressFields({ person }: { person?: Address | null }) {
  return (
    <fieldset className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-6">
      <legend className="mb-2 text-sm font-medium">Dirección</legend>
      <div className="space-y-2 sm:col-span-6">
        <Label htmlFor="addressLine">Línea 1</Label>
        <Input
          id="addressLine"
          name="addressLine"
          autoComplete="address-line1"
          maxLength={200}
          placeholder="Calle y número"
          defaultValue={person?.address_line ?? ""}
        />
      </div>
      <div className="space-y-2 sm:col-span-6">
        <Label htmlFor="addressLine2">Línea 2 (opcional)</Label>
        <Input
          id="addressLine2"
          name="addressLine2"
          autoComplete="address-line2"
          maxLength={200}
          placeholder="Urbanización, apartamento, barrio"
          defaultValue={person?.address_line2 ?? ""}
        />
      </div>
      <div className="space-y-2 sm:col-span-3">
        <Label htmlFor="city">Ciudad</Label>
        <Input
          id="city"
          name="city"
          autoComplete="address-level2"
          maxLength={100}
          defaultValue={person?.city ?? ""}
        />
      </div>
      <div className="space-y-2 sm:col-span-3">
        <Label htmlFor="postalCode">Código postal</Label>
        <Input
          id="postalCode"
          name="postalCode"
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={20}
          defaultValue={person?.postal_code ?? ""}
        />
      </div>
      <div className="space-y-2 sm:col-span-6">
        <Label htmlFor="country">País</Label>
        <Input
          id="country"
          name="country"
          autoComplete="country-name"
          maxLength={100}
          placeholder="Puerto Rico"
          defaultValue={person?.country ?? ""}
        />
      </div>
    </fieldset>
  );
}
