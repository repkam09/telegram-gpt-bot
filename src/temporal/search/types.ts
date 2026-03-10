
export type SearchWorkflowInput = {
    query: string
}

export type SearchWorkflowOutput = {
    results: Array<object>
    summary: string | null
}
