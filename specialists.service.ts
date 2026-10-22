import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OverpassService } from './overpass.service';
import { NearbyHospitalsDto } from './dto/nearby-hospitals.dto';

const EARTH_RADIUS_M = 6371000;

// Cervical-cancer relevant keywords boost confidence when found in OSM tags — since
// Overpass has no reliable "specialty" field, this is a best-effort text-match signal
// rather than a verified credential, and is presented to the user as such.
const RELEVANT_KEYWORDS = ['gynaecolog', 'gynecolog', 'obstetric', 'women', 'maternity', 'cancer', 'oncolog'];

@Injectable()
export class SpecialistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overpass: OverpassService,
  ) {}

  async findNearby(dto: NearbyHospitalsDto) {
    const radius = dto.radius ?? 20000;
    const places = await this.overpass.findNearby(dto.latitude, dto.longitude, radius);

    await Promise.all(
      places.map((p) =>
        this.prisma.specialistCache.upsert({
          where: { osmId: p.osmId },
          create: {
            osmId: p.osmId,
            name: p.name,
            latitude: p.latitude,
            longitude: p.longitude,
            address: p.address,
            phone: p.phone,
            amenityType: p.amenityType,
            raw: p.tags,
          },
          update: {
            name: p.name,
            latitude: p.latitude,
            longitude: p.longitude,
            address: p.address,
            phone: p.phone,
            amenityType: p.amenityType,
            raw: p.tags,
            fetchedAt: new Date(),
          },
        }),
      ),
    );

    const hospitals = places
      .map((p) => {
        const distanceMeters = this.haversine(dto.latitude, dto.longitude, p.latitude, p.longitude);
        const tagText = Object.values(p.tags).join(' ').toLowerCase();
        const keywordMatch = RELEVANT_KEYWORDS.some((kw) => tagText.includes(kw));

        return {
          id: p.osmId,
          name: p.name,
          specialty: keywordMatch ? 'Gynaecology / Women\'s Health' : 'General / Hospital',
          latitude: p.latitude,
          longitude: p.longitude,
          rating: null,
          review_count: 0,
          address: p.address ?? 'Address not available',
          phone: p.phone ?? 'Not available',
          hours: p.tags['opening_hours'] ?? 'Not available',
          services: [p.amenityType ?? 'healthcare'].filter(Boolean),
          types: p.amenityType ? [p.amenityType] : [],
          confidence: this.confidence(distanceMeters, radius, keywordMatch),
          distance_meters: Math.round(distanceMeters),
        };
      })
      .sort((a, b) => b.confidence - a.confidence || a.distance_meters - b.distance_meters)
      .slice(0, 20);

    return { hospitals };
  }

  private confidence(distanceMeters: number, radius: number, keywordMatch: boolean): number {
    const proximityScore = Math.max(0, 1 - distanceMeters / radius);
    const base = 0.4 + proximityScore * 0.4;
    return Math.round((keywordMatch ? Math.min(base + 0.2, 1) : base) * 100) / 100;
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
