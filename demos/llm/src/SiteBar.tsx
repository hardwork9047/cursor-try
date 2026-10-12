const LINKS = [
  { id: "home", href: "/cursor-try/", label: "トップ" },
  { id: "llm", href: "/cursor-try/llm/", label: "LLMベンチ" },
  { id: "yolo", href: "/cursor-try/yolo/", label: "YOLO26" },
] as const;

export function SiteBar({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <div className="topbar">
      <a className="brand" href="/cursor-try/">
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
