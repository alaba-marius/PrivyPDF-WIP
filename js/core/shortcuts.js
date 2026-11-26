// Keyboard shortcuts for the editor. Ignored while the user is typing in an
// input, textarea, select or contenteditable element.
//
// matchShortcut is pure so the key matching can be tested without dispatching
// real keys. Modifiers: ctrlKey or metaKey. Keys are compared
// case-insensitively. The shift variant is checked before the plain one, so
// Caps Lock (which upper-cases event.key without setting shiftKey) cannot turn
// redo into undo.
export function matchShortcut(eventLike) {
  const key = String(eventLike.key || "").toLowerCase();
  const mod = eventLike.ctrlKey || eventLike.metaKey;
  const shift = eventLike.shiftKey;

  if (mod && shift && key === "z") return "redo";
  if (mod && key === "z") return "undo";
  if (mod && key === "y") return "redo";
  if (mod && key === "s") return "download";
  if (key === "r") return "rotate";
  if (key === "delete") return "delete";
  return null;
}

export function registerShortcuts({
  onRotate,
  onDelete,
  onDuplicate,
  onUndo,
  onRedo,
  onDownload,
  // When false, page-level actions (rotate/delete/duplicate) are ignored.
  // Undo, redo and download always stay enabled. The annotate view passes
  // `() => getState().view !== "annotate"` so its own handlers own Delete/Backspace.
  isPageShortcutsEnabled,
}) {
  function isTyping(target) {
    return (
      target &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")
    );
  }
  const pageActionsEnabled = () => isPageShortcutsEnabled?.() !== false;

  window.addEventListener("keydown", (event) => {
    if (isTyping(event.target)) return;

    const action = matchShortcut(event);
    if (!action) return;
    event.preventDefault();

    if (action === "rotate") {
      if (pageActionsEnabled()) onRotate?.();
    } else if (action === "delete") {
      if (pageActionsEnabled()) onDelete?.();
    } else if (action === "duplicate") {
      if (pageActionsEnabled()) onDuplicate?.();
    } else if (action === "undo") onUndo?.();
    else if (action === "redo") onRedo?.();
    else if (action === "download") onDownload?.();
  });
}
