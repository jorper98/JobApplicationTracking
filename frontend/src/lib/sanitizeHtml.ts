const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BR",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "LI",
  "OL",
  "P",
  "SPAN",
  "STRONG",
  "UL",
]);

const ALLOWED_ATTRS = new Set(["class", "href", "rel", "target", "title"]);

export function sanitizeHtml(html: string) {
  if (typeof window === "undefined" || !html.trim()) return "";
  const template = document.createElement("template");
  template.innerHTML = html;

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      Array.from(element.childNodes).forEach(sanitizeNode);

      if (!ALLOWED_TAGS.has(element.tagName)) {
        element.replaceWith(...Array.from(element.childNodes));
        return;
      }

      Array.from(element.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
        const unsafeHref = name === "href" && (value.startsWith("javascript:") || value.startsWith("data:") || value.startsWith("vbscript:"));
        if (name.startsWith("on") || !ALLOWED_ATTRS.has(name) || unsafeHref) {
          element.removeAttribute(attr.name);
        }
      });

      if (element.tagName === "A") {
        element.setAttribute("rel", "noopener noreferrer");
      }
      return;
    }

    Array.from(node.childNodes).forEach(sanitizeNode);
  };

  sanitizeNode(template.content);
  return template.innerHTML;
}
