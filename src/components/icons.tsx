import {
  AppWindow,
  BookOpen,
  CodeXml,
  Gamepad2,
  Globe,
  Laptop,
  LayoutTemplate,
  Monitor,
  Package,
  Palette,
  Smartphone,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { platformLabel } from "@/lib/config";

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  android: Smartphone,
  windows: Monitor,
  macos: Laptop,
  linux: Terminal,
  web: Globe,
  universal: Package,
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  aplikasi: AppWindow,
  game: Gamepad2,
  "source-code": CodeXml,
  template: LayoutTemplate,
  aset: Palette,
  ebook: BookOpen,
};

export function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const Icon = PLATFORM_ICONS[platform] ?? Package;
  return <Icon className={className} aria-label={platformLabel(platform)} />;
}

export function CategoryIcon({ category, className = "h-5 w-5" }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Package;
  return <Icon className={className} aria-hidden="true" />;
}
