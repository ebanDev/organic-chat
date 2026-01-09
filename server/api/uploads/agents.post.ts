import { nanoid } from 'nanoid'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

interface UploadPart {
  name?: string
  filename?: string
  type?: string
  data?: Buffer
}

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const file = parts.find(part => (part as UploadPart).filename) as UploadPart | undefined
  if (!file?.data || !file.filename) {
    throw createError({ statusCode: 400, message: 'Invalid file upload' })
  }

  if (!file.type?.startsWith('image/')) {
    throw createError({ statusCode: 415, message: 'Only image uploads are supported' })
  }

  const extension = extname(file.filename) || '.png'
  const filename = `${nanoid()}${extension}`
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'agents')

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), file.data)

  return { url: `/uploads/agents/${filename}` }
})
