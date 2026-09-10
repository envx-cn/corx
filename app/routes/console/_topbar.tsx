export function Topbar(props: { title: string }) {
  return (
    <div class="navbar bg-base-100 border-b border-base-300 sticky top-0 z-30 min-h-14">
      <div class="flex-none lg:hidden">
        <label for="console-drawer" class="btn btn-square btn-ghost" aria-label="Open sidebar">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </label>
      </div>
      <div class="flex-1">
        <span class="text-sm opacity-60">corx / </span>
        <b class="text-sm">{props.title}</b>
      </div>
    </div>
  );
}
