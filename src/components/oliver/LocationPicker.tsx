// LocationPicker — the header's "which location am I looking at" control for
// OLIVER multi-location businesses. Renders ONLY on an OLIVER surface, and
// only when the business has 2+ active locations (or is on Business, where
// the picker doubles as the discovery point for adding a second one). A
// single-location business on any other tier never sees it.
import { useLocation } from "react-router-dom";
import { MapPin } from "lucide-react";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { ALL_LOCATIONS, isOliverSurface, locationOptionLabel } from "../../lib/oliverLocations";

export function LocationPicker() {
  const { pathname } = useLocation();
  const onOliver = isOliverSurface(pathname);
  const loc = useOliverLocations({ enabled: onOliver });

  if (!onOliver || !loc.ready || loc.activeLocations.length === 0) return null;
  // Positively-resolved Business with one location still gets the picker
  // (it is the feature they bought); an unresolved tier does not — that
  // would change the header for every single-location business while an
  // API is slow.
  if (!loc.multi && !(loc.canAddLocation && loc.tierResolved)) return null;

  return (
    <label
      className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
      title="Location — scopes every OLIVER list and report on this page"
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Location</span>
      <select
        aria-label="Location"
        value={loc.selectedLocationId}
        onChange={(e) => loc.setSelected(e.target.value || ALL_LOCATIONS)}
        className="bg-transparent text-xs text-white outline-none cursor-pointer max-w-[180px]"
        style={{ colorScheme: "dark" }}
      >
        <option value={ALL_LOCATIONS} style={{ color: "#0B1C24" }}>All locations</option>
        {loc.activeLocations.map((l) => (
          <option key={l.location_id} value={l.location_id} style={{ color: "#0B1C24" }}>
            {locationOptionLabel(l)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default LocationPicker;
