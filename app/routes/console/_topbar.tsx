export function Topbar(props: { title: string }) {
  return (
    <header class="topbar">
      <span class="crumb">
        corx / <b>{props.title}</b>
      </span>
    </header>
  );
}
