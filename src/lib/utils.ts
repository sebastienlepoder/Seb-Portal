import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function priorityColor(priority: string): string {
  switch (priority) {
    case 'critical':
      return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'high':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    case 'normal':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    case 'low':
      return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    default:
      return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
  }
}

export const ALLOWED_PASTED_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];
export const MAX_PASTED_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PASTED_IMAGES = 8;

export interface PastedImage {
  dataUri: string;
  filename?: string;
}

/** Pull image files out of a clipboard paste, validate them, and decode to
 *  data URIs. Returns the items that should be appended to existing state,
 *  the most recent rejection reason (or null), and whether the paste
 *  contained any image at all (so callers can decide whether to
 *  `e.preventDefault()`). */
export async function extractPastedImages(
  clipboardData: DataTransfer,
  existingCount: number,
): Promise<{ items: PastedImage[]; error: string | null; hadImage: boolean }> {
  const items: PastedImage[] = [];
  let error: string | null = null;
  let hadImage = false;

  for (let i = 0; i < clipboardData.items.length; i++) {
    const it = clipboardData.items[i];
    if (it.kind !== 'file' || !it.type.startsWith('image/')) continue;
    hadImage = true;
    const file = it.getAsFile();
    if (!file) continue;
    if (!ALLOWED_PASTED_IMAGE_MIME.includes(file.type)) {
      error = `Unsupported image type "${file.type}". Use PNG, JPEG, GIF, or WebP.`;
      continue;
    }
    if (file.size > MAX_PASTED_IMAGE_BYTES) {
      error = 'Image is larger than 5 MB.';
      continue;
    }
    if (existingCount + items.length >= MAX_PASTED_IMAGES) {
      error = `You can attach at most ${MAX_PASTED_IMAGES} images.`;
      continue;
    }
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read image.'));
        reader.readAsDataURL(file);
      });
      items.push({ dataUri, filename: file.name || undefined });
    } catch {
      error = 'Could not read pasted image.';
    }
  }
  return { items, error, hadImage };
}
