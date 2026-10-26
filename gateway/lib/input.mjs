import { imageSize } from 'image-size';
import { GatewayError } from './queue.mjs';
const stacks = new Set(['html_tailwind','html_css','react_tailwind','bootstrap','vue_tailwind','ionic_tailwind']);
export function validateInput(raw) {
  if (!raw || typeof raw !== 'object' || !stacks.has(raw.generatedCodeConfig)) throw new GatewayError('invalid_input');
  if (raw.inputMode === 'video' || raw.prompt?.videos?.length) throw new GatewayError('video_unsupported');
  const text = raw.prompt?.fullText || raw.prompt?.text || '';
  const code = raw.fileState?.content || '';
  if (typeof text !== 'string' || text.length > 12000 || typeof code !== 'string' || code.length > 30000) throw new GatewayError('input_too_large', 413);
  const images = raw.prompt?.images || [];
  if (!Array.isArray(images) || images.length > 2) throw new GatewayError('invalid_images');
  for (const image of images) {
    if (typeof image !== 'string' || image.length > 1800000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new GatewayError('invalid_images');
    try {
      const dimensions = imageSize(Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'));
      if (!['png','jpg','webp'].includes(dimensions.type) || dimensions.width * dimensions.height > 16000000 || dimensions.width > 8000 || dimensions.height > 8000) throw Error();
    } catch { throw new GatewayError('invalid_images'); }
  }
  if (!text.trim() && !images.length && !code) throw new GatewayError('invalid_input');
  // Settings, keys, arbitrary URLs, and old image history never enter the queue.
  return { stack: raw.generatedCodeConfig, text, code, images };
}
