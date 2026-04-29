import { Eye } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { useAccessibilitySettings, type AdminFontScale, type AdminContrast } from "@/lib/useAccessibilitySettings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ADMIN_I18N_KEYS, t } from "@/lib/i18nKeys";

/**
 * Admin Accessibility Settings — front-end-only knobs that adjust font
 * scale, contrast, and motion preference. Backed by
 * `useAccessibilitySettings` + the `data-admin-*` attributes wired into
 * `index.css`.
 *
 * Closes the "Accessibility Settings (Category 21)" deferral by giving
 * admins an in-app surface to toggle the WCAG affordances without a
 * design-system overhaul.
 */
export default function AccessibilityPage() {
  const { settings, setFontScale, setContrast, setReduceMotion, reset } =
    useAccessibilitySettings();

  const fontOptions: Array<{ value: AdminFontScale; label: string }> = [
    { value: 0.875, label: "Small (87.5%)" },
    { value: 1, label: "Default (100%)" },
    { value: 1.125, label: "Large (112.5%)" },
    { value: 1.25, label: "Extra Large (125%)" },
  ];

  const contrastOptions: Array<{ value: AdminContrast; label: string }> = [
    { value: "normal", label: "Normal" },
    { value: "high", label: "High contrast (WCAG AAA)" },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        icon={Eye}
        title={t(ADMIN_I18N_KEYS.settings.accessibility, "Accessibility")}
        subtitle="Personalise how the admin renders for low-vision and motion-sensitive users. Settings are saved to this browser only."
        iconBgClass="bg-slate-100"
        iconColorClass="text-slate-600"
      />

      <Card className="p-5">
        <div role="radiogroup" aria-labelledby="font-scale-label">
          <p id="font-scale-label" className="font-semibold text-sm mb-3">
            Text size
          </p>
          <div className="flex flex-wrap gap-2">
            {fontOptions.map(opt => (
              <Button
                key={opt.value}
                role="radio"
                aria-checked={settings.fontScale === opt.value}
                variant={settings.fontScale === opt.value ? "default" : "outline"}
                onClick={() => setFontScale(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div role="radiogroup" aria-labelledby="contrast-label">
          <p id="contrast-label" className="font-semibold text-sm mb-3">
            Contrast
          </p>
          <div className="flex flex-wrap gap-2">
            {contrastOptions.map(opt => (
              <Button
                key={opt.value}
                role="radio"
                aria-checked={settings.contrast === opt.value}
                variant={settings.contrast === opt.value ? "default" : "outline"}
                onClick={() => setContrast(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="reduce-motion" className="font-semibold text-sm">
              Reduce motion
            </Label>
            <p className="text-xs text-gray-500 mt-1">
              Disables animations and transitions across the admin panel.
              Honours the system <code>prefers-reduced-motion</code> setting too.
            </p>
          </div>
          <Switch
            id="reduce-motion"
            checked={settings.reduceMotion}
            onCheckedChange={setReduceMotion}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={reset}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
