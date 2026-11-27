import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import { extname } from 'path';

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ALLOWED_DOC_EXTS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx']);
const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function imageFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext) || !ALLOWED_IMAGE_MIMES.has(mime)) {
    return cb(
      new BadRequestException(
        'Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, JPEG, PNG hoặc WEBP.',
      ),
      false,
    );
  }
  cb(null, true);
}

export function documentFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_DOC_EXTS.has(ext) || !ALLOWED_DOC_MIMES.has(mime)) {
    return cb(
      new BadRequestException(
        'Định dạng tài liệu không hợp lệ. Chỉ chấp nhận PDF, JPG, PNG, WEBP, DOC hoặc DOCX.',
      ),
      false,
    );
  }
  cb(null, true);
}

export function verifyUploadedFileMagicBytes(
  file: Express.Multer.File | undefined,
  kind: 'image' | 'document',
): void {
  if (!file || !file.path) return;

  try {
    const fd = fs.openSync(file.path, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) {
      throw new BadRequestException('Tệp tải lên bị rỗng hoặc không hợp lệ.');
    }

    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng =
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isWebp =
      bytesRead >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP';
    const isPdf = buf.toString('ascii', 0, 4) === '%PDF';
    const isZipDocx = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    const isOleDoc =
      buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;

    const valid =
      kind === 'image'
        ? isJpeg || isPng || isWebp
        : isPdf || isJpeg || isPng || isWebp || isZipDocx || isOleDoc;

    if (!valid) {
      try {
        fs.unlinkSync(file.path);
      } catch {}
      throw new BadRequestException(
        'Nội dung tệp tải lên không khớp với định dạng cho phép hoặc có dấu hiệu giả mạo phần mở rộng.',
      );
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    try {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {}
    throw new BadRequestException('Không thể xác thực tệp tải lên.');
  }
}

export function assertSafeExternalOrUploadUrl(url?: string | null): void {
  if (!url || !url.trim()) return;
  const trimmed = url.trim();
  if (trimmed.includes('..')) {
    throw new BadRequestException('Đường dẫn tệp (fileUrl) không hợp lệ.');
  }
  if (trimmed.startsWith('/uploads/')) return;
  if (trimmed.startsWith('/api/tracking/evidence/attachments/')) return;
  if (/^https?:\/\//i.test(trimmed)) return;
  throw new BadRequestException(
    'Đường dẫn tệp (fileUrl) không hợp lệ. Chỉ chấp nhận URL http(s):// hoặc đường dẫn ảnh tải lên hợp lệ.',
  );
}
