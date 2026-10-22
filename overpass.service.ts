import { Injectable, Logger } from '@nestjs/common';

export interface OverpassPlace {
  osmId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  phone: string | null;
  amenityType: string | null;
  tags: Record<string, string>;
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Queries OpenStreetMap's Overpass API for nearby hospitals/clinics/doctors — free and
 * keyless, chosen over the Google Places API so the backend has no per-request cost and
 * no API key to provision. The tradeoff (documented in README) is data completeness and
 * freshness: OSM coverage of amenity tags (phone, opening_hours, healthcare:speciality)
 * is community-maintained and inconsistent, especially outside major cities, so some
 * fields returned here will legitimately be null.
 */
@Injectable()
export class OverpassService {
  private readonly logger = new Logger(OverpassService.name);

  async findNearby(lat: number, lng: number, radiusMeters: number): Promise<OverpassPlace[]> {
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"^(hospital|clinic|doctors)$"](around:${radiusMeters},${lat},${lng});
        way["amenity"~"^(hospital|clinic|doctors)$"](around:${radiusMeters},${lat},${lng});
      );
      out center tags;
    `;

    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
      });
      if (!res.ok) {
        this.logger.warn(`Overpass API returned ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { elements: any[] };
      return data.elements
        .map((el) => this.toPlace(el))
        .filter((p): p is OverpassPlace => p !== null);
    } catch (err) {
      this.logger.error(`Overpass API request failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  private toPlace(el: any): OverpassPlace | null {
    const tags = el.tags ?? {};
    const name = tags.name ?? tags['name:en'];
    if (!name) return null;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return null;

    const addressParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean);

    return {
      osmId: `${el.type}/${el.id}`,
      name,
      latitude: lat,
      longitude: lon,
      address: addressParts.length ? addressParts.join(' ') : (tags['addr:full'] ?? null),
      phone: tags.phone ?? tags['contact:phone'] ?? null,
      amenityType: tags.amenity ?? null,
      tags,
    };
  }
}
