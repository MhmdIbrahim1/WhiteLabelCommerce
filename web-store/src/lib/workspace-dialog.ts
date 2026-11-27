export function openWorkspaceDialog(dialog: HTMLDialogElement, closeButton: HTMLElement, triggerId?: string) {
  const doc = dialog.ownerDocument;
  const opener = doc.activeElement as HTMLElement | null;
  dialog.showModal();
  closeButton.focus({ preventScroll: true });

  return () => {
    dialog.close();
    const canRestore = opener?.isConnected && opener.matches("a[href],button,input,select,[tabindex]") && !opener.matches(":disabled");
    const trigger = triggerId ? doc.getElementById(triggerId) : null;
    const target = canRestore ? opener : trigger ?? doc.getElementById("directory-search") ?? doc.getElementById("workspace-content");
    target?.focus({ preventScroll: true });
  };
}

export function focusBoundary(index: number, count: number, backwards: boolean) {
  if (!count) return null;
  if (backwards && index <= 0) return count - 1;
  if (!backwards && (index < 0 || index === count - 1)) return 0;
  return null;
}
