export async function readPuzzleImage(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a photograph smaller than 5 MB.");
  if (!/\.(jpe?g|png|webp)$/i.test(file.name))
    throw new Error("Choose a JPG, PNG, or WebP image.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new Error("This file is not a valid JPG, PNG, or WebP image.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("We couldn’t read this photograph. Try another image.");
  });
  if (
    bitmap.width < 240 ||
    bitmap.height < 180 ||
    bitmap.width * bitmap.height > 48_000_000
  ) {
    bitmap.close();
    throw new Error(
      "Choose an image at least 240 × 180 pixels and smaller than 48 megapixels.",
    );
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Your browser couldn’t prepare this photograph.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}
