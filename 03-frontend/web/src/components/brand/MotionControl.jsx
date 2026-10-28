import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";

export function MotionControl() {
  const { locale } = useLocale();
  const [paused, setPaused] = useState(() => document.documentElement.dataset.motion === "paused");
  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "paused" : "active";
  }, [paused]);
  const labels =
    locale === "ar"
      ? ["إيقاف الحركة", "تشغيل الحركة"]
      : locale === "zh-CN"
        ? ["暂停动画", "播放动画"]
        : ["Pause motion", "Play motion"];
  return (
    <button
      className="motion-control"
      type="button"
      aria-label={labels[paused ? 1 : 0]}
      title={labels[paused ? 1 : 0]}
      aria-pressed={paused}
      onClick={() => setPaused(!paused)}
    >
      {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
    </button>
  );
}
