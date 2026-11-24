// Tiny disclosure-group helper: no framework, just DOM + ARIA.
// Each group has a trigger button and a content element. Clicking the
// trigger (or pressing Enter/Space while focused) flips aria-expanded
// and the content's hidden attribute. The chevron rotates via a CSS class.

export function toggleDisclosure(trigger, content) {
  const expanded = trigger.getAttribute("aria-expanded") === "true";
  trigger.setAttribute("aria-expanded", String(!expanded));
  content.hidden = expanded;
}

export function initDisclosures(root = document) {
  root.querySelectorAll(".ds-disclosure").forEach((group) => {
    const trigger = group.querySelector(".ds-disclosure-trigger");
    const content = group.querySelector(".ds-disclosure-content");
    if (!trigger || !content) return;

    trigger.addEventListener("click", () => toggleDisclosure(trigger, content));
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleDisclosure(trigger, content);
      }
    });
  });
}