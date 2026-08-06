import axios from "axios";
import { config } from "dotenv";
config()

const response = await axios.post(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
        includedTypes: [
            "restaurant"
        ],

        maxResultCount: 10,

        locationRestriction: {
            circle: {
                center: {
                    latitude: 29.448111,
                    longitude: 77.297306
                },

                radius: 2000
            }
        }
    },
    {
        headers: {
            "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,

            // "X-Goog-FieldMask":
            //     "places.displayName,places.location,places.rating"
        }
    }
);

console.dir(response.data, { depth: null })