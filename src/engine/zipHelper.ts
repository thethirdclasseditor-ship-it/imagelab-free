import type { ProcessedImageResult } from './imageEngine';

export function downloadSingleImage(item: ProcessedImageResult): void {
  const a = document.createElement('a');
  a.href = item.url;
  a.download = item.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadBatchAsZip(
  items: ProcessedImageResult[],
  zipName = 'imagelab-files.zip'
): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  items.forEach((item, index) => {
    const uniqueName = items.length > 1 ? `${index + 1}_${item.fileName}` : item.fileName;
    zip.file(uniqueName, item.blob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
