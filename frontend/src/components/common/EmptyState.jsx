import { PackageSearch } from "lucide-react";
export function EmptyState({ title, description, icon: Icon = PackageSearch, action }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-16 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500"><Icon size={28} /></div><h3 className="text-base font-semibold text-ink-900">{title}</h3>{description && <p className="max-w-xs text-sm text-ink-500">{description}</p>}{action}</div>;
}
