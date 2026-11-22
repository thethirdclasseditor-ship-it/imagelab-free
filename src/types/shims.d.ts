declare module 'upng-js' {
  const UPNG: {
    encode: (
      imgs: ArrayBuffer[],
      w: number,
      h: number,
      cnum: number,
      dels?: number[]
    ) => ArrayBuffer;
  };
  export default UPNG;
}

declare module 'heic-to' {
  export interface HeicToOptions {
    blob: Blob;
    type?: 'image/jpeg' | 'image/png';
    quality?: number;
  }
  export function heicTo(options: HeicToOptions): Promise<Blob>;
  export function isHeic(file: File): Promise<boolean>;
}

declare module 'heic-to/csp' {
  export interface HeicToOptions {
    blob: Blob;
    type?: 'image/jpeg' | 'image/png';
    quality?: number;
  }
  export function heicTo(options: HeicToOptions): Promise<Blob>;
  export function isHeic(file: File): Promise<boolean>;
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const workerUrl: string;
  export default workerUrl;
}
