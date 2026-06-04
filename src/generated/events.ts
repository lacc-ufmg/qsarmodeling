/**
 * Auto-generated TypeScript bindings for Tauri events.
 *
 * This project exposes typed GA progress events to the frontend.
 */

export const GA_PROGRESS_EVENT = "ga:progress" as const;

export type GAProgressPhase = "start" | "generation" | "best" | "finish";

export interface GAProgressEvent {
	phase: GAProgressPhase;
	currentGeneration: number;
	maxGenerations: number;
	staleGenerations: number;
	bestGeneration: number | null;
	progress: number;
}


