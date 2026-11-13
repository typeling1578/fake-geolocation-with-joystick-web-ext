import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
// @ts-expect-error: use @wxt-dev/i18n, see: https://wxt.dev/i18n#with-wxt
import { i18n } from "#i18n";
import {
  DEFAULT_SPEED_MPS,
  MAX_SPEED_MPS,
  SPEED_PRESETS,
  isValidSpeed,
  type SpeedPreset,
} from "@/lib/movement.ts";

const PRESET_ORDER: SpeedPreset[] = ["walk", "run", "bicycle", "car"];

function mpsToKmh(mps: number) {
  return Math.round(mps * 3.6 * 10) / 10;
}

function kmhToMps(kmh: number) {
  return kmh / 3.6;
}

/** Popup control for the joystick movement speed (stored as `moveSpeed` in m/s). */
export default function SpeedSelector() {
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED_MPS);
  const [input, setInput] = useState<string>(String(mpsToKmh(DEFAULT_SPEED_MPS)));

  useEffect(() => {
    browser.storage.local.get("moveSpeed").then((data) => {
      const stored = isValidSpeed(data.moveSpeed) ? data.moveSpeed : DEFAULT_SPEED_MPS;
      setSpeed(stored);
      setInput(String(mpsToKmh(stored)));
    });
  }, []);

  function save(mps: number) {
    setSpeed(mps);
    setInput(String(mpsToKmh(mps)));
    browser.storage.local.set({ moveSpeed: mps });
  }

  function commitInput() {
    const kmh = Number(input);
    const mps = kmhToMps(kmh);
    if (input.trim() !== "" && isValidSpeed(mps)) {
      save(mps);
    } else {
      setInput(String(mpsToKmh(speed)));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[1.2rem] font-bold">{i18n.t("speedSelector.title")}</h2>
      <p className="text-[0.8rem]">{i18n.t("speedSelector.hint")}</p>
      <div className="flex flex-wrap justify-center gap-1">
        {PRESET_ORDER.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={Math.abs(speed - SPEED_PRESETS[preset]) < 1e-9 ? "default" : "outline"}
            aria-pressed={Math.abs(speed - SPEED_PRESETS[preset]) < 1e-9}
            onClick={() => save(SPEED_PRESETS[preset])}
          >
            {i18n.t(`speedSelector.presets.${preset}`)}
          </Button>
        ))}
      </div>
      <label className="flex items-center justify-center gap-2 text-sm">
        <input
          type="number"
          inputMode="decimal"
          min={0.1}
          max={mpsToKmh(MAX_SPEED_MPS)}
          step={0.1}
          className="w-20 rounded-md border px-2 py-1 text-right"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commitInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitInput();
            }
          }}
        />
        km/h
      </label>
    </div>
  );
}
