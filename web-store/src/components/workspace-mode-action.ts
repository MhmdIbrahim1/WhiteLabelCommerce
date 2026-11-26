"use server";

import { cookies } from "next/headers";
import { workspacePreferenceCookie, type WorkspaceMode } from "@/lib/workspace-theme";

export async function setWorkspaceMode(mode: WorkspaceMode) {
  (await cookies()).set(workspacePreferenceCookie(mode, process.env.NODE_ENV === "production"));
}
