import { studioRequest } from "../studio-request";

export const maxDuration = 90;

export function POST(request: Request) {
  return studioRequest(request, "ai_autofills");
}
