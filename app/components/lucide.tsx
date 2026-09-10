export function Lucide({ svg }: { svg: string }) {
  return <span class="lucide" dangerouslySetInnerHTML={{ __html: svg }} />;
}
