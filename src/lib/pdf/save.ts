/**
 * Shared "write PDF bytes to disk and open it" flow for the PDF exporters.
 *
 * - Desktop / Android: native save dialog.
 * - iOS: Tauri 2 doesn't bridge an iOS save dialog, so write directly to the
 *   app's Documents/exports directory (it appears in the Files app).
 */

/**
 * Save PDF bytes to disk. Returns the saved path, or `{ cancelled: true }` if
 * the user dismissed the save dialog (desktop / Android only).
 */
export async function savePdfBytes(
  bytes: Uint8Array,
  defaultFilename: string,
): Promise<{ path: string } | { cancelled: true }> {
  const { writeFile, exists, mkdir } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  const { isIOS } = await import('@/lib/platform');

  if (isIOS()) {
    const dir = await documentDir();
    const exportsDir = await join(dir, 'exports');
    if (!(await exists(exportsDir))) await mkdir(exportsDir, { recursive: true });
    const filePath = await join(exportsDir, defaultFilename);
    await writeFile(filePath, bytes);
    return { path: filePath };
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const defaultDir = await documentDir().catch(() => '');
  const defaultPath = defaultDir ? await join(defaultDir, defaultFilename) : defaultFilename;

  console.log('[pdf] opening save dialog, defaultPath=', defaultPath);
  const chosen = await save({
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  console.log('[pdf] save dialog returned:', chosen);
  if (!chosen) return { cancelled: true };

  console.log('[pdf] writing file…');
  await writeFile(chosen, bytes);
  console.log('[pdf] file written.');
  return { path: chosen };
}

/** Open a previously-saved PDF in the system default viewer. */
export async function openSavedPdf(path: string): Promise<void> {
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(path);
}
