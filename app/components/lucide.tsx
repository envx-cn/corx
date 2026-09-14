export function Lucide({ svg }: { svg: string }) {
  // Icons are always decorative here — the adjacent text carries the meaning.
  return <span class="lucide" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
