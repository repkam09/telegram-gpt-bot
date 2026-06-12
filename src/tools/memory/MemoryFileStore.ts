import { PrismaClient } from "@prisma/client";
import { Database } from "../../database";

export const MEMORY_ROOT = "/memories";

// Memory files re-enter the model context on every read, so keep them small.
export const MAX_FILE_BYTES = 32 * 1024;
export const MAX_FILES_PER_CHAT = 200;
export const MAX_VIEW_CHARS = 16 * 1024;

type MemoryRow = {
    chatId: string;
    path: string;
    content: string;
};

/**
 * Normalizes a model-provided memory path and ensures it cannot reference
 * anything outside the virtual /memories directory. Returns null if the
 * path is invalid or attempts traversal.
 */
export function normalizeMemoryPath(rawPath: unknown): string | null {
    if (typeof rawPath !== "string" || rawPath.length === 0 || rawPath.length > 512) {
        return null;
    }

    let decoded = rawPath;
    if (decoded.includes("%")) {
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            return null;
        }
    }

    if (decoded.includes("\\") || decoded.includes("\0")) {
        return null;
    }

    const stack: string[] = [];
    for (const segment of decoded.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }

        if (segment === ".." || segment.startsWith(".")) {
            return null;
        }

        stack.push(segment);
    }

    const normalized = "/" + stack.join("/");
    if (normalized !== MEMORY_ROOT && !normalized.startsWith(MEMORY_ROOT + "/")) {
        return null;
    }

    return normalized;
}

