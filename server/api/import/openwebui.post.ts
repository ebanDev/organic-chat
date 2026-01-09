import { nanoid } from 'nanoid'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { run } from '../../database'

interface UploadPart {
  name?: string
  filename?: string
  type?: string
  data?: Buffer
}

interface OpenWebUIItem {
  name?: string
  base_model_id?: string
  params?: {
    system?: string
  }
  meta?: {
    profile_image_url?: string
  }
}

function getExtension(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'image/png':
    default:
      return '.png'
  }
}

async function saveDataUrlImage(dataUrl: string): Promise<string | null> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return null

  const mime = match[1]
  const base64 = match[2]
  if (!mime || !base64) return null
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) return null

  const filename = `${nanoid()}${getExtension(mime)}`
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'agents')
  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), buffer)

  return `/uploads/agents/${filename}`
}

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const file = parts.find(part => (part as UploadPart).filename) as UploadPart | undefined
  if (!file?.data) {
    throw createError({ statusCode: 400, message: 'Invalid file upload' })
  }

  let payload: OpenWebUIItem[]
  try {
    const raw = file.data.toString('utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid JSON')
    }
    payload = parsed
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid JSON file' })
  }

  let created = 0
  let skipped = 0

  for (const item of payload) {
    const name = item?.name?.trim()
    const baseModel = item?.base_model_id?.trim()
    const systemPrompt = item?.params?.system?.trim()

    if (!name || !baseModel || !systemPrompt) {
      skipped += 1
      continue
    }

    let avatarUrl: string | null = null
    const imageUrl = item?.meta?.profile_image_url
    if (imageUrl && imageUrl.startsWith('data:image/')) {
      avatarUrl = await saveDataUrlImage(imageUrl)
    }

    const id = nanoid()
    const now = Date.now()

    await run(
      `INSERT INTO agents (id, name, avatar_url, system_prompt, base_model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, avatarUrl, systemPrompt, baseModel, now, now]
    )
    created += 1
  }

  return { created, skipped }
})
