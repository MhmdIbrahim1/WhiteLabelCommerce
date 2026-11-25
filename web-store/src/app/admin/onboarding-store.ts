"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

export type StoreOnboardingState = {
  checklistDismissed: boolean;
  checklistCollapsed: boolean;
  tourSeen: boolean;
  customizerDone: boolean;
  settingsDone: boolean;
  sharedDone: boolean;
};

const DEFAULT_STATE: StoreOnboardingState = {
  checklistDismissed: false,
  checklistCollapsed: false,
  tourSeen: false,
  customizerDone: false,
  settingsDone: false,
  sharedDone: false,
};

const DEFAULT_SERIALIZED = JSON.stringify(DEFAULT_STATE);
const CHANGE_EVENT = "nova-admin-onboarding-change";
export const START_TOUR_EVENT = "nova-admin-start-tour";

function storageKey(storeId: string): string {
  return `nova.admin.onboarding.v1:${storeId}`;
}

function readRaw(storeId: string): string {
  if (typeof window === "undefined") return DEFAULT_SERIALIZED;
  try {
    return window.localStorage.getItem(storageKey(storeId)) || DEFAULT_SERIALIZED;
  } catch {
    return DEFAULT_SERIALIZED;
  }
}

function parseState(raw: string): StoreOnboardingState {
  try {
    const parsed = JSON.parse(raw) as Partial<StoreOnboardingState>;
    return {
      checklistDismissed: Boolean(parsed.checklistDismissed),
      checklistCollapsed: Boolean(parsed.checklistCollapsed),
      tourSeen: Boolean(parsed.tourSeen),
      customizerDone: Boolean(parsed.customizerDone),
      settingsDone: Boolean(parsed.settingsDone),
      sharedDone: Boolean(parsed.sharedDone),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function getStoreOnboardingState(storeId: string): StoreOnboardingState {
  return parseState(readRaw(storeId));
}

export function updateStoreOnboarding(
  storeId: string,
  patch: Partial<StoreOnboardingState>,
): StoreOnboardingState {
  const next: StoreOnboardingState = {
    ...getStoreOnboardingState(storeId),
    ...patch,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey(storeId), JSON.stringify(next));
    } catch {
      /* ignore storage quota errors */
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { storeId } }));
  }
  return next;
}

export function markOnboardingStepDone(
  storeId: string,
  step: "customizerDone" | "settingsDone" | "sharedDone",
  value = true,
): void {
  updateStoreOnboarding(storeId, { [step]: value });
}

export function triggerAdminGuidedTour(storeId: string): void {
  updateStoreOnboarding(storeId, {
    checklistDismissed: false,
    checklistCollapsed: false,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(START_TOUR_EVENT, { detail: { storeId } }),
    );
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useStoreOnboarding(storeId: string): StoreOnboardingState {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(storeId),
    () => DEFAULT_SERIALIZED,
  );
  return useMemo(() => parseState(raw), [raw]);
}

/**
 * Lightweight invisible client hook component that marks a checklist step
 * complete when a Server Component page lands on `?result=ok` (e.g. /admin/settings).
 */
export function OnboardingStepMarker({
  storeId,
  step,
  active,
}: {
  storeId: string;
  step: "customizerDone" | "settingsDone" | "sharedDone";
  active: boolean;
}) {
  useEffect(() => {
    if (!active || !storeId) return;
    markOnboardingStepDone(storeId, step, true);
  }, [active, storeId, step]);
  return null;
}
