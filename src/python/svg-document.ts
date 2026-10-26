import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";

/** The turtle renderer only needs XML nodes, not a complete browser DOM. */
export function createSvgDocument() {
  const xml = new DOMImplementation().createDocument(
    "http://www.w3.org/2000/svg",
    "svg",
    null,
  );
  const serializer = new XMLSerializer();
  const result = { innerHTML: "" };
  return {
    result,
    document: {
      createElementNS(namespace: string, name: string) {
        const element = xml.createElementNS(namespace, name);
        const set = element.setAttribute.bind(element);
        const setNS = element.setAttributeNS.bind(element);
        element.setAttribute = (key: string, value: string) =>
          set(key, String(value));
        element.setAttributeNS = (
          ns: string | null,
          key: string,
          value: string,
        ) => setNS(ns, key, String(value));
        Object.defineProperty(element, "outerHTML", {
          get: () => serializer.serializeToString(element),
        });
        return element;
      },
      createTextNode: (value: string) => xml.createTextNode(String(value)),
      getElementById: (id: string) => (id === "result" ? result : null),
    },
  };
}
