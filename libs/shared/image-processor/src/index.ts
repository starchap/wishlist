import sharp from 'sharp';
import { Result, ValueObject } from '@wishlist/shared-kernel';

export interface ProcessedAvifImageProps {
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/avif';
  [key: string]: unknown;
}

/**
 * Value Object representing a verified, metadata-stripped, <=512x512px AVIF image.
 */
export class ProcessedAvifImage extends ValueObject<ProcessedAvifImageProps> {
  public static readonly MAX_DIMENSION = 512;

  private constructor(props: ProcessedAvifImageProps) {
    super(props);
  }

  public get buffer(): Buffer {
    return this.props.buffer;
  }

  public get width(): number {
    return this.props.width;
  }

  public get height(): number {
    return this.props.height;
  }

  public get sizeBytes(): number {
    return this.props.sizeBytes;
  }

  public get mimeType(): 'image/avif' {
    return this.props.mimeType;
  }

  public static create(props: ProcessedAvifImageProps): Result<ProcessedAvifImage> {
    if (props.width > ProcessedAvifImage.MAX_DIMENSION || props.height > ProcessedAvifImage.MAX_DIMENSION) {
      return Result.fail(`Image dimensions (${props.width}x${props.height}) exceed max 512x512px`);
    }
    if (props.mimeType !== 'image/avif') {
      return Result.fail('Image must be in AVIF format');
    }
    return Result.ok(new ProcessedAvifImage(props));
  }
}

export class AvifImageProcessor {
  /**
   * Converts any input image buffer to an ultra-compact AVIF image:
   * - Max 512x512px (preserving aspect ratio, never enlarging)
   * - Strips ALL EXIF, XMP, IPTC, ICC profiles and extra metadata
   */
  public static async processBuffer(inputBuffer: Buffer): Promise<Result<ProcessedAvifImage>> {
    try {
      const pipeline = sharp(inputBuffer, { failOn: 'none' })
        .rotate() // Apply orientation before stripping EXIF
        .resize(ProcessedAvifImage.MAX_DIMENSION, ProcessedAvifImage.MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .avif({
          quality: 58,
          effort: 4,
          chromaSubsampling: '4:2:0'
        });

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return ProcessedAvifImage.create({
        buffer: data,
        width: info.width,
        height: info.height,
        sizeBytes: info.size,
        mimeType: 'image/avif'
      });
    } catch (err) {
      return Result.fail(
        `Failed to process image into 512x512 AVIF: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Downloads an image from an HTTP(S) URL or data URI and compresses it into a 512x512 metadata-free AVIF.
   */
  public static async processFromUrl(
    imageUrl: string,
    refererUrl?: string
  ): Promise<Result<ProcessedAvifImage>> {
    try {
      if (imageUrl.startsWith('data:image/')) {
        const base64Part = imageUrl.split(',')[1];
        if (!base64Part) {
          return Result.fail('Invalid data URI');
        }
        return AvifImageProcessor.processBuffer(Buffer.from(base64Part, 'base64'));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const parsedImgUrl = new URL(imageUrl);
        const headers: Record<string, string> = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7',
          Referer: refererUrl || `${parsedImgUrl.origin}/`
        };

        const res = await fetch(parsedImgUrl.toString(), {
          signal: controller.signal,
          headers,
          redirect: 'follow'
        });
        if (!res.ok) {
          return Result.fail(`Image HTTP fetch failed with status ${res.status}`);
        }
        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength > 12 * 1024 * 1024) {
          return Result.fail('Source image exceeds 12MB download cap');
        }
        return AvifImageProcessor.processBuffer(Buffer.from(arrayBuf));
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      return Result.fail(
        `Failed to download image from URL: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
