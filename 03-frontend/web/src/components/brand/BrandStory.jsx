import { ArrowUpRight, Compass, ShoppingBag, Store } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext.jsx";
import { BrandPixels } from "./BrandMark.jsx";

const copy = {
  ar: {
    label: "عالم Restrova",
    eyebrow: "نصنع معك الحكاية",
    first: "مطعمك.",
    second: "قصّة نجاح.",
    description: "من تفاصيل يومك إلى خطوتك الجاية، خلّ الصورة أوضح مع Restrova.",
    note: "بيانات أوضح. قرارات أذكى.",
    assistant: "كل تفصيلة تصنع فرقًا.",
    available: "متاح الآن",
    soon: "قريبًا",
    business: "افهم مطعمك",
    market: "وسّع خياراتك",
    discover: "اكتشف الجديد",
    footer: "إدارة. تواصل. اكتشاف."
  },
  en: {
    label: "The Restrova world",
    eyebrow: "THE RESTROVA WAY",
    first: "GOOD FOOD.",
    second: "GREAT DECISIONS.",
    description: "A little more clarity for your everyday. A lot more possibility for your restaurant.",
    note: "YOUR NEXT CHAPTER STARTS HERE.",
    assistant: "GOOD TASTE. CLEAR THINKING.",
    available: "Available now",
    soon: "Coming soon",
    business: "Know your restaurant",
    market: "Explore your options",
    discover: "Find something new",
    footer: "Manage. Connect. Discover."
  },
  "zh-CN": {
    label: "Restrova 的世界",
    eyebrow: "与 RESTROVA 一起",
    first: "好味道。",
    second: "好决策。",
    description: "看清经营的每一天，让餐厅拥有更多可能。",
    note: "数据更清晰，决策更明智。",
    assistant: "每个细节，都有价值。",
    available: "现已可用",
    soon: "即将推出",
    business: "了解你的餐厅",
    market: "探索更多选择",
    discover: "发现新鲜事物",
    footer: "经营。连接。发现。"
  }
};

export function BrandStory() {
  const { locale } = useLocale();
  const c = copy[locale] || copy.en;
  return (
    <aside className="brand-story" aria-label={c.label}>
      <div className="brand-story__masthead">
        <span>{c.eyebrow}</span>
        <BrandPixels />
      </div>
      <div className="brand-story__intro">
        <h2>
          <span>{c.first}</span>
          <span>{c.second}</span>
        </h2>
        <p>{c.description}</p>
      </div>
      <div className="brand-story__art">
        <span className="brand-story__orbit" aria-hidden="true" />
        <span className="brand-story__callout">
          <span aria-hidden="true" /> {c.assistant}
        </span>
        <img
          src="/images/restrova/restaurant-still-life.webp"
          alt=""
          width="1536"
          height="1024"
          fetchPriority="high"
          decoding="async"
        />
        <p className="brand-story__art-note">
          <ArrowUpRight size={15} aria-hidden="true" /> {c.note}
        </p>
      </div>
      <div className="brand-family" aria-label={c.label}>
        {[
          [Store, "Business", c.business, c.available, "business"],
          [ShoppingBag, "Market", c.market, c.soon, "market"],
          [Compass, "Discover", c.discover, c.soon, "discover"]
        ].map(([Icon, name, description, status, id]) => (
          <div className={`brand-family__product brand-family__product--${id}`} key={id}>
            <Icon size={19} aria-hidden="true" />
            <strong lang="en" dir="ltr">
              {name}
            </strong>
            <span>{description}</span>
            <small>{status}</small>
          </div>
        ))}
      </div>
      <div className="brand-story__footer">
        <span>{c.footer}</span>
        <span lang="en" dir="ltr">
          RESTROVA /
        </span>
      </div>
    </aside>
  );
}
