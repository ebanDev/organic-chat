declare module '*.md?raw' {
  const content: string
  export default content
}

declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
  }
  export default mammoth
}
