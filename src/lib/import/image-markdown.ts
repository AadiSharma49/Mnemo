/**
 * Saved chat images are referenced inside transcripts as `![image](/api/images/<id>)`.
 * Only that exact shape is ever rendered as an <img>, so a transcript can never
 * make the app load an arbitrary remote image.
 */

const IMAGE_LINK = /!\[[^\]]*\]\(\/api\/images\/([\w-]+)\)/g
const IMAGE_LINE = /^!\[[^\]]*\]\(\/api\/images\/([\w-]+)\)$/

/** Returns the image id if the whole line is a saved-image reference. */
export function parseImageLine(line: string): string | null {
  return IMAGE_LINE.exec(line.trim())?.[1] ?? null
}

/** Replaces saved-image links with a plain marker, for text sent to an AI model. */
export function stripImageLinks(text: string): string {
  return text.replace(IMAGE_LINK, "[image]")
}
