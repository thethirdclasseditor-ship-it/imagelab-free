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

declare module 'heic2any' {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
  }
  function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;
  export default heic2any;
}
