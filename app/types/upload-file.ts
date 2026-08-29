export interface UploadFileResult {
  slug: string
  url: string
  type: 'file' | 'video'
  contentType: string
  size: number
  fileName?: string
  expiration: number | null
  passwordProtected: boolean
}