export function humanReadableSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes}B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)}K`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function formatWithLineNumbers(lines: string[], startLine: number): string {
    return lines.map((line, index) => `${String(startLine + index).padStart(6, " ")}\t${line}`).join("\n");
}

function findOccurrenceLines(content: string, search: string): number[] {
    const lines: number[] = [];
    let index = content.indexOf(search);
    while (index !== -1) {
        lines.push(content.slice(0, index).split("\n").length);
        index = content.indexOf(search, index + 1);
    }

    return lines;
}

const INVALID_PATH = (path: string) => `Error: Invalid path '${path}'. Paths must be absolute paths within the ${MEMORY_ROOT} directory and cannot contain traversal or hidden segments.`;

/**
 * Prisma-backed implementation of the Anthropic memory tool command set.
 * Memory "files" are rows in the MemoryFile table, keyed by (chatId, path),
 * presenting a virtual /memories directory. Return strings deliberately match
 * the memory tool specification so models behave as trained.
 */
export class MemoryFileStore {
    private chatId: string;
    private prisma: PrismaClient;

    constructor(chatId: string, prisma?: PrismaClient) {
        this.chatId = chatId;
        this.prisma = prisma ?? Database.instance();
    }

    public async view(rawPath: unknown, viewRange?: unknown): Promise<string> {
        const path = normalizeMemoryPath(rawPath);
        if (!path) {
            return INVALID_PATH(String(rawPath));
        }

        const file = await this.getFile(path);
        if (file) {
            return this.viewFile(file, viewRange);
        }

        if (path === MEMORY_ROOT || await this.isDirectory(path)) {
            return this.viewDirectory(path);
        }

        return `The path ${path} does not exist. Please provide a valid path.`;
    }

    public async create(rawPath: unknown, fileText: unknown): Promise<string> {
        const path = normalizeMemoryPath(rawPath);
        if (!path) {
            return INVALID_PATH(String(rawPath));
        }

        if (path === MEMORY_ROOT) {
            return `Error: Cannot create a file at the ${MEMORY_ROOT} directory root itself.`;
        }

        if (typeof fileText !== "string") {
            return "Error: Missing required parameter `file_text`.";
        }

        if (Buffer.byteLength(fileText, "utf-8") > MAX_FILE_BYTES) {
            return `Error: File content exceeds the maximum size of ${humanReadableSize(MAX_FILE_BYTES)}. Split the content across multiple smaller files.`;
        }

        if (await this.getFile(path) || await this.isDirectory(path)) {
            return `Error: File ${path} already exists`;
        }

        const ancestorFile = await this.findAncestorFile(path);
        if (ancestorFile) {
            return `Error: Cannot create ${path} because ${ancestorFile} is a file, not a directory.`;
        }

        const count = await this.prisma.memoryFile.count({ where: { chatId: this.chatId } });
        if (count >= MAX_FILES_PER_CHAT) {
            return `Error: Memory limit of ${MAX_FILES_PER_CHAT} files reached. Delete or consolidate existing files before creating new ones.`;
        }

        await this.prisma.memoryFile.create({
            data: { chatId: this.chatId, path, content: fileText }
        });

        return `File created successfully at: ${path}`;
    }

    public async strReplace(rawPath: unknown, oldStr: unknown, newStr: unknown): Promise<string> {
        const path = normalizeMemoryPath(rawPath);
        if (!path) {
            return INVALID_PATH(String(rawPath));
        }

        if (typeof oldStr !== "string" || oldStr.length === 0) {
            return "Error: Missing required parameter `old_str`.";
        }

        const replacement = typeof newStr === "string" ? newStr : "";

        const file = await this.getFile(path);
        if (!file) {
            return `Error: The path ${path} does not exist. Please provide a valid path.`;
        }

        const occurrences = findOccurrenceLines(file.content, oldStr);
        if (occurrences.length === 0) {
            return `No replacement was performed, old_str \`${oldStr}\` did not appear verbatim in ${path}.`;
        }

        if (occurrences.length > 1) {
            return `No replacement was performed. Multiple occurrences of old_str \`${oldStr}\` in lines: ${occurrences.join(", ")}. Please ensure it is unique`;
        }

        const updated = file.content.replace(oldStr, replacement);
        if (Buffer.byteLength(updated, "utf-8") > MAX_FILE_BYTES) {
            return `Error: The edit would grow the file beyond the maximum size of ${humanReadableSize(MAX_FILE_BYTES)}. Split the content across multiple smaller files.`;
        }

        await this.prisma.memoryFile.update({
            where: { chatId_path: { chatId: this.chatId, path } },
            data: { content: updated }
        });

        const snippetLine = occurrences[0];
        const lines = updated.split("\n");
        const start = Math.max(1, snippetLine - 4);
        const end = Math.min(lines.length, snippetLine + 4);
        const snippet = formatWithLineNumbers(lines.slice(start - 1, end), start);

        return `The memory file has been edited.\n${snippet}`;
    }

    public async insert(rawPath: unknown, insertLine: unknown, insertText: unknown): Promise<string> {
        const path = normalizeMemoryPath(rawPath);
        if (!path) {
            return INVALID_PATH(String(rawPath));
        }

        if (typeof insertText !== "string") {
            return "Error: Missing required parameter `insert_text`.";
        }

        const file = await this.getFile(path);
        if (!file) {
            return `Error: The path ${path} does not exist`;
        }

        const lines = file.content.split("\n");
        const line = typeof insertLine === "number" ? insertLine : Number(insertLine);
        if (!Number.isInteger(line) || line < 0 || line > lines.length) {
            return `Error: Invalid \`insert_line\` parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${lines.length}]`;
        }

        const inserted = insertText.endsWith("\n") ? insertText.slice(0, -1) : insertText;
        lines.splice(line, 0, ...inserted.split("\n"));
        const updated = lines.join("\n");

        if (Buffer.byteLength(updated, "utf-8") > MAX_FILE_BYTES) {
            return `Error: The edit would grow the file beyond the maximum size of ${humanReadableSize(MAX_FILE_BYTES)}. Split the content across multiple smaller files.`;
        }

        await this.prisma.memoryFile.update({
            where: { chatId_path: { chatId: this.chatId, path } },
            data: { content: updated }
        });

        return `The file ${path} has been edited.`;
    }

    public async delete(rawPath: unknown): Promise<string> {
        const path = normalizeMemoryPath(rawPath);
        if (!path) {
            return INVALID_PATH(String(rawPath));
        }

        if (path === MEMORY_ROOT) {
            return `Error: Cannot delete the ${MEMORY_ROOT} directory itself.`;
        }

        const file = await this.getFile(path);
        if (file) {
            await this.prisma.memoryFile.delete({
                where: { chatId_path: { chatId: this.chatId, path } }
            });
            return `Successfully deleted ${path}`;
        }

        if (await this.isDirectory(path)) {
            await this.prisma.memoryFile.deleteMany({
                where: { chatId: this.chatId, path: { startsWith: path + "/" } }
            });
            return `Successfully deleted ${path}`;
        }

        return `Error: The path ${path} does not exist`;
    }

    public async rename(rawOldPath: unknown, rawNewPath: unknown): Promise<string> {
        const oldPath = normalizeMemoryPath(rawOldPath);
        if (!oldPath) {
            return INVALID_PATH(String(rawOldPath));
        }

        const newPath = normalizeMemoryPath(rawNewPath);
        if (!newPath) {
            return INVALID_PATH(String(rawNewPath));
        }

        if (oldPath === MEMORY_ROOT || newPath === MEMORY_ROOT) {
            return `Error: Cannot rename the ${MEMORY_ROOT} directory itself.`;
        }

        if (await this.getFile(newPath) || await this.isDirectory(newPath)) {
            return `Error: The destination ${newPath} already exists`;
        }

        const file = await this.getFile(oldPath);
        if (file) {
            await this.prisma.memoryFile.update({
                where: { chatId_path: { chatId: this.chatId, path: oldPath } },
                data: { path: newPath }
            });
            return `Successfully renamed ${oldPath} to ${newPath}`;
        }

        if (await this.isDirectory(oldPath)) {
            const children = await this.prisma.memoryFile.findMany({
                where: { chatId: this.chatId, path: { startsWith: oldPath + "/" } },
                select: { path: true }
            });

            await this.prisma.$transaction(children.map((child) => this.prisma.memoryFile.update({
                where: { chatId_path: { chatId: this.chatId, path: child.path } },
                data: { path: newPath + child.path.slice(oldPath.length) }
            })));

            return `Successfully renamed ${oldPath} to ${newPath}`;
        }

        return `Error: The path ${oldPath} does not exist`;
    }

    /**
     * Directory listing of the memory root, used both by the `view` command and
     * for system prompt injection so models see their memory without a tool call.
     */
    public async directoryListing(): Promise<string> {
        return this.viewDirectory(MEMORY_ROOT);
    }

    private async getFile(path: string): Promise<MemoryRow | null> {
        return this.prisma.memoryFile.findUnique({
            where: { chatId_path: { chatId: this.chatId, path } }
        });
    }

    private async isDirectory(path: string): Promise<boolean> {
        const child = await this.prisma.memoryFile.findFirst({
            where: { chatId: this.chatId, path: { startsWith: path + "/" } },
            select: { path: true }
        });

        return child !== null;
    }

    private async findAncestorFile(path: string): Promise<string | null> {
        const segments = path.split("/").filter((segment) => segment !== "");
        // Walk ancestors below the root: /memories/a/b.txt checks /memories/a
        for (let i = 2; i < segments.length; i++) {
            const ancestor = "/" + segments.slice(0, i).join("/");
            if (await this.getFile(ancestor)) {
                return ancestor;
            }
        }

        return null;
    }

    private viewFile(file: MemoryRow, viewRange?: unknown): string {
        const lines = file.content.split("\n");
        if (lines.length > 999999) {
            return `File ${file.path} exceeds maximum line limit of 999,999 lines.`;
        }

        let start = 1;
        let end = lines.length;

        if (Array.isArray(viewRange) && viewRange.length === 2) {
            const rangeStart = Number(viewRange[0]);
            const rangeEnd = Number(viewRange[1]);
            if (Number.isInteger(rangeStart) && rangeStart >= 1) {
                start = Math.min(rangeStart, lines.length);
            }
            if (Number.isInteger(rangeEnd)) {
                end = rangeEnd === -1 ? lines.length : Math.min(Math.max(rangeEnd, start), lines.length);
            }
        }

        let body = formatWithLineNumbers(lines.slice(start - 1, end), start);
        if (body.length > MAX_VIEW_CHARS) {
            body = body.slice(0, MAX_VIEW_CHARS);
            const lastNewline = body.lastIndexOf("\n");
            if (lastNewline > 0) {
                body = body.slice(0, lastNewline);
            }
            body += `\n... (output truncated at ${humanReadableSize(MAX_VIEW_CHARS)}, use the view_range parameter to read specific sections)`;
        }

        return `Here's the content of ${file.path} with line numbers:\n${body}`;
    }

    private async viewDirectory(path: string): Promise<string> {
        const files = await this.prisma.memoryFile.findMany({
            where: { chatId: this.chatId, path: { startsWith: path + "/" } },
            select: { path: true, content: true },
            orderBy: { path: "asc" }
        });

        const entries = new Map<string, number>();
        let totalBytes = 0;

        for (const file of files) {
            const bytes = Buffer.byteLength(file.content, "utf-8");
            totalBytes += bytes;

            const relative = file.path.slice(path.length + 1);
            const segments = relative.split("/");

            // List entries up to 2 levels deep; deeper files roll up into their level-2 directory
            for (let depth = 1; depth <= Math.min(segments.length, 2); depth++) {
                const entryPath = `${path}/${segments.slice(0, depth).join("/")}`;
                entries.set(entryPath, (entries.get(entryPath) ?? 0) + bytes);
            }
        }

        const header = `Here're the files and directories up to 2 levels deep in ${path}, excluding hidden items and node_modules:`;
        const rootLine = `${humanReadableSize(totalBytes)}\t${path}`;
        const entryLines = [...entries.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([entryPath, bytes]) => `${humanReadableSize(bytes)}\t${entryPath}`);

        return [header, rootLine, ...entryLines].join("\n");
    }
}
