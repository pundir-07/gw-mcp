import { Client } from "@googlemaps/google-maps-services-js";
import { config } from "dotenv";
import axios from "axios";
import { generateGoogleMapsNavigationUrl } from "./navigate.ts";
config()
export const mapsClient = new Client({});
try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY!;
    const shamli = (await mapsClient.geocode({
        params: {
            address: "Shamli",
            key: apiKey,
        },
    })).data.results[0]
    const meerut = (await mapsClient.geocode({
        params: {
            address: "Meerut",
            key: apiKey,
        },
    })).data.results[0]
    const noida = (await mapsClient.geocode({
        params: {
            address: "Noida",
            key: apiKey,
        },
    })).data.results[0]
    const panipat = (await mapsClient.geocode({
        params: {
            address: "Panipat",
            key: apiKey,
        },
    })).data.results[0]


    const routes = await axios.post(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
            origin: {
                location: {
                    latLng: {
                        latitude: shamli?.geometry.location.lat,
                        longitude: shamli?.geometry.location.lng,
                    },
                },
            },

            destination: {
                location: {
                    latLng: {
                        latitude: meerut?.geometry.location.lat,
                        longitude: meerut?.geometry.location.lng,
                    },
                },
            },
            intermediates: [
                {
                    location: {
                        latLng: {
                            latitude: noida?.geometry.location.lat,
                            longitude: noida?.geometry.location.lng,
                        },
                    },
                },

                {
                    location: {
                        latLng: {
                            latitude: panipat?.geometry.location.lat,
                            longitude: panipat?.geometry.location.lng,
                        },
                    },
                },
            ],

            travelMode: "DRIVE",
        },
        {
            headers: {
                "X-Goog-Api-Key": apiKey,

                // VERY IMPORTANT
                "X-Goog-FieldMask":
                    "routes.distanceMeters,routes.duration,routes.legs,routes.polyline",
            },
        }
    );

    // console.dir(routes.data, { depth: null });
    const url = generateGoogleMapsNavigationUrl({ origin: shamli!, destination: panipat!, waypoints: [meerut!, noida!] })
    console.log(url)
} catch (error) {
    console.log(error)
}
