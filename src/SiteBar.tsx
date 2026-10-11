const BASE = import.meta.env.BASE_URL;

const LINKS = [
  { id: "home", href: BASE, label: "トップ" },
  { id: "llm", href: `${BASE}llm/`, label: "LLMベンチ" },
  { id: "yolo", href: `${BASE}yolo/`, label: "YOLO26" },
] as const;

export function SiteBar({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <div className="topbar">
      <a className="brand" href={BASE}>
        現場のブラウザ
      </a>
      <nav aria-label="サイト">
        {LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            aria-current={link.id === current ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
