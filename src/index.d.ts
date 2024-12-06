declare module "whisper-node" {
    export type IShellOptions = {
        silent: boolean // true: won't print to console
        async: boolean
    }

    export type IOptions = {
        modelName?: string // name of model stored in node_modules/whisper-node/lib/whisper.cpp/models
        modelPath?: string // custom path for model
        whisperOptions?: IFlagTypes
        shellOptions?: IShellOptions
    }

    export type IFlagTypes = {
        gen_file_txt?: boolean
        gen_file_subtitle?: boolean
        gen_file_vtt?: boolean
        timestamp_size?: number
        word_timestamps?: boolean
        language?: string
    }

    export type ITranscriptLine = {
        start: string
        end: string
        speech: string
    }

    export function whisper(filePath: string, options?: IOptions): Promise<ITranscriptLine[]>
}