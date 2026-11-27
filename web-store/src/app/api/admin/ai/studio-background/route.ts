import { studioRequest } from "../studio-request";

export const maxDuration = 120;

export function POST(request: Request) {
  return studioRequest(request, "ai_studio_images");
}
