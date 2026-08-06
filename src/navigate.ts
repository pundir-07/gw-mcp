type GeocodeResult = {
    geometry: {
        location: {
            lat: number;
            lng: number;
        };
    };
};

interface NavigationUrlOptions {
    origin: GeocodeResult;
    destination: GeocodeResult;
    waypoints?: GeocodeResult[];
    travelMode?: "driving" | "walking" | "bicycling" | "transit";
}

export function generateGoogleMapsNavigationUrl({
    origin,
    destination,
    waypoints = [],
    travelMode = "driving",
}: NavigationUrlOptions): string {
    const baseUrl = "https://www.google.com/maps/dir/?api=1";

    const originParam =
        `${origin.geometry.location.lat},${origin.geometry.location.lng}`;

    const destinationParam =
        `${destination.geometry.location.lat},${destination.geometry.location.lng}`;

    const params = new URLSearchParams({
        origin: originParam,
        destination: destinationParam,
        travelmode: travelMode,
    });

    if (waypoints.length > 0) {
        const waypointString = waypoints
            .map(
                ({ geometry }) =>
                    `${geometry.location.lat},${geometry.location.lng}`
            )
            .join("|");

        params.set("waypoints", waypointString);
    }

    return `${baseUrl}&${params.toString()}`;
}