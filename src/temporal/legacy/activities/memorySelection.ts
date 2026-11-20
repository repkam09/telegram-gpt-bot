import { MemoryFileStore } from "../../../tools/memory/MemoryFileStore";
import { CORE_MEMORY_FILES } from "../../../tools/memory/memoryContext";
import type { DecisionPredicate } from "./decision";

/** Per-turn memory file selection (plan 4.7): one yes/no predicate per candidate file, in the classifier's decision call. */

export const MEMORY_CANDIDATE_LIMIT = 30;
export const MEMORY_SELECT_THRESHOLD = 0.5;
export const MEMORY_SELECT_MAX_FILES = 3;
const DESCRIPTION_MAX_CHARS = 200;

export type MemoryCandidate = { path: string; description: string };

/**
 * Candidate files for selection: the most recently updated files that have a description, excluding the
 * core files (profile and preferences are always injected).
 */
export async function memoryCandidates(chatId: string): Promise<MemoryCandidate[]> {
    const files = await new MemoryFileStore(chatId).listFiles(); // newest first
    return files
        .filter((file) => file.description !== null && !CORE_MEMORY_FILES.includes(file.path))
        .slice(0, MEMORY_CANDIDATE_LIMIT)
        .map((file) => ({ path: file.path, description: file.description!.slice(0, DESCRIPTION_MAX_CHARS) }));
}

export function memoryQuestionName(index: number): string {
    return `memory_file_${index}`;
}

export function memoryQuestions(candidates: MemoryCandidate[]): DecisionPredicate[] {
    return candidates.map((candidate, index) => ({
        name: memoryQuestionName(index),
        instructions: `Is the latest user message about, or would answering it well benefit from knowing, these notes about the user: ${candidate.description}?`,
    }));
}

/** The paths of the (at most a few) candidates the decision model is confident about, most confident first. */
export function selectMemoryFiles(candidates: MemoryCandidate[], probabilities: Record<string, number>): string[] {
    return candidates
        .map((candidate, index) => ({ path: candidate.path, probability: probabilities[memoryQuestionName(index)] ?? 0 }))
        .filter((entry) => entry.probability >= MEMORY_SELECT_THRESHOLD)
        .sort((a, b) => b.probability - a.probability)
        .slice(0, MEMORY_SELECT_MAX_FILES)
        .map((entry) => entry.path);
}
